import { FastifyPluginAsync } from "fastify";
import { fetchYahooQuote } from "../services/quotes";
import { fetchYahooStats } from "../services/stats";
import { fetchYahooNews } from "../services/news";
import yahooFinance from "yahoo-finance2";

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
    },
  );

  // Batch quotes: ?symbols=MSFT,AAPL,GOOG
  app.get("/v1/quotes", async (req, reply) => {
    const q = (req.query as { symbols?: string }).symbols;
    if (!q) return reply.code(400).send({ error: "symbols query param required" });
    const symbols = q
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (!symbols.length) return reply.code(400).send({ error: "no symbols parsed" });
    interface QuoteResult {
      price?: number;
      previousClose?: number;
      [k: string]: unknown;
      cached?: boolean;
      error?: string;
    }
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
        await app.redis.set(key, JSON.stringify(quote), "EX", TTL_SECONDS);
        results[sym] = { ...quote, cached: false };
      } catch (err) {
        results[sym] = { error: err instanceof Error ? err.message : String(err) };
      }
    }
    return { quotes: results };
  });

  // Expanded stats (Yahoo summary style)
  app.get("/v1/quotes/:symbol/stats", async (req, reply) => {
    const { symbol } = req.params as { symbol: string };
    const key = `stats:${symbol.toUpperCase()}`;
    const cached = await app.redis.get(key);
    if (cached) return reply.send({ ...JSON.parse(cached), cached: true });
    try {
      const stats = await fetchYahooStats(symbol);
      // cache for 2 minutes (slower moving fields)
      await app.redis.set(key, JSON.stringify(stats), "EX", 120);
      return { ...stats, cached: false };
    } catch (e) {
      return reply.code(500).send({ error: e instanceof Error ? e.message : "stats failed" });
    }
  });

  // News items for a symbol
  app.get("/v1/quotes/:symbol/news", async (req, reply) => {
    const { symbol } = req.params as { symbol: string };
    // Keep news slightly fresher (1 minute)
    const key = `news:${symbol.toUpperCase()}`;
    const cached = await app.redis.get(key);
    if (cached) return reply.send({ items: JSON.parse(cached), cached: true });
    try {
      const items = await fetchYahooNews(symbol, 10);
      await app.redis.set(key, JSON.stringify(items), "EX", 60);
      return { items, cached: false };
    } catch (e) {
      return reply.code(500).send({ error: e instanceof Error ? e.message : "news failed" });
    }
  });

  // Symbol/company search autocomplete
  app.get(
    "/v1/search",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { q } = (req.query || {}) as { q?: string };
      if (!q || !q.trim()) return { items: [] };
      try {
        const res = await yahooFinance.search(q.trim(), { quotesCount: 10, newsCount: 0 });
        const items = (res.quotes || [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((r: any) => r.symbol && (r.exchange || r.exch) && !String(r.symbol).includes("="))
          .slice(0, 10)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((r: any) => ({
            symbol: r.symbol,
            shortname: r.shortname,
            longname: r.longname || r.shortname,
            exch: r.exchange || r.exch,
          }));
        return { items };
      } catch (e) {
        return reply.code(500).send({ error: e instanceof Error ? e.message : "search failed" });
      }
    },
  );

  // Historical route moved to routes/history.ts with caching & validated ranges.
};

export default quotesRoutes;
