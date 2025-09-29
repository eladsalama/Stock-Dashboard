import yahooFinance from "yahoo-finance2";

export type Quote = {
  symbol: string;
  price: number;
  currency?: string;
  source: "yahoo";
  asOf: string; // ISO timestamp
};

export async function fetchYahooQuote(symbol: string): Promise<Quote> {
  const s = symbol.trim().toUpperCase();
  if (!s) throw new Error("Empty symbol");

  const q = await yahooFinance.quote(s);

  const price =
    q.regularMarketPrice ??
    q.postMarketPrice ??
    q.preMarketPrice ??
    null;
  if (price == null) throw new Error("No price available");

  // robust timestamp handling (Date | ms | seconds)
  const t = (q as any).regularMarketTime;
  let asOf: string;
  if (t instanceof Date) {
    asOf = t.toISOString();
  } else if (typeof t === "number") {
    // if it's seconds (< 1e12) convert to ms; if already ms, use as-is
    const ms = t < 1e12 ? t * 1000 : t;
    asOf = new Date(ms).toISOString();
  } else {
    asOf = new Date().toISOString();
  }

  return {
    symbol: q.symbol ?? s,
    price: Number(price),
    currency: q.currency ?? "USD",
    source: "yahoo",
    asOf,
  };
}
