import Fastify from "fastify";
import { randomUUID } from "crypto";
import type { FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { env, loadDotEnv } from "./env";
import prismaPlugin from "./plugins/prisma";
import rateLimit from "@fastify/rate-limit";
import redisPlugin from "./plugins/redis";
import quotesRoutes from "./routes/quotes";
import historyRoutes from "./routes/history";
import portfoliosRoutes from "./routes/portfolios";
import uploadsRoutes from "./routes/uploads";
import devRoutes from "./routes/dev";
import exploreRoutes from "./routes/explore";
import awsDevPlugin from "./plugins/aws-dev";
import authPlugin from "./plugins/auth";
import authRoutes from "routes/auth";

loadDotEnv();

function getGitHash(): string | undefined {
  return (
    process.env.GIT_HASH || process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_SHA || undefined
  );
}

export async function buildServer() {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
  });

  // Request ID middleware (adds x-request-id header + logger child)
  app.addHook("onRequest", async (req, reply) => {
    const incoming = req.headers["x-request-id"];
    const id = typeof incoming === "string" && incoming.trim() ? incoming : randomUUID();
    (req as FastifyRequest & { requestId: string }).requestId = id; // annotate request
    reply.header("x-request-id", id);
    req.log = req.log.child({ requestId: id });
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
    credentials: true,
  });
  await app.register(prismaPlugin);
  await app.register(rateLimit, { global: false }); // we'll enable per-route
  await app.register(redisPlugin);
  await app.register(authPlugin);
  await app.register(authRoutes);
  // Dev-only LocalStack wiring (safe no-op in production)
  await app.register(awsDevPlugin);

  // Support CSV uploads (import positions) - Fastify returns 415 if no parser
  app.addContentTypeParser("text/csv", { parseAs: "string" }, (req, body, done) => {
    done(null, body);
  });

  await app.register(quotesRoutes);
  await app.register(historyRoutes);
  await app.register(portfoliosRoutes);
  await app.register(uploadsRoutes);
  await app.register(devRoutes);
  await app.register(exploreRoutes);

  app.get("/healthz", async () => ({ ok: true }));
  app.get("/version", async () => ({
    version: getGitHash() || "dev",
    node: process.version,
    ts: Date.now(),
  }));

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
