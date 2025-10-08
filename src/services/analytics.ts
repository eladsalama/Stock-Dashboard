import { PrismaClient } from "@prisma/client";

export interface PortfolioAnalytics {
  marketValue: number;
  dayPL: number;
  twr: number | null;
}

export async function computePortfolioAnalytics(
  portfolioId: string,
  prisma: PrismaClient,
): Promise<PortfolioAnalytics> {
  const positions = await prisma.position.findMany({ where: { portfolioId } });
  if (!positions.length) return { marketValue: 0, dayPL: 0, twr: 0 };
  const symbols = Array.from(new Set(positions.map((p) => p.symbol)));
  const priceRows = await prisma.price.findMany({ where: { symbol: { in: symbols } } });
  const priceMap = new Map(priceRows.map((r) => [r.symbol, Number(r.last)]));
  let mv = 0;
  let dayPL = 0;
  for (const pos of positions) {
    const qty = Number(pos.quantity);
    const avg = Number(pos.avgCost);
    const last = priceMap.get(pos.symbol) ?? avg;
    mv += qty * last;
    dayPL += (last - avg) * qty; // Placeholder approximation
  }
  const costBasis = positions.reduce((a, p) => a + Number(p.quantity) * Number(p.avgCost), 0) || 1;
  const twr = mv ? mv / costBasis - 1 : 0;
  return {
    marketValue: round2(mv),
    dayPL: round2(dayPL),
    twr: Number.isFinite(twr) ? round4(twr) : null,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
