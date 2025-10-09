## Project Structure 📁

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