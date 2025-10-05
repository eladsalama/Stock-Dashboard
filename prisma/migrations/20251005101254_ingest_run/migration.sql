-- CreateTable
CREATE TABLE "public"."IngestRun" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rowsOk" INTEGER NOT NULL DEFAULT 0,
    "rowsFailed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngestRun_portfolioId_startedAt_idx" ON "public"."IngestRun"("portfolioId", "startedAt");

-- AddForeignKey
ALTER TABLE "public"."IngestRun" ADD CONSTRAINT "IngestRun_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "public"."Portfolio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
