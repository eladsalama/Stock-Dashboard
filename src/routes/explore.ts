import { FastifyPluginAsync } from "fastify";
import yahooFinance from "yahoo-finance2";

// Minimal shape we rely on from yahoo-finance2 responses so we avoid `any`.
// (Library exports richer types but this keeps the contract explicit & narrow.)
interface QuoteLite {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  marketCap?: number;
  averageDailyVolume3Month?: number;
}

const exploreRoutes: FastifyPluginAsync = async (app) => {
  // Get market movers for stocks
  app.get("/v1/explore/stocks/:category", async (req, reply) => {
    const { category } = req.params as { category: string };
    
    try {
      let screenerResults;
      
      switch (category) {
        case "most-active":
          screenerResults = await yahooFinance.screener({
            scrIds: "most_actives",
            count: 25,
          });
          break;
        case "gainers":
          screenerResults = await yahooFinance.screener({
            scrIds: "day_gainers",
            count: 25,
          });
          break;
        case "losers":
          screenerResults = await yahooFinance.screener({
            scrIds: "day_losers",
            count: 25,
          });
          break;
        case "trending":
          // Use most_actives as fallback for trending
          screenerResults = await yahooFinance.screener({
            scrIds: "most_actives",
            count: 25,
          });
          break;
        default:
          return reply.status(400).send({ error: "Invalid category" });
      }
      
      const quotes: QuoteLite[] = (screenerResults?.quotes as QuoteLite[]) || [];
      return {
        category,
        type: "stocks",
        items: quotes.map((q: QuoteLite) => ({
          symbol: q.symbol,
          name: q.shortName || q.longName,
          price: q.regularMarketPrice,
          change: q.regularMarketChange,
          changePercent: q.regularMarketChangePercent,
          volume: q.regularMarketVolume,
          marketCap: q.marketCap,
          avgVolume: q.averageDailyVolume3Month,
        })),
      };
    } catch (error) {
      app.log.error({ error, category }, "Failed to fetch stocks");
      return reply.status(500).send({ error: "Failed to fetch stocks" });
    }
  });

  // Get market movers for ETFs
  app.get("/v1/explore/etfs/:category", async (req, reply) => {
    const { category } = req.params as { category: string };
    
    try {
      // Fetch popular ETFs directly since Yahoo Finance API has limited ETF screeners
      const etfSymbols = [
        "SPY", "QQQ", "IWM", "EEM", "VTI", "VOO", "IVV", "VEA", "AGG", "BND",
        "VWO", "GLD", "SLV", "XLF", "XLE", "XLV", "XLK", "XLI", "XLP", "XLU",
        "ARKK", "IEMG", "IEFA", "TLT", "HYG"
      ];
      
      const quotes = await Promise.all(
        etfSymbols.map(async (symbol) => {
          try {
            const quote = await yahooFinance.quote(symbol);
            return quote;
          } catch {
            return null;
          }
        })
      );
      
  const validQuotes: QuoteLite[] = quotes.filter((q): q is Exclude<typeof q, null> => q !== null) as QuoteLite[];
      
      // Sort based on category
      let sorted = validQuotes;
      if (category === "gainers") {
        sorted = validQuotes.sort((a, b) => 
          (b.regularMarketChangePercent || 0) - (a.regularMarketChangePercent || 0)
        );
      } else if (category === "losers") {
        sorted = validQuotes.sort((a, b) => 
          (a.regularMarketChangePercent || 0) - (b.regularMarketChangePercent || 0)
        );
      } else if (category === "most-active") {
        sorted = validQuotes.sort((a, b) => 
          (b.regularMarketVolume || 0) - (a.regularMarketVolume || 0)
        );
      } else if (category === "top-performing" || category === "trending") {
        // For top-performing and trending, sort by percent change (same as gainers)
        sorted = validQuotes.sort((a, b) => 
          (b.regularMarketChangePercent || 0) - (a.regularMarketChangePercent || 0)
        );
      }
      
      return {
        category,
        type: "etfs",
        items: sorted.map((q: QuoteLite) => ({
          symbol: q.symbol,
          name: q.shortName || q.longName,
          price: q.regularMarketPrice,
          change: q.regularMarketChange,
          changePercent: q.regularMarketChangePercent,
          volume: q.regularMarketVolume,
          marketCap: q.marketCap,
          avgVolume: q.averageDailyVolume3Month,
        })),
      };
    } catch (error) {
      app.log.error({ error, category }, "Failed to fetch ETFs");
      return reply.status(500).send({ error: "Failed to fetch ETFs" });
    }
  });

  // Get market movers for crypto
  app.get("/v1/explore/crypto/:category", async (req, reply) => {
    const { category } = req.params as { category: string };
    
    try {
      // For crypto, we'll fetch top crypto symbols directly
      const symbols = ["BTC-USD", "ETH-USD", "USDT-USD", "BNB-USD", "SOL-USD", 
                      "XRP-USD", "ADA-USD", "DOGE-USD", "TRX-USD", "AVAX-USD",
                      "LINK-USD", "DOT-USD", "MATIC-USD", "LTC-USD", "UNI-USD"];
      
      const quotes = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const quote = await yahooFinance.quote(symbol);
            return quote;
          } catch {
            return null;
          }
        })
      );
      
  const validQuotes: QuoteLite[] = quotes.filter((q): q is Exclude<typeof q, null> => q !== null) as QuoteLite[];
      
      // Sort based on category
      let sorted = validQuotes;
      if (category === "gainers") {
        sorted = validQuotes.sort((a, b) => 
          (b.regularMarketChangePercent || 0) - (a.regularMarketChangePercent || 0)
        );
      } else if (category === "losers") {
        sorted = validQuotes.sort((a, b) => 
          (a.regularMarketChangePercent || 0) - (b.regularMarketChangePercent || 0)
        );
      } else if (category === "most-active") {
        sorted = validQuotes.sort((a, b) => 
          (b.regularMarketVolume || 0) - (a.regularMarketVolume || 0)
        );
      }
      
      return {
        category,
        type: "crypto",
        items: sorted.slice(0, 25).map((q: QuoteLite) => ({
          symbol: q.symbol,
          name: q.shortName || q.longName,
          price: q.regularMarketPrice,
          change: q.regularMarketChange,
          changePercent: q.regularMarketChangePercent,
          volume: q.regularMarketVolume,
          marketCap: q.marketCap,
          avgVolume: q.averageDailyVolume3Month,
        })),
      };
    } catch (error) {
      app.log.error({ error, category }, "Failed to fetch crypto");
      return reply.status(500).send({ error: "Failed to fetch crypto" });
    }
  });
};

export default exploreRoutes;
