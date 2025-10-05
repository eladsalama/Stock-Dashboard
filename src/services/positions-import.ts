import { PrismaClient } from '@prisma/client';

// Parse positions snapshot CSV: symbol,quantity,avgCost (header required)
export function parsePositionsSnapshot(csv: string): Array<{ symbol:string; quantity:number; avgCost:number }> {
  const lines = csv.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length);
  if(!lines.length) return [];
  const header = lines[0].split(',').map(h=>h.trim().toLowerCase());
  const hSymbol = header.indexOf('symbol');
  const hQty = header.findIndex(h=> h==='quantity' || h==='qty');
  const hCost = header.indexOf('avgcost');
  if(hSymbol<0 || hQty<0 || hCost<0) return [];
  const out: Array<{ symbol:string; quantity:number; avgCost:number }> = [];
  for(let i=1;i<lines.length;i++) {
    const cols = lines[i].split(',');
    if(cols.length < Math.max(hSymbol,hQty,hCost)+1) continue;
    const symbol = cols[hSymbol]?.trim().toUpperCase();
    const quantity = Number(cols[hQty]);
    const avgCost = Number(cols[hCost]);
    if(!symbol || !isFinite(quantity) || !isFinite(avgCost)) continue;
    out.push({ symbol, quantity, avgCost });
  }
  return out;
}

export async function parsePositionsCsvAndUpsert(portfolioId:string, key:string, csvText:string, prisma:PrismaClient) {
  const rows = parsePositionsSnapshot(csvText);
  if(!rows.length) return 0;
  const runId = crypto.randomUUID();
  await prisma.$executeRawUnsafe('INSERT INTO "IngestRun" (id, "portfolioId", "objectKey", status) VALUES ($1,$2,$3,$4)', runId, portfolioId, key, 'pending');
  let ok = 0;
  await prisma.$transaction(async (tx) => {
    for(const r of rows) {
      const existing = await tx.position.findFirst({ where: { portfolioId, symbol: r.symbol } });
      if(existing) {
        await tx.position.update({ where: { id: existing.id }, data: { quantity: r.quantity, avgCost: r.avgCost } });
      } else {
        await tx.position.create({ data: { portfolioId, symbol: r.symbol, quantity: r.quantity, avgCost: r.avgCost } });
      }
      ok++;
    }
    await tx.portfolio.update({ where:{ id:portfolioId }, data:{ lastIngestAt: new Date(), lastIngestStatus: `positions:${ok}` } });
  });
  await prisma.$executeRawUnsafe('UPDATE "IngestRun" SET status=$1, "rowsOk"=$2, "rowsFailed"=$3, "finishedAt"=$4 WHERE id=$5', 'ok', ok, 0, new Date(), runId);
  return ok;
}
