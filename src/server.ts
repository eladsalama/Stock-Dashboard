import Fastify from "fastify";
import cors from "@fastify/cors";
import { env, loadDotEnv } from "./env";
import prismaPlugin from "./plugins/prisma";

loadDotEnv();

export async function buildServer() {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
  });

  await app.register(cors, { origin: env.CORS_ORIGIN });
  await app.register(prismaPlugin);

  app.get("/healthz", async () => ({ ok: true }));

  app.register(async (instance) => {
    instance.get("/v1/hello", async () => ({ message: "Stock Dashboard API v1" }));
  });

  app.get("/v1/portfolios", async () => {
    const portfolios = await app.prisma.portfolio.findMany({
      include: { positions: true },
    });
    return { portfolios };
  });

  return app;
}

if (require.main === module) {
  (async () => {
    const app = await buildServer();
    try {
      await app.listen({ port: env.PORT, host: "0.0.0.0" });
      app.log.info(`HTTP server listening on ${env.PORT}`);
    } catch (err) {
      app.log.error(err);
      process.exit(1);
    }
  })();
}
