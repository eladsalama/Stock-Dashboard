/*
  Warnings:

  - A unique constraint covering the columns `[portfolioId,symbol]` on the table `Position` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Position_portfolioId_symbol_key" ON "public"."Position"("portfolioId", "symbol");
