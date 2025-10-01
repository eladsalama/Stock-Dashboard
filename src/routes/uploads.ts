import { FastifyPluginAsync } from "fastify";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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

const requestSchema = z.object({
  portfolioId: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().default("text/csv"),
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
};

export default uploadsRoutes;
