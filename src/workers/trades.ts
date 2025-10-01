import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import { PrismaClient } from "@prisma/client";
import { ingestCsvFromS3 } from "../services/ingest";

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
          if (portfolioId && key) {
            try {
              console.log(`[worker] ingesting key='${key}' portfolio='${portfolioId}'`);
              const result = await ingestCsvFromS3(portfolioId, key, prisma);
              console.log(`[worker] ingest done: inserted=${result.inserted}`);
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
