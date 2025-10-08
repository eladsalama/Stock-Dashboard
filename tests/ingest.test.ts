import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { parseCsv, ingestRows, Row } from "../src/services/ingest";

const prisma = new PrismaClient();

describe("ingestion", () => {
  let portfolioId = "";

  beforeAll(async () => {
    // Ensure a clean DB state for tests; expects DATABASE_URL to point to a test database/schema
    // Create a user and a portfolio to attach trades to
    const user = await prisma.user.upsert({
      where: { email: "test@example.local" },
      update: {},
      create: { email: "test@example.local" },
    });
    const p = await prisma.portfolio.create({
      data: { userId: user.id, name: "Test", baseCcy: "USD" },
    });
    portfolioId = p.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("parses CSV rows", () => {
    const csv =
      "symbol,side,qty,price,tradedAt,externalId\nAAPL,BUY,10,150,2024-01-05T15:30:00Z,trade-001";
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      symbol: "AAPL",
      side: "BUY",
      qty: 10,
      price: 150,
      externalId: "trade-001",
    });
  });

  it("upserts idempotently by externalId", async () => {
    const rows: Row[] = [
      {
        symbol: "AAPL",
        side: "BUY",
        qty: 10,
        price: 150,
        tradedAt: "2024-01-05T15:30:00Z",
        externalId: "idemp-1",
      },
    ];
    const r1 = await ingestRows(portfolioId, rows, prisma);
    const r2 = await ingestRows(portfolioId, rows, prisma); // same externalId
    expect(r1.inserted).toBe(1);
    expect(r2.inserted).toBe(1); // our function counts processed rows; DB should only have one trade
    const count = await prisma.trade.count({ where: { externalId: "idemp-1" } });
    expect(count).toBe(1);
  });
});
