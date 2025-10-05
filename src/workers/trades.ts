import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import { randomUUID } from 'crypto';
import { PrismaClient } from "@prisma/client";
import { ingestCsvFromS3 } from "../services/ingest";
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getS3 } from '../services/s3';
// lightweight inline positions snapshot ingest to avoid path resolution issues
async function positionsSnapshotIngest(portfolioId:string, key:string, prisma:PrismaClient, s3KeyFetcher:()=>Promise<string>) {
  const text = await s3KeyFetcher();
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(!lines.length) return { inserted:0, runId: undefined };
  const header = lines[0].toLowerCase();
  if(!(header.includes('symbol') && (header.includes('quantity') || header.includes('qty')) && header.includes('avgcost'))) {
    console.warn(`[worker] positions ingest skipped (unrecognized header) portfolio=${portfolioId} key=${key}`);
    return { inserted:0, runId: undefined };
  }
  // Reuse existing pending run if enqueue created it, else create here.
  let runId: string | undefined;
  try {
    const existing = await prisma.$queryRawUnsafe<{ id:string }[]>(`SELECT id FROM "IngestRun" WHERE "portfolioId" = $1 AND "objectKey" = $2 ORDER BY "startedAt" DESC LIMIT 1`, portfolioId, key);
    runId = existing?.[0]?.id;
  } catch {}
  if(!runId) {
  runId = randomUUID();
    await prisma.$executeRawUnsafe('INSERT INTO "IngestRun" (id, "portfolioId", "objectKey", status) VALUES ($1,$2,$3,$4)', runId, portfolioId, key, 'pending');
  }
  let inserted=0;
  await prisma.$transaction(async (tx)=>{
    for(let i=1;i<lines.length;i++) {
      const cols = lines[i].split(',');
      if(cols.length < 3) continue;
      const symbol = cols[0]?.trim().toUpperCase();
      const quantity = Number(cols[1]);
      const avgCost = Number(cols[2]);
      if(!symbol || !isFinite(quantity) || !isFinite(avgCost)) continue;
      const existing = await tx.position.findFirst({ where:{ portfolioId, symbol } });
      if(existing) {
        await tx.position.update({ where:{ id: existing.id }, data:{ quantity, avgCost } });
      } else {
        await tx.position.create({ data:{ portfolioId, symbol, quantity, avgCost } });
      }
      inserted++;
    }
    await tx.portfolio.update({ where:{ id:portfolioId }, data:{ lastIngestAt:new Date(), lastIngestStatus:`positions:${inserted}` } });
  });
  await prisma.$executeRawUnsafe('UPDATE "IngestRun" SET status=$1, "rowsOk"=$2, "rowsFailed"=$3, "finishedAt"=$4 WHERE id=$5','ok', inserted, 0, new Date(), runId);
  return { inserted, runId };
}

const REGION = process.env.AWS_REGION || "us-east-1";
const ENDPOINT = process.env.AWS_ENDPOINT_URL || "http://localhost:4566";
const TRADES_QUEUE = process.env.TRADES_QUEUE || "trades-ingest-queue";
const DLQ_QUEUE = process.env.TRADES_DLQ || "trades-ingest-dlq";
const QUEUE_URL = `${ENDPOINT}/000000000000/${TRADES_QUEUE}`;
const DLQ_URL = `${ENDPOINT}/000000000000/${DLQ_QUEUE}`;
const MAX_ATTEMPTS = Number(process.env.TRADES_MAX_ATTEMPTS || 5);

type Msg = { portfolioId: string; key: string };

function extractFromS3Event(body: unknown): Msg | null {
  try {
    if (typeof body !== "object" || body === null) return null;
    const asObj = body as { Records?: Array<{ s3?: { object?: { key?: string } } }> };
    const rec = asObj.Records?.[0];
    if (!rec) return null;
    const key = decodeURIComponent(rec.s3?.object?.key ?? "");
    if (!key) return null;
    // Expect keys like trades/<portfolioId>/filename.csv
    const parts = key.split("/");
    const i = parts.indexOf("trades");
    const portfolioId = i >= 0 && parts[i + 1] ? parts[i + 1] : undefined;
    if (!portfolioId) return { portfolioId: "", key };
    return { portfolioId, key };
  } catch {
    return null;
  }
}

async function main() {
  const sqs = new SQSClient({ region: REGION, endpoint: ENDPOINT, credentials: { accessKeyId: "test", secretAccessKey: "test" } });
  const prisma = new PrismaClient();
  try {
    console.log(`[worker] starting trades worker`);
    console.log(`[worker] SQS endpoint: ${ENDPOINT}`);
    console.log(`[worker] queue: ${QUEUE_URL}`);
    console.log(`[worker] dlq:   ${DLQ_URL}`);
    // Heartbeat so we know it's alive even if no messages
    setInterval(()=>{
      console.log('[worker] heartbeat waiting for messages');
    }, 30000);
    while (true) {
      const res = await sqs.send(new ReceiveMessageCommand({ QueueUrl: QUEUE_URL, MaxNumberOfMessages: 5, WaitTimeSeconds: 10 }));
      const messages = res.Messages ?? [];
      if (messages.length > 0) {
        console.log(`[worker] received ${messages.length} message(s)`);
      }
      for (const m of messages) {
        try {
          const body: unknown = m.Body ? JSON.parse(m.Body) : {};
          // Support several envelope styles (raw, SNS-wrapped, S3 event)
          const maybeMsg = (body as Record<string, unknown>)?.Message;
          const envelope: unknown = typeof maybeMsg === "string" ? JSON.parse(maybeMsg) : body;
          const s3Msg = extractFromS3Event(envelope);
          const fallback = envelope as Partial<Msg>;
          const portfolioId = s3Msg?.portfolioId ?? fallback.portfolioId ?? "";
          const key = s3Msg?.key ?? fallback.key ?? "";
          console.log(`[worker] message parsed portfolio=${portfolioId || 'N/A'} key='${key}' attempt=${(envelope as any)?.attempt || 0}`);
          if (portfolioId && key) {
            try {
              // Heuristic: fetch just head or key path pattern to decide
              const isPositions = key.includes('/positions/');
              if (isPositions) {
                console.log(`[worker] positions snapshot ingest start portfolio=${portfolioId} key='${key}'`);
                const s3 = getS3();
                const obj = await s3.send(new GetObjectCommand({ Bucket: process.env.TRADES_BUCKET || 'trades-bucket', Key: key }));
                const textLoader = async () => (await obj.Body?.transformToString()) || '';
                const { inserted, runId } = await positionsSnapshotIngest(portfolioId, key, prisma, textLoader);
                console.log(`[worker] positions snapshot ingest done portfolio=${portfolioId} key='${key}' runId=${runId} rows=${inserted}`);
              } else {
                console.log(`[worker] trade ingest start portfolio=${portfolioId} key='${key}'`);
                const result = await ingestCsvFromS3(portfolioId, key, prisma);
                console.log(`[worker] trade ingest done portfolio=${portfolioId} key='${key}' inserted=${result.inserted}`);
              }
            } catch (err) {
              // Simple retry with backoff: re-enqueue with attempt count
              const attempt = Number((envelope as Record<string, unknown>)?.attempt || 0) + 1;
              if (attempt >= MAX_ATTEMPTS) {
                await sqs.send(new SendMessageCommand({ QueueUrl: DLQ_URL, MessageBody: JSON.stringify({ portfolioId, key, error: String(err) }) }));
                console.error(`[worker] moved to DLQ after ${attempt} attempts`, { key, portfolioId, error: String(err) });
              } else {
                const delay = Math.min(900, 2 ** attempt); // seconds, capped at SQS max 15m (900)
                await sqs.send(new SendMessageCommand({ QueueUrl: QUEUE_URL, MessageBody: JSON.stringify({ portfolioId, key, attempt }), DelaySeconds: delay }));
                console.warn(`[worker] enqueue retry #${attempt} with delay=${delay}s`, { key, portfolioId });
              }
            }
          }
          if (m.ReceiptHandle) {
            await sqs.send(new DeleteMessageCommand({ QueueUrl: QUEUE_URL, ReceiptHandle: m.ReceiptHandle }));
            console.log(`[worker] deleted message from queue`);
          }
        } catch (err) {
          // log and continue; rely on SQS redelivery
          console.error("worker error", err);
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
