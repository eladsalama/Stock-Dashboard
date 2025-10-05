import React from 'react';
import { Portfolio, Position } from '@lib/api';
import BackLink from '@components/ui/BackLink';

// Simple server component wrapper that loads the dashboard chart panel for a single symbol
// Reuses the dashboard client but with a synthetic single-position portfolio so user can deep-link.

async function load(symbol: string) {
  // Minimal fake portfolio shape for DashboardClient: positions array with placeholder quantity/avgCost (0 until real portfolio context)
  const upper = symbol.toUpperCase();
  const virtual: Portfolio & { positions: Position[] } = {
    id: 'virtual', name: upper, baseCcy: 'USD', createdAt: new Date().toISOString(),
    positions: [ { id: `virtual-${upper}`, portfolioId: 'virtual', symbol: upper, quantity: 0, avgCost: 0, createdAt: new Date().toISOString() } ]
  };
  return virtual;
}

export default async function SymbolPage({ params }: { params: { symbol: string } }) {
  const portfolio = await load(params.symbol);
  const DashboardClient = (await import('../../../components/dashboard/DashboardClient')).default as React.ComponentType<{ portfolio: Portfolio & { positions: Position[] }; initialSymbol?: string }>;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8, height:'calc(100vh - 40px - 22px)' }}>
      <div>
        <BackLink />
      </div>
      <div style={{ flex:1, minHeight:0 }}>
        <DashboardClient portfolio={portfolio} initialSymbol={params.symbol} />
      </div>
    </div>
  );
}