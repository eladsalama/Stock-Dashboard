import * as fs from "fs";
import * as path from "path";

type Env = {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;
  LOG_LEVEL: "info" | "warn" | "error" | "debug";
  DATABASE_URL: string;
  REDIS_URL?: string;
  CORS_ORIGIN?: string;
};

function required(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const env: Env = {
  NODE_ENV: (process.env.NODE_ENV as Env["NODE_ENV"]) ?? "development",
  PORT: Number(process.env.PORT ?? 3000),
  LOG_LEVEL:
    (process.env.LOG_LEVEL as Env["LOG_LEVEL"]) ??
    (process.env.NODE_ENV === "production" ? "info" : "debug"),
  DATABASE_URL: required("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/stockdash"),
  REDIS_URL: process.env.REDIS_URL,
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "*",
};

export function loadDotEnv() {
  if (process.env.NODE_ENV !== "production") {
    const p = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(p)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("dotenv").config({ path: p });
    }
  }
}
