import Fastify from "fastify";
import cors from "@fastify/cors";
import { env, loadDotEnv } from "./env";
import prismaPlugin from "./plugins/prisma";
import rateLimit from "@fastify/rate-limit";
import redisPlugin from "./plugins/redis";
import quotesRoutes from "./routes/quotes";
import historyRoutes from "./routes/history";
import portfoliosRoutes from "./routes/portfolios";
import uploadsRoutes from "./routes/uploads";

loadDotEnv();

export async function buildServer() {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
  });

  await app.register(cors, { origin: env.CORS_ORIGIN });
  await app.register(prismaPlugin);
  await app.register(rateLimit, { global: false }); // we'll enable per-route
  await app.register(redisPlugin);
  await app.register(quotesRoutes);
  await app.register(historyRoutes);
  await app.register(portfoliosRoutes);
  await app.register(uploadsRoutes);

  app.get("/healthz", async () => ({ ok: true }));

  app.register(async (instance) => {
    instance.get("/v1/hello", async () => ({ message: "Stock Dashboard API v1" }));
  });

  // portfolios routes now registered in routes/portfolios.ts

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
