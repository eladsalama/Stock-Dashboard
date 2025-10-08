import { FastifyPluginAsync } from "fastify";
import { PrismaClient } from "@prisma/client";
type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;
import { z } from "zod";
import { computePortfolioAnalytics } from "services/analytics";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  baseCcy: z.string().min(3).max(6).default("USD"),
  userEmail: z.string().email().optional(),
});

const portfoliosRoutes: FastifyPluginAsync = async (app) => {
  // List portfolios (existing in server too; keeping here for cohesion)
  app.get("/v1/portfolios", { preHandler: app.requireAuth }, async (req) => {
    // List only portfolios owned by auth user
    const portfolios = await app.prisma.portfolio.findMany({
      where: { userId: req.authUser?.userId },
      select: {
        id: true,
        name: true,
        baseCcy: true,
        createdAt: true,
        lastIngestAt: true,
        lastIngestStatus: true,
        positions: { select: { id: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return { portfolios };
  });

  // Create portfolio (assoc to a user; if email provided, upsert user)
  app.post("/v1/portfolios", { preHandler: app.requireAuth }, async (req, reply) => {
    const parse = createSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: "Invalid body", details: parse.error.flatten() });
    }
    const { name, baseCcy } = parse.data;

    // Always use the authenticated user's ID
    const userId = req.authUser?.userId;
    if (!userId) {
      return reply.code(401).send({ error: "No authenticated user" });
    }

    req.log.debug({ userId, name }, "Creating portfolio for authenticated user");

    const portfolio = await app.prisma.portfolio.create({
      data: { userId, name, baseCcy },
      include: { positions: true },
    });

    return reply.code(201).send({ portfolio });
  });

  // Get by id
  app.get("/v1/portfolios/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = await app.prisma.portfolio.findUnique({
      where: { id },
      include: { positions: true, trades: false },
    });
    if (!p) return reply.code(404).send({ error: "Not found" });
    if (p.userId !== req.authUser?.userId) return reply.code(403).send({ error: "forbidden" });
    return { portfolio: p };
  });

  // List recent ingestion runs for a portfolio
  app.get("/v1/portfolios/:id/ingests", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const exists = await app.prisma.portfolio.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!exists) return reply.code(404).send({ error: "Not found" });
    if (exists.userId !== req.authUser?.userId) return reply.code(403).send({ error: "forbidden" });
    const ingests = await app.prisma.$queryRaw<
      Array<{
        id: string;
        objectKey: string;
        status: string;
        rowsOk: number;
        rowsFailed: number;
        startedAt: Date;
        finishedAt: Date | null;
      }>
    >`
      SELECT id, "objectKey", status, "rowsOk", "rowsFailed", "startedAt", "finishedAt"
      FROM "IngestRun"
      WHERE "portfolioId" = ${id}
      ORDER BY "startedAt" DESC
      LIMIT 20
    `;
    return { ingests };
  });

  // Positions only (lighter payload for polling)
  app.get("/v1/portfolios/:id/positions", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const exists = await app.prisma.portfolio.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!exists) return reply.code(404).send({ error: "Not found" });
    if (exists.userId !== req.authUser?.userId) return reply.code(403).send({ error: "forbidden" });
    const positions = await app.prisma.position.findMany({ where: { portfolioId: id } });
    // Normalize Decimal -> number for client convenience
    const normalized = positions.map((p: (typeof positions)[number]) => ({
      ...p,
      quantity: Number(p.quantity),
      avgCost: Number(p.avgCost),
    }));
    return { positions: normalized };
  });

  // Create position
  const positionCreateSchema = z.object({
    symbol: z.string().min(1).max(15).toUpperCase(),
    quantity: z.number().finite(),
    avgCost: z.number().finite(),
  });
  app.post("/v1/portfolios/:id/positions", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const portfolio = await app.prisma.portfolio.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!portfolio) return reply.code(404).send({ error: "Not found" });
    if (portfolio.userId !== req.authUser?.userId)
      return reply.code(403).send({ error: "forbidden" });
    const parse = positionCreateSchema.safeParse(req.body);
    if (!parse.success)
      return reply.code(400).send({ error: "Invalid body", details: parse.error.flatten() });
    const { symbol, quantity, avgCost } = parse.data;
    // proceed
    try {
      const position = await app.prisma.position.create({
        data: { portfolioId: id, symbol, quantity, avgCost },
      });
      const normalized = {
        ...position,
        quantity: Number(position.quantity),
        avgCost: Number(position.avgCost),
      };
      return reply.code(201).send({ position: normalized });
    } catch (e) {
      if (typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002") {
        return reply.code(409).send({ error: "Position for symbol already exists" });
      }
      throw e;
    }
  });

  // Update position
  const positionPatchSchema = z
    .object({
      quantity: z.number().finite().optional(),
      avgCost: z.number().finite().optional(),
    })
    .refine((d) => d.quantity !== undefined || d.avgCost !== undefined, {
      message: "No fields supplied",
    });
  app.patch("/v1/positions/:positionId", { preHandler: app.requireAuth }, async (req, reply) => {
    const { positionId } = req.params as { positionId: string };
    const parse = positionPatchSchema.safeParse(req.body);
    if (!parse.success)
      return reply.code(400).send({ error: "Invalid body", details: parse.error.flatten() });
    try {
      const existing = await app.prisma.position.findUnique({
        where: { id: positionId },
        select: { id: true, portfolio: { select: { userId: true } } },
      });
      if (!existing) return reply.code(404).send({ error: "Not found" });
      if (existing.portfolio.userId !== req.authUser?.userId)
        return reply.code(403).send({ error: "forbidden" });
      const updated = await app.prisma.position.update({
        where: { id: positionId },
        data: parse.data,
      });
      const normalized = {
        ...updated,
        quantity: Number(updated.quantity),
        avgCost: Number(updated.avgCost),
      };
      return { position: normalized };
    } catch {
      return reply.code(404).send({ error: "Not found" });
    }
  });

  // Delete position
  app.delete("/v1/positions/:positionId", { preHandler: app.requireAuth }, async (req, reply) => {
    const { positionId } = req.params as { positionId: string };
    try {
      const existing = await app.prisma.position.findUnique({
        where: { id: positionId },
        select: { id: true, portfolio: { select: { userId: true } } },
      });
      if (!existing) return reply.code(404).send({ error: "Not found" });
      if (existing.portfolio.userId !== req.authUser?.userId)
        return reply.code(403).send({ error: "forbidden" });
      await app.prisma.position.delete({ where: { id: positionId } });
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "Not found" });
    }
  });

  // Export positions CSV
  app.get(
    "/v1/portfolios/:id/positions:csv",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const portfolio = await app.prisma.portfolio.findUnique({
        where: { id },
        select: { id: true, name: true, userId: true },
      });
      if (!portfolio) return reply.code(404).send({ error: "Not found" });
      if (portfolio.userId !== req.authUser?.userId)
        return reply.code(403).send({ error: "forbidden" });
      const positions = await app.prisma.position.findMany({ where: { portfolioId: id } });
      const rows = [["symbol", "quantity", "avgCost"]];
      for (const p of positions) rows.push([p.symbol, String(p.quantity), String(p.avgCost)]);
      const csv = rows.map((r) => r.join(",")).join("\n");
      reply.header("Content-Type", "text/csv");
      reply.header(
        "Content-Disposition",
        `attachment; filename="${portfolio.name.replace(/[^a-z0-9-_]/gi, "_")}_positions.csv"`,
      );
      return reply.send(csv);
    },
  );

  // Import positions CSV (upsert merge). Simple format: symbol,quantity,avgCost (header optional)
  app.post(
    "/v1/portfolios/:id/positions:import",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const portfolio = await app.prisma.portfolio.findUnique({
        where: { id },
        select: { id: true, userId: true },
      });
      if (!portfolio) return reply.code(404).send({ error: "Not found" });
      if (portfolio.userId !== req.authUser?.userId)
        return reply.code(403).send({ error: "forbidden" });
      const ct = req.headers["content-type"] || "";
      if (!ct.includes("text/csv")) {
        return reply.code(415).send({ error: "Expected text/csv" });
      }
      const bodyUnknown = (await req.body) as unknown;
      const text =
        typeof bodyUnknown === "string"
          ? bodyUnknown
          : typeof (bodyUnknown as { toString?: (enc?: string) => string })?.toString === "function"
            ? (bodyUnknown as { toString: (enc?: string) => string }).toString("utf8")
            : undefined;
      if (!text) return reply.code(400).send({ error: "Empty body" });
      const lines: string[] = text
        .split(/\r?\n/)
        .map((l: string) => l.trim())
        .filter((l: string) => l.length);
      if (!lines.length) return reply.code(400).send({ error: "No rows" });
      const out: Array<{ symbol: string; quantity: number; avgCost: number }> = [];
      for (let i = 0; i < lines.length; i++) {
        const row = lines[i].split(",").map((c: string) => c.trim());
        if (i === 0 && /symbol/i.test(row[0]) && /quantity|qty/i.test(row[1] || "")) {
          continue; // header
        }
        if (row.length < 3) continue;
        const [symbolRaw, qtyRaw, costRaw] = row;
        const symbol = symbolRaw.toUpperCase();
        const quantity = Number(qtyRaw);
        const avgCost = Number(costRaw);
        if (!symbol || !isFinite(quantity) || !isFinite(avgCost)) continue;
        out.push({ symbol, quantity, avgCost });
      }
      if (!out.length) return reply.code(400).send({ error: "No valid rows" });
      // Create ingest run (synchronous fallback path) so UI still shows history
      const runId = crypto.randomUUID();
      await app.prisma.$executeRawUnsafe(
        'INSERT INTO "IngestRun" (id, "portfolioId", "objectKey", status) VALUES ($1,$2,$3,$4)',
        runId,
        id,
        `direct-upload/${Date.now()}`,
        "pending",
      );
      // Use transaction upsert
      await app.prisma.$transaction(async (tx: TxClient) => {
        for (const r of out) {
          const existing = await tx.position.findFirst({
            where: { portfolioId: id, symbol: r.symbol },
          });
          if (existing) {
            await tx.position.update({
              where: { id: existing.id },
              data: { quantity: r.quantity, avgCost: r.avgCost },
            });
          } else {
            await tx.position.create({
              data: { portfolioId: id, symbol: r.symbol, quantity: r.quantity, avgCost: r.avgCost },
            });
          }
        }
        await tx.$executeRawUnsafe(
          'UPDATE "IngestRun" SET status=$1, "rowsOk"=$2, "rowsFailed"=$3, "finishedAt"=$4 WHERE id=$5',
          "ok",
          out.length,
          0,
          new Date(),
          runId,
        );
      });
      return { imported: out.length, runId };
    },
  );

  // Update (partial)
  const patchSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    baseCcy: z.string().min(3).max(6).optional(),
  });

  app.patch("/v1/portfolios/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = patchSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: "Invalid body", details: parse.error.flatten() });
    }
    const data = parse.data;
    try {
      const existing = await app.prisma.portfolio.findUnique({
        where: { id },
        select: { id: true, userId: true },
      });
      if (!existing) return reply.code(404).send({ error: "Not found" });
      if (existing.userId !== req.authUser?.userId)
        return reply.code(403).send({ error: "forbidden" });
      const updated = await app.prisma.portfolio.update({ where: { id }, data });
      return { portfolio: updated };
    } catch {
      return reply.code(404).send({ error: "Not found" });
    }
  });

  // Delete
  app.delete("/v1/portfolios/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const exists = await app.prisma.portfolio.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!exists) return reply.code(404).send({ error: "Not found" });
    if (exists.userId !== req.authUser?.userId) return reply.code(403).send({ error: "forbidden" });
    // Manual cascade: delete dependents first to avoid FK failures interpreted as 404
    try {
      await app.prisma.$transaction(async (tx: TxClient) => {
        await tx.position.deleteMany({ where: { portfolioId: id } });
        await tx.trade.deleteMany({ where: { portfolioId: id } });
        // Delete ingests (IngestRun) by raw SQL for simplicity (delegate name may differ depending on Prisma version)
        await tx.$executeRawUnsafe(`DELETE FROM "IngestRun" WHERE "portfolioId" = $1`, id);
        await tx.portfolio.delete({ where: { id } });
      });
      return reply.code(204).send();
    } catch (e) {
      app.log.error({ err: e }, "Failed to cascade delete portfolio");
      return reply.code(500).send({ error: "Delete failed" });
    }
  });
  // Analytics endpoint (secured)
  app.get("/v1/portfolios/:id/analytics", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const portfolio = await app.prisma.portfolio.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!portfolio) return reply.code(404).send({ error: "Not found" });
    if (portfolio.userId !== req.authUser?.userId)
      return reply.code(403).send({ error: "forbidden" });
    const analytics = await computePortfolioAnalytics(id, app.prisma);
    return { analytics };
  });
};

export default portfoliosRoutes;
