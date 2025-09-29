import { FastifyPluginAsync } from "fastify";
import { fetchYahooQuote } from "../services/quotes";

const TTL_SECONDS = 15;

const quotesRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/v1/quotes/:symbol",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" },
      },
    },
    async (req) => {
      const { symbol } = req.params as { symbol: string };
      const key = `quote:${symbol.toUpperCase()}`;

      const cached = await app.redis.get(key);
      if (cached) return { ...JSON.parse(cached), cached: true };

      const quote = await fetchYahooQuote(symbol);
      await app.redis.set(key, JSON.stringify(quote), "EX", TTL_SECONDS);
      return { ...quote, cached: false };
    }
  );
};

export default quotesRoutes;
