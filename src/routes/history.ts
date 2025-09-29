import { FastifyPluginAsync } from "fastify";
import { fetchHistory, type Range } from "../services/history";

const TTL: Record<Range, number> = { "1d": 30, "1w": 60, "1m": 300, "1y": 1800, "5y": 3600 };

const historyRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/v1/quotes/:symbol/history",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { symbol } = req.params as { symbol: string };
      const { range = "1m" } = (req.query ?? {}) as { range?: Range };

      const r = (["1d","1w","1m","1y","5y"] as Range[]).includes(range as Range)
        ? (range as Range)
        : "1m";

      const key = `hist:${symbol.toUpperCase()}:${r}`;
      const cached = await app.redis.get(key);
      if (cached) return reply.send({ ...JSON.parse(cached), cached: true });

      const series = await fetchHistory(symbol, r);
      await app.redis.set(key, JSON.stringify(series), "EX", TTL[r]);
      return { ...series, cached: false };
    }
  );
};

export default historyRoutes;
