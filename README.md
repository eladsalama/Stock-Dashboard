# 📈 Stock Dashboard — Production-Grade Stock Portfolio Platform

> **A comprehensive full-stack portfolio management SaaS showcasing enterprise-level backend engineering, cloud architecture, and modern development practices.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=node.js)](https://nodejs.org/)
[![AWS](https://img.shields.io/badge/AWS-Cloud_Native-orange?logo=amazon-aws)](https://aws.amazon.com/)
[![Docker](https://img.shields.io/badge/Docker-Containerized-blue?logo=docker)](https://www.docker.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-red?logo=redis)](https://redis.io/)

Built by [Elad Salama](https://www.linkedin.com/in/eladsalama) 

---

## 🎯 Project Overview

Stock Dashboard is a **production-ready, cloud-native SaaS platform** that enables users to track investment portfolios, ingest trade history via CSV uploads, fetch real-time market data, and visualize performance with interactive charts. 

This project demonstrates **real-world backend engineering excellence**:
- ✅ **Clean Architecture** — Domain-driven design with clear separation of concerns
- ✅ **Cloud Deployment** — AWS-native infrastructure (S3, SQS, RDS, ElastiCache)
- ✅ **Observability** — Structured logging, health checks, request tracing
- ✅ **Data Modeling** — Normalized relational schema with Prisma ORM
- ✅ **Async Processing** — Event-driven architecture with SQS workers
- ✅ **CI/CD Pipeline** — Automated testing, linting, type checking, and builds

---

## 🚀 Tech Stack Highlights

### **Backend (Node.js + TypeScript)**
- **[Fastify](https://www.fastify.io/)** — High-performance web framework with schema validation
- **[TypeScript](https://www.typescriptlang.org/)** — Strict typing, 100% type-safe codebase
- **[Prisma](https://www.prisma.io/)** — Type-safe ORM with automated migrations
- **[Zod](https://github.com/colinhacks/zod)** — Runtime schema validation for API requests

### **Cloud Infrastructure (AWS)**
- **[Amazon S3](https://aws.amazon.com/s3/)** — Object storage for CSV uploads with presigned URLs
- **[Amazon SQS](https://aws.amazon.com/sqs/)** — Asynchronous message queue for trade ingestion
- **[LocalStack](https://localstack.cloud/)** — Local AWS emulation for development
- **[Amazon RDS (PostgreSQL)](https://aws.amazon.com/rds/)** — Managed relational database (production-ready)
- **[Amazon ElastiCache (Redis)](https://aws.amazon.com/elasticache/)** — High-performance caching layer

### **Database & Caching**
- **[PostgreSQL 16](https://www.postgresql.org/)** — Primary data store with ACID compliance
- **[Redis 7](https://redis.io/)** — Quote caching with TTL-based invalidation
- **Prisma Migrations** — Version-controlled schema evolution

### **Frontend (Next.js + React)**
- **[Next.js 14 (App Router)](https://nextjs.org/)** — React framework with server-side rendering
- **[React 18](https://react.dev/)** — Modern UI with hooks and context API
- **[TypeScript](https://www.typescriptlang.org/)** — End-to-end type safety
- **Interactive Charts** — Real-time price visualization with custom chart components

### **Authentication & Security**
- **JWT Authentication** — Token-based auth with middleware protection
- **Tenant Isolation** — User-scoped data access controls
- **Presigned S3 URLs** — Secure direct-to-cloud file uploads

### **Development & DevOps**
- **[Docker](https://www.docker.com/)** & **Docker Compose** — Containerized local development environment
- **[GitHub Actions](https://github.com/features/actions)** — CI/CD with automated testing and deployment
- **[Vitest](https://vitest.dev/)** — Fast unit and integration testing
- **[ESLint](https://eslint.org/)** + **[Prettier](https://prettier.io/)** — Code quality and formatting
- **[Pino](https://getpino.io/)** — High-performance structured logging

### **Async Processing & Workers**
- **SQS Message Consumers** — Long-polling workers for trade ingestion
- **Event-Driven Architecture** — S3 events → SQS → Worker pipeline
- **Idempotent Operations** — Safe retry logic with exponential backoff
- **Dead Letter Queues (DLQ)** — Failed message handling and monitoring

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER / CLIENT                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NEXT.JS FRONTEND (SSR)                        │
│  • Portfolio dashboard with real-time quotes                     │
│  • Interactive price charts (candlestick, EMA, BollingerBands)   │
│  • CSV upload UI with drag-and-drop                              │
│  • Google OAuth / JWT authentication + protected routes          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FASTIFY API SERVER                            │
│  • RESTful endpoints (/v1/portfolios, /quotes, /history...)      │
│  • JWT middleware + tenant isolation                             │
│  • Request validation (Zod schemas)                              │
│  • Presigned S3 upload generation                                │
│  • Redis caching layer (quotes with TTL)                         │
└────────────┬───────────────────────────┬────────────────────────┘
             │                           │
             ▼                           ▼
┌─────────────────────────┐   ┌─────────────────────────────────┐
│   POSTGRESQL (RDS)       │   │    REDIS (ELASTICACHE)          │
│  • Prisma ORM            │   │  • Quote cache (60s TTL)        │
│  • Schema migrations     │   │  • History cache (5min TTL)     │
│  • ACID transactions     │   │  • Rate limiting                │
└──────────────────────────┘   └─────────────────────────────────┘
             ▲
             │
             │ (Read/Write)
             │
┌────────────┴─────────────────────────────────────────────────────┐
│                     ASYNC WORKERS (SQS)                           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  TRADES INGESTION WORKER                                   │  │
│  │  • Long-poll SQS for CSV upload events                     │  │
│  │  • Download from S3, parse & validate                      │  │
│  │  • Idempotent trade upserts (externalId unique)            │  │
│  │  • Recompute portfolio positions                           │  │
│  │  • Update IngestRun status (pending → ok/error)            │  │
│  │  • DLQ routing on persistent failures                      │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AMAZON S3 (OBJECT STORAGE)                    │
│  • CSV file uploads (trades/, positions/)                        │
│  • S3 Event Notifications → SQS trigger                          │
│  • Presigned PUT URLs for secure client uploads                  │
└─────────────────────────────────────────────────────────────────┘
```

### **Data Flow Example: Trade CSV Upload**
1. **Client** requests presigned S3 URL from API (`POST /v1/uploads/trades:presign`)
2. **API** creates `IngestRun` record (status: `pending`) and generates S3 presigned URL
3. **Client** uploads CSV directly to S3 using presigned URL (no backend bottleneck)
4. **S3** triggers event notification → SQS message enqueued
5. **Worker** long-polls SQS, receives message, downloads CSV from S3
6. **Worker** parses rows, validates schema, upserts trades (idempotent via `externalId`)
7. **Worker** recomputes portfolio positions (aggregate qty + avg cost)
8. **Worker** updates `IngestRun` status to `ok` or `error` with metadata
9. **Client** polls API for ingestion status and refreshes positions table

---

## ⚡ Quick Start

### **Prerequisites**
- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Docker** & Docker Compose ([Download](https://www.docker.com/))
- **Git** ([Download](https://git-scm.com/))

### **1. Clone & Install**
```bash
git clone https://github.com/eladsalama/Stock-Dashboard.git
cd Stock-Dashboard
npm install
cd web && npm install && cd ..
```

### **2. Start Infrastructure (PostgreSQL + Redis + LocalStack)**
```bash
docker-compose up -d
```
This starts:
- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`
- LocalStack (AWS emulation) on `localhost:4566`

### **3. Database Setup**
```bash
# Apply Prisma migrations
npx prisma migrate deploy

# (Optional) Seed sample data
npx prisma db seed
```

### **4. Configure Environment**
Create `.env` in the root directory:
```bash
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/stockdash"
REDIS_URL="redis://localhost:6379"
AWS_ENDPOINT="http://localhost:4566"
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="test"
AWS_SECRET_ACCESS_KEY="test"
S3_BUCKET="trades-bucket"
SQS_QUEUE_URL="http://localhost:4566/000000000000/trades-ingest-queue"
```

### **5. Start Services**
```bash
# Terminal 1: API Server
npm run dev

# Terminal 2: Worker (CSV ingestion)
npm run dev:worker

# Terminal 3: Frontend (Next.js)
cd web && npm run dev
```

### **6. Access the Application**
- **Frontend:** http://localhost:3100
- **API:** http://localhost:3000
- **Health Check:** http://localhost:3000/healthz

---

## 🧪 Testing & Quality Assurance

### **Run Tests**
```bash
npm test              # Run all tests
npm run test:ui       # Interactive UI mode
npm run test:watch    # Watch mode
```

### **Code Quality**
```bash
npm run lint          # ESLint (0 errors, 0 warnings)
npm run typecheck     # TypeScript validation (backend + frontend)
npm run build         # Production build verification
```

### **Test Coverage**
- ✅ **Ingestion Pipeline** — CSV parsing, trade upserts, position recomputation
- ✅ **Position Logic** — Average cost calculations, zero-quantity cleanup
- ✅ **API Validation** — Schema validation, error handling
- ✅ **Idempotency** — Duplicate trade handling via `externalId`

**Current Status:**
```bash
✅ 10/10 tests passing
✅ 100% TypeScript strict mode
✅ 0 ESLint errors/warnings
✅ Production build clean
```

---

## 📁 Project Structure

```
Stock-Dashboard/
├── src/                        # Backend API source
│   ├── server.ts               # Fastify app entrypoint & plugin registration
│   ├── env.ts                  # Environment variable validation (dotenv + schema)
│   ├── routes/                 # API route handlers (RESTful endpoints)
│   │   ├── portfolios.ts       # Portfolio CRUD + position CRUD + CSV export/import + ingestion listing
│   │   ├── quotes.ts           # GET /v1/quotes/:symbol (live quote with Redis TTL + rate limiting)
│   │   ├── history.ts          # GET /v1/quotes/:symbol/history?range= (historical OHLCV with caching)
│   │   ├── uploads.ts          # POST /v1/uploads/trades:presign (S3 presigned URL generation)
│   │   ├── auth.ts             # Authentication routes (Google OAuth, JWT token management)
│   │   ├── explore.ts          # Market exploration endpoints (trending stocks, sector analysis)
│   │   └── dev.ts              # Development utilities (manual ingestion trigger, maintenance helpers)
│   ├── services/               # Business logic layer (stateless & pure where possible)
│   │   ├── ingest.ts           # Trade CSV ingestion: parse, validate, upsert, position recompute
│   │   ├── positions.ts        # Portfolio position aggregation (net qty + avg cost maintenance)
│   │   ├── positions-import.ts # Position snapshot CSV parser (shared with worker)
│   │   ├── quotes.ts           # Market data provider abstraction (yahoo-finance2 integration)
│   │   ├── history.ts          # Historical data fetch & transform (interval selection, TTL logic)
│   │   ├── analytics.ts        # Portfolio analytics: TWR, Sharpe ratio, max drawdown calculations
│   │   ├── stats.ts            # Statistical calculations and metrics aggregation
│   │   ├── news.ts             # Financial news fetching and aggregation
│   │   └── s3.ts               # AWS S3 client factory (LocalStack support) + helpers
│   ├── workers/                # Async background workers (long-running, never imported by server)
│   │   └── trades.ts           # SQS long-polling consumer: trade/position ingestion, idempotent updates, DLQ routing
│   └── plugins/                # Fastify plugins (dependency injection)
│       ├── prisma.ts           # PrismaClient instance injection (app.prisma)
│       ├── redis.ts            # Redis connection for caching (quotes, history)
│       ├── auth.ts             # JWT authentication & Google OAuth plugin
│       └── aws-dev.ts          # LocalStack dev setup: S3 bucket, SQS queues, event notifications
│
├── web/                        # Next.js 14 frontend (App Router)
│   ├── package.json            # Frontend dependencies & scripts
│   ├── next.config.js          # Next.js build/runtime configuration
│   ├── tsconfig.json           # Frontend TypeScript config (strict mode)
│   └── src/
│       ├── app/                # App Router pages & layouts
│       │   ├── layout.tsx      # Root HTML layout + global providers (toast, auth, fonts)
│       │   ├── page.tsx        # Homepage (single-portfolio redirect or list fallback)
│       │   ├── globals.css     # Global styles, design tokens, table/skeleton styling
│       │   ├── create-portfolio-client.tsx  # Portfolio creation form with toast feedback
│       │   ├── home-client.tsx              # Portfolio list (create/rename/delete, ingestion status)
│       │   ├── watchlist-client.tsx         # LocalStorage watchlist (symbol tracking)
│       │   ├── top-search-client.tsx        # Header symbol search with suggestions
│       │   ├── sidebar-header-client.tsx    # Sidebar header controls
│       │   ├── sidebar-portfolios-client.tsx # Sidebar portfolio navigation
│       │   ├── offline-banner.tsx           # Offline detection banner
│       │   ├── types.d.ts                   # Ambient type definitions
│       │   ├── dashboard/
│       │   │   ├── page.tsx                 # Dashboard route entry
│       │   │   ├── client.tsx               # Dashboard composition wrapper
│       │   │   ├── client.d.ts              # TypeScript definitions for client components
│       │   ├── explore/
│       │   │   ├── page.tsx                 # Market exploration page (trending, sectors)
│       │   │   └── client.tsx               # Explore page client logic
│       │   ├── portfolios/
│       │   │   ├── page.tsx                 # Portfolios list page
│       │   │   └── [id]/
│       │   │       ├── page.tsx             # Portfolio detail page
│       │   │       ├── positions-live.tsx   # Live positions table (polling + quote enrichment)
│       │   │       ├── ingests-live.tsx     # Ingestion runs table (status tracking)
│       │   │       ├── upload-client.tsx    # CSV upload UI (presign → S3 PUT)
│       │   │       ├── poll-client.tsx      # Legacy polling utility
│       │   │       └── portfolio-client.tsx # Portfolio container component
│       │   ├── symbol/[symbol]/
│       │   │   └── page.tsx                 # Symbol-focused page (chart + quote)
│       │   ├── sidebar-portfolios-client/
│       │   │   └── index.ts                 # Sidebar client utilities
│       │   └── clear-storage/
│       │       └── page.tsx                 # Dev utility: clear localStorage
│       ├── components/          # Reusable React components
│       │   ├── dashboard/
│       │   │   ├── DashboardClient.tsx      # Core dashboard logic (holdings, chart, polling)
│       │   │   ├── AdvancedPriceChart.tsx   # Advanced chart (candlestick, line, EMA, Bollinger Bands)
│       │   │   ├── layoutConfig.ts          # Layout & sizing constants
│       │   │   └── constants.ts             # Dashboard-specific constants (colors, thresholds)
│       │   ├── auth-context/
│       │   │   ├── AuthContext.tsx          # Authentication context provider
│       │   │   └── UserMenu.tsx             # User menu (avatar, sign-out, settings)
│       │   ├── ui/
│       │   │   ├── DataTable.tsx            # Generic sortable table (reusable)
│       │   │   ├── Panel.tsx                # Standard panel wrapper (title + body)
│       │   │   ├── StatusStrip.tsx          # Status indicators (env, latency, refresh)
│       │   │   ├── toast.tsx                # Toast notification system
│       │   │   ├── BackLink.tsx             # Back navigation link
│       │   │   ├── FallbackLink.tsx         # Graceful client/server navigation link
│       │   │   ├── SymbolLink.tsx           # Reusable symbol link component
│       │   │   └── ErrorBoundary.tsx        # Error boundary for UI components
│       │   └── ErrorBoundary.tsx            # App-level error boundary
│       └── lib/                 # Frontend utilities
│           ├── api.ts           # Typed API client (fetch wrapper, error handling)
│           └── time.ts          # Relative time formatting helpers
│
├── prisma/                     # Database schema & migrations
│   ├── schema.prisma           # Prisma schema: User, Portfolio, Position, Trade, IngestRun, Price
│   ├── seed.ts                 # Development seed data
│   └── migrations/             # Version-controlled migration history
│       ├── migration_lock.toml # Prisma migration metadata
│       ├── 20250929162740_init/           # Initial schema
│       ├── 20251001125727_track_a_trades_ingest/
│       ├── 20251001131556_trade_externalid_unique_global/
│       ├── 20251005101254_ingest_run/     # IngestRun table for tracking
│       └── 20251005101358_position_composite_unique/  # Composite unique index
│
├── tests/                      # Backend test suite (Vitest)
│   ├── ingest.test.ts          # Ingestion pipeline tests (CSV parse, upsert, position recompute)
│   ├── ingest-malformed.test.ts # Malformed CSV handling tests
│   ├── positions.test.ts       # Position logic tests (avg cost, zero qty cleanup)
│   └── analytics.test.ts       # Analytics calculations tests (TWR, Sharpe, max drawdown)
│
├── docs/                       # Project documentation
│   ├── index.md                # Developer navigation guide (this file map)
│   ├── Plan.md                 # Original project plan & tech stack decisions
│   ├── Progress.md             # Development progress tracker (recruiter-oriented)
│   ├── Progress-UI.md          # UI feature backlog
│   └── sample-trades.csv       # Example CSV format for uploads
│
├── scripts/                    # Utility scripts (reserved for future)
├── docker-compose.yml          # Local dev infrastructure (Postgres, Redis, LocalStack)
├── package.json                # Backend dependencies & npm scripts
├── tsconfig.json               # Backend TypeScript configuration (strict mode)
├── eslint.config.cjs           # Flat ESLint config (zero-tolerance for errors)
├── vitest.config.ts            # Test runner configuration
├── .env                        # Environment variables (gitignored)
└── .github/
    └── workflows/
        └── ci.yml              # CI/CD pipeline (lint, typecheck, test, build)
```

---

## 🎓 Key Learning Outcomes

This project demonstrates mastery of:

### **Backend Engineering**
- ✅ RESTful API design with proper HTTP semantics
- ✅ Schema-driven development (Prisma + Zod)
- ✅ Async processing patterns (queues, workers, retries)
- ✅ Database modeling and migrations
- ✅ Caching strategies (Redis TTL, cache invalidation)
- ✅ Error handling and observability

### **Cloud Architecture (AWS)**
- ✅ S3 presigned URLs for scalable file uploads
- ✅ SQS for decoupled async processing
- ✅ Event-driven architecture (S3 → SQS → Worker)
- ✅ LocalStack for cost-effective local development
- ✅ (Planned) ECS Fargate deployment with auto-scaling

### **DevOps & CI/CD**
- ✅ Docker containerization
- ✅ GitHub Actions pipelines
- ✅ Automated testing and linting
- ✅ Environment-based configuration
- ✅ Database migration strategies

### **Software Engineering Best Practices**
- ✅ TypeScript strict mode (100% type coverage)
- ✅ Clean architecture (routes → services → repositories)
- ✅ Idempotency and reliability patterns
- ✅ Code quality tooling (ESLint, Prettier)
- ✅ Comprehensive testing (unit + integration)

---

## 🚧 Roadmap

### **Completed ✅**
- [x] Core API with portfolio CRUD
- [x] S3 presigned uploads + SQS ingestion
- [x] Position recomputation logic
- [x] Real-time quote fetching with Redis cache
- [x] Interactive Next.js dashboard
- [x] JWT authentication + tenant isolation
- [x] CI/CD pipeline with GitHub Actions
- [x] Docker Compose dev environment
- [x] Comprehensive test suite

### **In Progress 🟡**
- [ ] Time-weighted return (TWR) analytics
- [ ] Sharpe ratio and max drawdown calculations
- [ ] Docker multi-stage production build

### **Planned 📋**
- [ ] AWS ECS Fargate deployment
- [ ] Price alert notifications (SES email)
- [ ] OpenTelemetry distributed tracing
- [ ] Terraform infrastructure as code
- [ ] Daily price refresh worker (EventBridge cron)

---

## 📝 API Documentation

### **Portfolios**
- `GET /v1/portfolios` — List user portfolios
- `POST /v1/portfolios` — Create portfolio
- `GET /v1/portfolios/:id` — Get portfolio details
- `PATCH /v1/portfolios/:id` — Update portfolio
- `DELETE /v1/portfolios/:id` — Delete portfolio

### **Positions**
- `GET /v1/portfolios/:id/positions` — List positions
- `POST /v1/portfolios/:id/positions` — Create/update position
- `DELETE /v1/portfolios/:id/positions/:symbol` — Remove position

### **Quotes & Market Data**
- `GET /v1/quotes/:symbol` — Get real-time quote (cached 60s)
- `GET /v1/quotes/:symbol/history?range=1d` — Historical OHLCV data

### **Uploads**
- `POST /v1/uploads/trades:presign` — Generate S3 presigned URL

### **Ingestion**
- `GET /v1/portfolios/:id/ingests` — List ingestion runs

### **Health**
- `GET /healthz` — Service health check
- `GET /version` — API version info

---

## 🤝 Contributing

This is a personal portfolio project, but feedback is welcome! Feel free to:
- Open issues for bugs or suggestions
- Submit pull requests for improvements
- Star ⭐ the repo if you find it helpful

---

## 📄 License

MIT License — See [LICENSE](LICENSE) file for details

---

## 👨‍💻 About the Author

**Elad Salama**  
BSc Computer Science, Tel Aviv University

I built this project to showcase production-grade backend engineering skills for recruiters and hiring managers. If you're looking for a backend engineer who can:
- Design and implement scalable cloud architectures
- Write clean, maintainable, type-safe code
- Build async processing pipelines
- Set up CI/CD and DevOps workflows
- Model complex domains with proper database design

**Let's connect!** [LinkedIn](https://www.linkedin.com/in/elad-salama) | [GitHub](https://github.com/eladsalama)

---

**Built with ❤️ using Node.js, TypeScript, AWS, and modern DevOps practices.**
