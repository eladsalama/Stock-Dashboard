import fp from "fastify-plugin";
import IORedis from "ioredis";
import type { Redis as RedisType } from "ioredis";
import { env } from "../env";

export default fp(async (app) => {
  const url = env.REDIS_URL ?? "redis://localhost:6379";
  const redis = new IORedis(url);

  redis.on("error", (err) => app.log.error({ err }, "redis error"));

  app.decorate("redis", redis);

  app.addHook("onClose", async () => {
    try {
      await redis.quit();
    } catch {
      /* noop */
    }
  });
});

declare module "fastify" {
  interface FastifyInstance {
    redis: RedisType;
  }
}
