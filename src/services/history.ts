import yahooFinance from "yahoo-finance2";

export type Range = "1d" | "1w" | "1m" | "3m" | "1y" | "5y";

type Interval =
  | "1m"
  | "2m"
  | "5m"
  | "15m"
  | "30m"
  | "60m"
  | "90m"
  | "1h"
  | "1d"
  | "5d"
  | "1wk"
  | "1mo"
  | "3mo";

export type Candle = { t: string; o: number; h: number; l: number; c: number; v: number };
export type Series = {
  symbol: string;
  range: Range;
  interval: Interval;
  candles: Candle[];
  source: "yahoo";
};

// Map UI range → lookback milliseconds + interval
// Extra time added for indicator calculation buffer (increased for full edge-to-edge rendering)
function plan(range: Range): { lookbackMs: number; interval: Interval } {
  const day = 24 * 60 * 60 * 1000;
  const tradingDay = 6.5 * 60 * 60 * 1000; // 6.5 hours of trading
  switch (range) {
    case "1d":
      // 1-minute candles: need 50 extra minutes for buffer
      return { lookbackMs: 1 * day + (50 * 60 * 1000), interval: "1m" };
    case "1w":
      // 5-minute candles: need 3500 extra minutes (~9 trading days)
      return { lookbackMs: 7 * day + (3500 * 60 * 1000), interval: "5m" };
    case "1m":
      // 30-minute candles: need 5000 extra minutes (~12 trading days)
      return { lookbackMs: 31 * day + (12 * tradingDay), interval: "30m" };
    case "3m":
      // Daily candles: need 100 extra trading days (~140 calendar days)
      return { lookbackMs: 90 * day + (140 * day), interval: "1d" };
    case "1y":
      // Daily candles: need 50 extra trading days (~70 calendar days)
      return { lookbackMs: 365 * day + (70 * day), interval: "1d" };
    case "5y":
      // Weekly candles: need 50 extra weeks (~350 days)
      return { lookbackMs: 5 * 365 * day + (350 * day), interval: "1wk" };
  }
}

export async function fetchHistory(symbol: string, r: Range): Promise<Series> {
  const s = symbol.trim().toUpperCase();
  const { lookbackMs, interval } = plan(r);

  const period2 = new Date(); // now
  const period1 = new Date(Date.now() - lookbackMs);

  const result = await yahooFinance.chart(s, { period1, period2, interval });

  const quotes = result?.quotes ?? [];
  const candles: Candle[] = quotes.map((q) => ({
    t: (q.date instanceof Date ? q.date : new Date(q.date)).toISOString(),
    o: Number(q.open ?? q.close ?? 0),
    h: Number(q.high ?? q.close ?? 0),
    l: Number(q.low ?? q.close ?? 0),
    c: Number(q.close ?? q.open ?? 0),
    v: Number(q.volume ?? 0),
  }));

  return { symbol: s, range: r, interval, candles, source: "yahoo" };
}
