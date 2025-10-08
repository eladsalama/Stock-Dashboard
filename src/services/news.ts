import yahooFinance from "yahoo-finance2";

export interface NewsItem {
  id: string;
  title: string;
  publisher?: string;
  link: string;
  publishedAt: string; // ISO
  type?: string;
  symbol?: string;
}

export async function fetchYahooNews(symbol: string, limit = 8): Promise<NewsItem[]> {
  const s = symbol.trim().toUpperCase();
  if (!s) throw new Error("Empty symbol");

  // yahooFinance.search returns both quotes & news items relevant to the query
  const res = await yahooFinance.search(s, { newsCount: limit });
  const out: NewsItem[] = [];
  const seen = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res.news || []).forEach((n: any) => {
    const id = String(n.uuid || n.id || n.link || Math.random());
    if (seen.has(id)) return;
    seen.add(id);
    const ts = n.providerPublishTime || n.pubDate || Date.now();
    const ms = typeof ts === "number" ? (ts < 1e12 ? ts * 1000 : ts) : Date.parse(ts);
    out.push({
      id,
      title: n.title || n.headline || "Untitled",
      publisher: n.publisher || n.provider || n.source || undefined,
      link: n.link || (n.clickThroughUrl && n.clickThroughUrl.url) || "#",
      publishedAt: new Date(ms).toISOString(),
      type: n.type || n.providerFriendlyName || undefined,
      symbol: s,
    });
  });
  return out.slice(0, limit);
}
