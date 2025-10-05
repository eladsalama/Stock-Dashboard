"use client";
import React, { useEffect, useState } from 'react';

export default function StatusStrip() {
  const [latency, setLatency] = useState<number | null>(null);
  const [lastPing, setLastPing] = useState<Date | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function ping() {
      const start = performance.now();
      try {
        await fetch((process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000') + '/v1/portfolios', { method: 'HEAD' });
      } catch {
        // fallback: attempt GET but ignore body
        try { await fetch((process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000') + '/v1/portfolios'); } catch {}
      } finally {
        const ms = performance.now() - start;
        setLatency(ms);
        setLastPing(new Date());
        timer = setTimeout(ping, 15000);
      }
    }
    ping();
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  return (
    <div style={{ position:'fixed', bottom:0, left:240, right:0, height:22, background:'var(--color-bg-elevated)', borderTop:'1px solid var(--color-border)', display:'flex', alignItems:'center', padding:'0 12px', gap:18, fontSize:11 }}>
      <span style={{ opacity:0.7 }}>Latency: {latency ? `${latency.toFixed(0)}ms` : '…'}</span>
      <span style={{ opacity:0.5 }}>Last ping: {lastPing ? lastPing.toLocaleTimeString() : '—'}</span>
      <span style={{ marginLeft:'auto', opacity:0.4 }}>Desktop Mode</span>
    </div>
  );
}
