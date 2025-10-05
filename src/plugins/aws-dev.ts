import fp from "fastify-plugin";
import { S3Client, CreateBucketCommand, PutBucketNotificationConfigurationCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { SQSClient, CreateQueueCommand, GetQueueAttributesCommand, SetQueueAttributesCommand } from "@aws-sdk/client-sqs";

const REGION = process.env.AWS_REGION || "us-east-1";
const ENDPOINT = process.env.AWS_ENDPOINT_URL || "http://localhost:4566";
const TRADES_BUCKET = process.env.TRADES_BUCKET || "trades-bucket";
const TRADES_QUEUE = process.env.TRADES_QUEUE || "trades-ingest-queue";
const DLQ_QUEUE = process.env.TRADES_DLQ || "trades-ingest-dlq";

export default fp(async (app) => {
  // Dev-only: initialize LocalStack S3 bucket + SQS queue and link notification
  if (process.env.NODE_ENV === "production") return;

  const s3 = new S3Client({ region: REGION, endpoint: ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: "test", secretAccessKey: "test" } });
  const sqs = new SQSClient({ region: REGION, endpoint: ENDPOINT, credentials: { accessKeyId: "test", secretAccessKey: "test" } });

  app.addHook("onReady", async () => {
    try {
      // Create bucket (idempotent)
      await s3.send(new CreateBucketCommand({ Bucket: TRADES_BUCKET }));
      // Ensure permissive CORS so browser presigned PUT from Next.js works
      try {
        await s3.send(new PutBucketCorsCommand({
          Bucket: TRADES_BUCKET,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedHeaders: ['*'],
                AllowedMethods: ['GET','PUT','HEAD','POST','DELETE'],
                AllowedOrigins: ['*'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3000
              }
            ]
          }
        }));
        app.log.info({ bucket: TRADES_BUCKET }, 'Applied S3 CORS configuration');
      } catch (e) {
        app.log.debug({ e }, 'failed to apply bucket CORS (may already exist)');
      }
    } catch (e) {
      app.log.debug({ e }, "bucket may already exist");
    }

    let queueUrl = "";
    try {
      const create = await sqs.send(new CreateQueueCommand({ QueueName: TRADES_QUEUE }));
      queueUrl = create.QueueUrl ?? "";
    } catch (e) {
      app.log.debug({ e }, "queue may already exist");
    }

    // Create DLQ (if missing)
    try {
      await sqs.send(new CreateQueueCommand({ QueueName: DLQ_QUEUE }));
    } catch (e) {
      app.log.debug({ e }, "dlq may already exist");
    }

    if (!queueUrl) {
      await sqs.send(new GetQueueAttributesCommand({ QueueUrl: `${ENDPOINT}/000000000000/${TRADES_QUEUE}`, AttributeNames: ["QueueArn"] }));
      queueUrl = `${ENDPOINT}/000000000000/${TRADES_QUEUE}`;
    }

    // LocalStack: Queue ARN follows a known pattern
    const queueArn = `arn:aws:sqs:${REGION}:000000000000:${TRADES_QUEUE}`;
    const bucketArn = `arn:aws:s3:::${TRADES_BUCKET}`;

    // Ensure SQS policy allows S3 bucket to send messages (LocalStack often needs this explicitly)
    try {
      const policy = {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "AllowS3ToSendMessage",
            Effect: "Allow",
            Principal: { Service: "s3.amazonaws.com" },
            Action: "sqs:SendMessage",
            Resource: queueArn,
            Condition: {
              ArnEquals: { "aws:SourceArn": bucketArn },
            },
          },
        ],
      };
      await sqs.send(new SetQueueAttributesCommand({
        QueueUrl: queueUrl,
        Attributes: { Policy: JSON.stringify(policy) },
      }));
    } catch (e) {
      app.log.debug({ e }, "set queue policy failed (ok to ignore in LocalStack)");
    }

    // Configure S3 -> SQS notification for prefix trades/
    try {
      await s3.send(new PutBucketNotificationConfigurationCommand({
        Bucket: TRADES_BUCKET,
        NotificationConfiguration: {
          QueueConfigurations: [
            {
              Events: ["s3:ObjectCreated:Put"],
              QueueArn: queueArn,
              Filter: {
                Key: { FilterRules: [{ Name: "prefix", Value: "trades/" }] },
              },
            },
          ],
        },
      }));
      app.log.info({ bucket: TRADES_BUCKET, queue: TRADES_QUEUE }, "S3 notifications wired for trades/ prefix");
    } catch (e) {
      app.log.debug({ e }, "notification config may already exist");
    }
  });
});
