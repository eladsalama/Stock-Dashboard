import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { computePortfolioAnalytics } from "../src/services/analytics";

const prisma = new PrismaClient();

describe("portfolio analytics", () => {
  let portfolioId: string;
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `analytics+${Date.now()}@example.local` },
    });
    const p = await prisma.portfolio.create({
      data: { userId: user.id, name: "Analytics", baseCcy: "USD" },
    });
    portfolioId = p.id;
    await prisma.position.create({
      data: { portfolioId, symbol: "AAPL", quantity: 10, avgCost: 150 },
    });
    await prisma.price.upsert({
      where: { symbol: "AAPL" },
      update: { last: 165 },
      create: { symbol: "AAPL", last: 165 },
    });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("computes market value, dayPL (approx) and twr", async () => {
    const res = await computePortfolioAnalytics(portfolioId, prisma);
    expect(res.marketValue).toBeGreaterThan(0);
    expect(res.twr).toBeGreaterThan(0);
  });
  it("empty portfolio returns zeros", async () => {
    const user2 = await prisma.user.create({
      data: { email: `empty+${Date.now()}@example.local` },
    });
    const p2 = await prisma.portfolio.create({
      data: { userId: user2.id, name: "Empty", baseCcy: "USD" },
    });
    const res = await computePortfolioAnalytics(p2.id, prisma);
    expect(res.marketValue).toBe(0);
    expect(res.dayPL).toBe(0);
    expect(res.twr).toBe(0);
  });
});
