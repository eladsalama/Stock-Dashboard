import { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  baseCcy: z.string().min(3).max(6).default("USD"),
  userEmail: z.string().email().optional(),
});

const portfoliosRoutes: FastifyPluginAsync = async (app) => {
  // List portfolios (existing in server too; keeping here for cohesion)
  app.get("/v1/portfolios", async () => {
    const portfolios = await app.prisma.portfolio.findMany({ include: { positions: true, trades: false } });
    return { portfolios };
  });

  // Create portfolio (assoc to a user; if email provided, upsert user)
  app.post("/v1/portfolios", async (req, reply) => {
    const parse = createSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: "Invalid body", details: parse.error.flatten() });
    }
    const { name, baseCcy, userEmail } = parse.data;

    let userId: string | undefined;
    if (userEmail) {
      const user = await app.prisma.user.upsert({
        where: { email: userEmail },
        update: {},
        create: { email: userEmail },
      });
      userId = user.id;
    } else {
      // Fallback: create an anonymous user per portfolio for now (until Cognito)
      const anon = await app.prisma.user.create({
        data: { email: `anon+${Date.now()}@example.local` },
      });
      userId = anon.id;
    }

    const portfolio = await app.prisma.portfolio.create({
      data: { userId, name, baseCcy },
      include: { positions: true },
    });

    return reply.code(201).send({ portfolio });
  });

  // Get by id
  app.get("/v1/portfolios/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
  const p = await app.prisma.portfolio.findUnique({ where: { id }, include: { positions: true, trades: false } });
    if (!p) return reply.code(404).send({ error: "Not found" });
    return { portfolio: p };
  });

  // List recent ingestion runs for a portfolio
  app.get("/v1/portfolios/:id/ingests", async (req, reply) => {
    const { id } = req.params as { id: string };
    const exists = await app.prisma.portfolio.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: "Not found" });
    const ingests = await app.prisma.$queryRaw<Array<{ id: string; objectKey: string; status: string; rowsOk: number; rowsFailed: number; startedAt: Date; finishedAt: Date | null }>>`
      SELECT id, "objectKey", status, "rowsOk", "rowsFailed", "startedAt", "finishedAt"
      FROM "IngestRun"
      WHERE "portfolioId" = ${id}
      ORDER BY "startedAt" DESC
      LIMIT 20
    `;
    return { ingests };
  });

  // Update (partial)
  const patchSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    baseCcy: z.string().min(3).max(6).optional(),
  });

  app.patch("/v1/portfolios/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = patchSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: "Invalid body", details: parse.error.flatten() });
    }
    const data = parse.data;
    try {
      const updated = await app.prisma.portfolio.update({ where: { id }, data });
      return { portfolio: updated };
    } catch {
      return reply.code(404).send({ error: "Not found" });
    }
  });

  // Delete
  app.delete("/v1/portfolios/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await app.prisma.portfolio.delete({ where: { id } });
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "Not found" });
    }
  });
};

export default portfoliosRoutes;
