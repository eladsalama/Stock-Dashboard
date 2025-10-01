import { S3Client } from "@aws-sdk/client-s3";

export const AWS_REGION = process.env.AWS_REGION || "us-east-1";
export const AWS_ENDPOINT_URL = process.env.AWS_ENDPOINT_URL || "http://localhost:4566";
export const TRADES_BUCKET = process.env.TRADES_BUCKET || "trades-bucket";

export function getS3() {
  return new S3Client({
    region: AWS_REGION,
    endpoint: AWS_ENDPOINT_URL,
    forcePathStyle: true,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
}
