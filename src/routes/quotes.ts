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

  // Batch quotes: ?symbols=MSFT,AAPL,GOOG
  app.get('/v1/quotes', async (req, reply) => {
    const q = (req.query as { symbols?: string }).symbols;
    if (!q) return reply.code(400).send({ error: 'symbols query param required' });
    const symbols = q.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (!symbols.length) return reply.code(400).send({ error: 'no symbols parsed' });
  interface QuoteResult { price?: number; previousClose?: number; [k: string]: unknown; cached?: boolean; error?: string }
  const results: Record<string, QuoteResult> = {};
    for (const sym of symbols) {
      try {
        const key = `quote:${sym}`;
        const cached = await app.redis.get(key);
        if (cached) {
          results[sym] = { ...JSON.parse(cached), cached: true };
          continue;
        }
  const quote = await fetchYahooQuote(sym);
        await app.redis.set(key, JSON.stringify(quote), 'EX', TTL_SECONDS);
        results[sym] = { ...quote, cached: false };
      } catch (err) {
        results[sym] = { error: err instanceof Error ? err.message : String(err) };
      }
    }
    return { quotes: results };
  });

  // Historical route moved to routes/history.ts with caching & validated ranges.
};

export default quotesRoutes;
