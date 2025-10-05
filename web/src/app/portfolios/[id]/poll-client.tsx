'use client';
import React, { useEffect, useState } from 'react';
import { api, IngestRun, Position } from '../../../lib/api';

interface Props {
  portfolioId: string;
  initialPositions: Position[];
  initialIngests: IngestRun[];
}

export default function DynamicData({ portfolioId, initialPositions, initialIngests }: Props) {
  const [positions, setPositions] = useState(initialPositions);
  const [ingests, setIngests] = useState(initialIngests);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [pos, ing] = await Promise.all([
          api.listPositions(portfolioId),
          api.listIngests(portfolioId)
        ]);
        setPositions(pos);
        setIngests(ing);
        setLastRefresh(new Date());
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [portfolioId]);

  return (
    <>
      <section>
        <h2 style={{ marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Positions</span>
          <small style={{ fontSize: 11, fontWeight: 400, opacity: 0.6 }}>{lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : 'Live'}</small>
        </h2>
        {positions.length === 0 && <p style={{ opacity: 0.7 }}>No positions yet.</p>}
        {positions.length > 0 && (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #30363d' }}>
                <th style={{ padding: '4px 8px' }}>Symbol</th>
                <th style={{ padding: '4px 8px' }}>Qty</th>
                <th style={{ padding: '4px 8px' }}>Avg Cost</th>
              </tr>
            </thead>
            <tbody>
              {positions.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #21262d' }}>
                  <td style={{ padding: '4px 8px' }}>{p.symbol}</td>
                  <td style={{ padding: '4px 8px' }}>{Number(p.quantity)}</td>
                  <td style={{ padding: '4px 8px' }}>{Number(p.avgCost).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section>
        <h2 style={{ marginTop: 0 }}>Ingestion Runs</h2>
        {ingests.length === 0 && <p style={{ opacity: 0.7 }}>No ingests yet.</p>}
        {ingests.length > 0 && (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #30363d' }}>
                <th style={{ padding: '4px 8px' }}>Started</th>
                <th style={{ padding: '4px 8px' }}>Status</th>
                <th style={{ padding: '4px 8px' }}>Rows OK</th>
                <th style={{ padding: '4px 8px' }}>Rows Failed</th>
              </tr>
            </thead>
            <tbody>
              {ingests.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #21262d' }}>
                  <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{new Date(r.startedAt).toLocaleString()}</td>
                  <td style={{ padding: '4px 8px' }}>{r.status}</td>
                  <td style={{ padding: '4px 8px' }}>{r.rowsOk}</td>
                  <td style={{ padding: '4px 8px' }}>{r.rowsFailed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
