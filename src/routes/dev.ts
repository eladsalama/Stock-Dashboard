import { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { ingestCsvFromS3 } from "../services/ingest";

const bodySchema = z.object({
  portfolioId: z.string().min(1),
  key: z.string().min(1),
});

const devRoutes: FastifyPluginAsync = async (app) => {
  // Dev-only ingestion trigger. In production, S3->SQS->Worker should handle this.
  app.post("/v1/dev/ingest", async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten() });
    }
    const { portfolioId, key } = parsed.data;
    const result = await ingestCsvFromS3(portfolioId, key, app.prisma);
    return { ok: true, result };
  });
};

export default devRoutes;
