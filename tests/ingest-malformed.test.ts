import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ingestCsvText, parseCsv } from "../src/services/ingest";

const prisma = new PrismaClient();

describe("ingestion malformed CSV", () => {
  let portfolioId: string;
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `malformed+${Date.now()}@example.local` },
    });
    const p = await prisma.portfolio.create({
      data: { userId: user.id, name: "Malformed", baseCcy: "USD" },
    });
    portfolioId = p.id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("ignores completely empty CSV", async () => {
    const res = await ingestCsvText(portfolioId, "empty.csv", "", prisma);
    expect(res.inserted).toBe(0);
  });

  it("skips header-only CSV", async () => {
    const csv = "symbol,side,qty,price,tradedAt";
    const parsed = parseCsv(csv);
    expect(parsed).toHaveLength(0);
    const res = await ingestCsvText(portfolioId, "header.csv", csv, prisma);
    expect(res.inserted).toBe(0);
  });

  it("skips malformed lines gracefully", async () => {
    const csv =
      "symbol,side,qty,price,tradedAt\nAAPL,BUY,10,150,2024-01-05T15:30:00Z\nBADLINEWITHOUTENOUGHFIELDS\nMSFT,SELL,5,300,2024-01-06T10:00:00Z";
    const parsed = parseCsv(csv);
    expect(parsed).toHaveLength(2); // malformed line dropped
    const res = await ingestCsvText(portfolioId, "malformed.csv", csv, prisma);
    expect(res.inserted).toBe(2);
    const trades = await prisma.trade.findMany({ where: { portfolioId } });
    expect(trades.length).toBeGreaterThanOrEqual(2);
  });
});
