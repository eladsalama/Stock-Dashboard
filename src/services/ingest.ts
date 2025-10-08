import { GetObjectCommand } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { getS3, TRADES_BUCKET } from "./s3";
import { recomputePositions } from "./positions";

export type Row = {
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  tradedAt: string; // ISO date
  externalId?: string;
};

export async function ingestCsvFromS3(portfolioId: string, key: string, prisma: PrismaClient) {
  const s3 = getS3();
  const obj = await s3.send(new GetObjectCommand({ Bucket: TRADES_BUCKET, Key: key }));
  const body = await obj.Body?.transformToString();
  if (!body) throw new Error("Empty object body");
  return ingestCsvText(portfolioId, key, body, prisma);
}

// Shared core ingest for already-fetched CSV content (used by tests & S3 path)
export async function ingestCsvText(
  portfolioId: string,
  key: string,
  csvText: string,
  prisma: PrismaClient,
) {
  // Using raw SQL pending prisma client model availability (ingestRun)
  const runId = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    'INSERT INTO "IngestRun" (id, "portfolioId", "objectKey", status) VALUES ($1,$2,$3,$4)',
    runId,
    portfolioId,
    key,
    "pending",
  );
  const rows = parseCsv(csvText);
  try {
    const result = await ingestRows(portfolioId, rows, prisma);
    if (result.inserted > 0) {
      await recomputePositions(portfolioId, prisma);
    }
    await prisma.$executeRawUnsafe(
      'UPDATE "IngestRun" SET status=$1, "rowsOk"=$2, "rowsFailed"=$3, "finishedAt"=$4 WHERE id=$5',
      "ok",
      result.inserted,
      rows.length - result.inserted,
      new Date(),
      runId,
    );
    return result;
  } catch (err) {
    await prisma.$executeRawUnsafe(
      'UPDATE "IngestRun" SET status=$1, "errorMessage"=$2, "rowsOk"=$3, "rowsFailed"=$4, "finishedAt"=$5 WHERE id=$6',
      "error",
      String(err),
      0,
      rows.length,
      new Date(),
      runId,
    );
    throw err;
  }
}

export async function ingestRows(portfolioId: string, rows: Row[], prisma: PrismaClient) {
  let inserted = 0;
  for (const r of rows) {
    if (!r.symbol || !r.side || !r.qty || !r.price || !r.tradedAt) continue;
    const ext = r.externalId ?? `${portfolioId}:${r.symbol}:${r.qty}:${r.price}:${r.tradedAt}`;
    await prisma.trade.upsert({
      where: { externalId: ext },
      update: {
        portfolioId,
        symbol: r.symbol.toUpperCase(),
        side: r.side,
        qty: r.qty,
        price: r.price,
        tradedAt: new Date(r.tradedAt),
      },
      create: {
        externalId: ext,
        portfolioId,
        symbol: r.symbol.toUpperCase(),
        side: r.side,
        qty: r.qty,
        price: r.price,
        tradedAt: new Date(r.tradedAt),
      },
    });
    inserted++;
  }

  await prisma.portfolio.update({
    where: { id: portfolioId },
    data: { lastIngestAt: new Date(), lastIngestStatus: `ok:${inserted}` },
  });

  return { inserted };
}

export function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map((s) => s.trim());
  const idx = (name: string) => header.indexOf(name);

  const iSymbol = idx("symbol");
  const iSide = idx("side");
  const iQty = idx("qty");
  const iPrice = idx("price");
  const iTradedAt = idx("tradedAt");
  const iExt = idx("externalId");

  // basic header validation
  if ([iSymbol, iSide, iQty, iPrice, iTradedAt].some((i) => i < 0)) {
    return [];
  }

  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 5) continue;
    rows.push({
      symbol: cols[iSymbol]?.trim(),
      side: (cols[iSide]?.trim()?.toUpperCase() as Row["side"]) || "BUY",
      qty: Number(cols[iQty]),
      price: Number(cols[iPrice]),
      tradedAt: cols[iTradedAt]?.trim(),
      externalId: iExt >= 0 ? cols[iExt]?.trim() : undefined,
    });
  }
  return rows;
}
