import { PrismaClient } from "@prisma/client";

export type RecomputeResult = { updated: number; deleted: number };

// Recompute positions from all trades for a portfolio.
// Net quantity can go negative (short). Positions with net 0 are removed.
export async function recomputePositions(portfolioId: string, prisma: PrismaClient): Promise<RecomputeResult> {
  // Aggregate trades in SQL for accuracy & scale
  const rows = await prisma.$queryRaw<Array<{ symbol: string; qty: string; buyQty: string; buyCost: string }>>`
    SELECT
      t.symbol as symbol,
      SUM(CASE WHEN t.side = 'BUY' THEN t.qty ELSE -t.qty END) as qty,
      SUM(CASE WHEN t.side = 'BUY' THEN t.qty ELSE 0 END) as buyQty,
      SUM(CASE WHEN t.side = 'BUY' THEN t.qty * t.price ELSE 0 END) as buyCost
    FROM "Trade" t
    WHERE t."portfolioId" = ${portfolioId}
    GROUP BY t.symbol
  `;

  const deletes: string[] = [];
  let updated = 0;
  for (const r of rows) {
    const netQty = Number(r.qty);
    if (netQty === 0) {
      deletes.push(r.symbol);
      continue;
    }
    const buyQty = Number(r.buyQty);
    const buyCost = Number(r.buyCost);
    const avgCost = buyQty > 0 ? buyCost / buyQty : 0;
    // Upsert using find + create/update (to avoid composite alias mismatch issues)
    const existing = await prisma.position.findFirst({ where: { portfolioId, symbol: r.symbol } });
    if (existing) {
      await prisma.position.update({ where: { id: existing.id }, data: { quantity: netQty.toString(), avgCost: avgCost.toString() } });
    } else {
      await prisma.position.create({ data: { portfolioId, symbol: r.symbol, quantity: netQty.toString(), avgCost: avgCost.toString() } });
    }
    updated++;
  }

  // Remove positions not present or zeroed
  if (deletes.length) {
    await prisma.position.deleteMany({ where: { portfolioId, symbol: { in: deletes } } });
  }

  // Also delete any position whose symbol not in current aggregate (i.e., all trades deleted scenario)
  const currentSymbols = rows
    .filter((r: { symbol:string; qty:string }) => Number(r.qty) !== 0)
    .map((r: { symbol:string; qty:string }) => r.symbol);
  await prisma.position.deleteMany({
    where: { portfolioId, NOT: currentSymbols.length ? { symbol: { in: currentSymbols } } : {} },
  });

  return { updated, deleted: deletes.length };
}