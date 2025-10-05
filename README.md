# Stock Dashboard — Backend

Local runbook (dev):

1) Prereqs
- Docker running
- Node.js 18+

2) Start local infra (Postgres, Redis, LocalStack)
- Use Docker Compose (see `docker-compose.yml`).

3) Migrate and generate Prisma client
- Ensure DATABASE_URL points to local Postgres (e.g., `postgres://postgres:postgres@localhost:5432/stockdash`).
- Run Prisma migrations and generate client.

4) Start API and worker
- API: `npm run dev`
- Worker: `npm run dev:worker`

5) Create a portfolio (optional via API) and presign upload
- `POST /v1/portfolios` with { name, baseCcy, userEmail(optional) }.
- `POST /v1/uploads/trades:presign` with { portfolioId, filename, contentType }.

6) Upload CSV and trigger ingestion
- PUT the CSV (e.g., `docs/sample-trades.csv`) to the returned presigned URL.
- The dev AWS plugin configures S3→SQS on keys with prefix `trades/`, the worker picks the message and ingests.

7) Verify ingest status
- `GET /v1/portfolios/:id` and check `lastIngestAt` and `lastIngestStatus`.

Notes
- Defaults: LocalStack at http://localhost:4566, region us-east-1, bucket `trades-bucket`, queue `trades-ingest-queue`.
- You can manually trigger via `POST /v1/dev/ingest { portfolioId, key }` if needed.

## CI Overview

GitHub Actions workflow (`.github/workflows/ci.yml`) runs automatically on:
- Pushes to `main`
- Pull requests targeting `main`

Pipeline stages:
1. Quick check job: installs deps, runs lint + typecheck fast.
2. Full build-test job (depends on quick check): spins up Postgres & Redis, applies migrations (`prisma migrate deploy`), then runs Vitest tests.

Environment in CI:
- Postgres 16 (fresh schema each run)
- Redis 7 (currently unused in tests but available)
- No LocalStack (S3/SQS paths should be unit-tested with mocks if added)

Add migrations before pushing (use `prisma migrate dev`)—CI only applies existing migration folders. Failures in lint, typecheck, migrations, or tests will fail the run.

# Stock-Dashboard
A Node.js + TypeScript Fastify server for building a stock portfolio dashboard with real-time data and analytics.
