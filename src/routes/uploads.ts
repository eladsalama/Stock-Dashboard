import { FastifyPluginAsync } from "fastify";
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

// Using LocalStack defaults; allow override via env later
const LOCALSTACK_ENDPOINT = process.env.AWS_ENDPOINT_URL || "http://localhost:4566";
const REGION = process.env.AWS_REGION || "us-east-1";
const BUCKET = process.env.TRADES_BUCKET || "trades-bucket";

const s3 = new S3Client({
  region: REGION,
  endpoint: LOCALSTACK_ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

const TRADES_QUEUE = process.env.TRADES_QUEUE || "trades-ingest-queue"; // reuse for positions
const sqs = new SQSClient({
  region: REGION,
  endpoint: LOCALSTACK_ENDPOINT,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});
const QUEUE_URL = `${LOCALSTACK_ENDPOINT}/000000000000/${TRADES_QUEUE}`;

const requestSchema = z.object({
  portfolioId: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().default("text/csv"),
  checksumCrc32: z.string().regex(/^[A-Za-z0-9+/=]{4,}$/).optional(),
});

const uploadsRoutes: FastifyPluginAsync = async (app) => {
  // Create bucket lazily (idempotent for LocalStack)
  app.addHook("onReady", async () => {
    try {
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: ".init", Body: "ok" }));
    } catch (err) {
      app.log.debug({ err }, "s3 init noop failed (ok to ignore)");
    }
  });

  app.post("/v1/uploads/trades:presign", async (req, reply) => {
    const parse = requestSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: "Invalid body", details: parse.error.flatten() });
    }

    const { portfolioId, filename, contentType } = parse.data;
    const key = `trades/${portfolioId}/${Date.now()}-${filename}`;

    const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 60 * 5 });

    return { bucket: BUCKET, key, url, expiresIn: 300 };
  });

  // Positions snapshot presign
  app.post("/v1/uploads/positions:presign", async (req, reply) => {
    const parse = requestSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: "Invalid body", details: parse.error.flatten() });
    }
  const { portfolioId, filename, contentType, checksumCrc32 } = parse.data;
    const key = `positions/${portfolioId}/${Date.now()}-${filename}`;
  const putParams: { Bucket: string; Key: string; ContentType: string; ChecksumCRC32?: string } = { Bucket: BUCKET, Key: key, ContentType: contentType };
  if (checksumCrc32) putParams.ChecksumCRC32 = checksumCrc32;
  const cmd = new PutObjectCommand(putParams);
    const url = await getSignedUrl(s3, cmd, { expiresIn: 60 * 5 });
    req.log.info({ key, urlSnippet: url.split('?')[0], bucket: BUCKET }, 'generated positions presign');
    return { bucket: BUCKET, key, url, expiresIn: 300, method: 'PUT', headers: { 'Content-Type': contentType, ...(checksumCrc32? { 'x-amz-checksum-crc32': checksumCrc32 }: {}) } };
  });

  // Enqueue ingestion (trades or positions) after client finishes PUT to S3
  const enqueueSchema = z.object({ portfolioId: z.string(), key: z.string() });
  app.post('/v1/uploads/enqueue', async (req, reply) => {
    const parse = enqueueSchema.safeParse(req.body);
    if(!parse.success) {
      req.log.warn({ body: req.body }, 'enqueue invalid body');
      return reply.code(400).send({ error:'Invalid body', details: parse.error.flatten() });
    }
    const { portfolioId, key } = parse.data;
    try {
      // Create a pending ingest run immediately so UI polling shows it
      const runId = randomUUID();
      try {
        await req.server.prisma.$executeRawUnsafe('INSERT INTO "IngestRun" (id, "portfolioId", "objectKey", status) VALUES ($1,$2,$3,$4)', runId, portfolioId, key, 'pending');
      } catch (e) {
        req.log.error({ err: e, portfolioId, key }, 'failed to insert pending ingest run (continuing)');
      }
      await sqs.send(new SendMessageCommand({ QueueUrl: QUEUE_URL, MessageBody: JSON.stringify({ portfolioId, key }) }));
      req.log.info({ portfolioId, key, runId }, 'enqueued ingestion (positions/trades)');
      return { enqueued: true, runId };
    } catch (err) {
      req.log.error({ err }, 'Failed to enqueue ingestion');
      return reply.code(500).send({ error:'Enqueue failed' });
    }
  });
};

export default uploadsRoutes;
