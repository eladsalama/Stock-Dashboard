import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { recomputePositions } from '../src/services/positions';
import { ingestCsvText } from '../src/services/ingest';

const prisma = new PrismaClient();

async function createPortfolio(): Promise<string> {
  const user = await prisma.user.create({ data: { email: `test+${Date.now()}@example.local` } });
  const p = await prisma.portfolio.create({ data: { userId: user.id, name: 'Test', baseCcy: 'USD' } });
  return p.id;
}

describe('positions recompute + ingestion', () => {
  let portfolioId: string;

  beforeAll(async () => {
    portfolioId = await createPortfolio();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('recomputes positions from BUY trades', async () => {
    const csv = 'symbol,side,qty,price,tradedAt\nAAPL,BUY,10,150,2024-01-05T15:30:00Z';
    await ingestCsvText(portfolioId, 'test/aapl1.csv', csv, prisma);
    const pos = await prisma.position.findMany({ where: { portfolioId } });
    expect(pos).toHaveLength(1);
    expect(pos[0]).toMatchObject({ symbol: 'AAPL' });
  });

  it('handles BUY then partial SELL producing reduced quantity', async () => {
    const csv = 'symbol,side,qty,price,tradedAt\nAAPL,SELL,4,155,2024-01-06T15:30:00Z';
    await ingestCsvText(portfolioId, 'test/aapl2.csv', csv, prisma);
    const pos = await prisma.position.findFirst({ where: { portfolioId, symbol: 'AAPL' } });
    expect(Number(pos?.quantity)).toBe(6); // 10 - 4
  });

  it('full SELL removes position', async () => {
    const csv = 'symbol,side,qty,price,tradedAt\nAAPL,SELL,6,160,2024-01-07T15:30:00Z';
    await ingestCsvText(portfolioId, 'test/aapl3.csv', csv, prisma);
    const pos = await prisma.position.findFirst({ where: { portfolioId, symbol: 'AAPL' } });
    expect(pos).toBeNull();
  });
});