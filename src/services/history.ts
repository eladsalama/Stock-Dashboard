import yahooFinance from "yahoo-finance2";

export type Range = "1d" | "1w" | "1m" | "1y" | "5y";

type Interval =
  | "1m" | "2m" | "5m" | "15m" | "30m" | "60m" | "90m" | "1h"
  | "1d" | "5d" | "1wk" | "1mo" | "3mo";

export type Candle = { t: string; o: number; h: number; l: number; c: number; v: number };
export type Series = { symbol: string; range: Range; interval: Interval; candles: Candle[]; source: "yahoo" };

// Map UI range → lookback milliseconds + interval
function plan(range: Range): { lookbackMs: number; interval: Interval } {
  const day = 24 * 60 * 60 * 1000;
  switch (range) {
    case "1d":  return { lookbackMs: 1 * day,  interval: "1m"  };   // intraday
    case "1w":  return { lookbackMs: 7 * day,  interval: "5m"  };
    case "1m":  return { lookbackMs: 31 * day, interval: "30m" };
    case "1y":  return { lookbackMs: 365 * day, interval: "1d"  };
    case "5y":  return { lookbackMs: 5 * 365 * day, interval: "1wk" };
  }
}

export async function fetchHistory(symbol: string, r: Range): Promise<Series> {
  const s = symbol.trim().toUpperCase();
  const { lookbackMs, interval } = plan(r);

  const period2 = new Date();                         // now
  const period1 = new Date(Date.now() - lookbackMs);  // now - lookback

  const result = await yahooFinance.chart(s, { period1, period2, interval });

  const quotes = result?.quotes ?? [];
  const candles: Candle[] = quotes.map((q) => ({
    t: (q.date instanceof Date ? q.date : new Date(q.date)).toISOString(),
    o: Number(q.open  ?? q.close ?? 0),
    h: Number(q.high  ?? q.close ?? 0),
    l: Number(q.low   ?? q.close ?? 0),
    c: Number(q.close ?? q.open  ?? 0),
    v: Number(q.volume ?? 0),
  }));

  return { symbol: s, range: r, interval, candles, source: "yahoo" };
}
