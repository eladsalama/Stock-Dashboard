"use client";
import React, { useEffect, useState } from 'react';
import SymbolLink from '@components/ui/SymbolLink';
import { api } from '@lib/api';
import { timeAgo } from '@lib/time';

interface WLQuote { price?: number; asOf?: string; error?: string }

const STORAGE_KEY = 'watchlist.symbols.v1';

export default function WatchlistClient() {
  const [symbols, setSymbols] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch {}
    }
    return [];
  });
  const [input, setInput] = useState('');
  const [quotes, setQuotes] = useState<Record<string, WLQuote>>({});
  const [loading, setLoading] = useState(false);
  const [lastAt, setLastAt] = useState<Date | null>(null);

  // Load from localStorage
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try { setSymbols(JSON.parse(raw)); } catch {}
    }
  }, []);

  // Persist
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
  }, [symbols]);

  // Poll quotes
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      if (!symbols.length) return;
      setLoading(true);
      try {
        const q = await api.batchQuotes(symbols);
        setQuotes(q);
        setLastAt(new Date());
      } finally {
        setLoading(false);
        timer = setTimeout(load, 15000);
      }
    }
    load();
    return () => { if (timer) clearTimeout(timer); };
  }, [symbols]);

  function addSymbol(e: React.FormEvent) {
    e.preventDefault();
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    if (!symbols.includes(sym)) setSymbols(s => [...s, sym]);
    setInput('');
  }
  function remove(sym: string) {
    setSymbols(s => s.filter(x => x !== sym));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <form onSubmit={addSymbol} style={{ display: 'flex', gap: 6 }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Add symbol" style={{ flex:1, background:'#0d1117', color:'#e6edf3', border:'1px solid #30363d', borderRadius:4, padding:'4px 6px', fontSize:12 }} />
        <button className="inline-btn" type="submit">Add</button>
      </form>
      <table className="data-table" style={{ fontSize:11 }}>
        <thead>
          <tr>
            <th style={{ width:60 }}>Sym</th>
            <th>Price</th>
            <th>As Of</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {symbols.map(sym => {
            const q = quotes[sym] || {};
            return (
              <tr key={sym}>
                <td><SymbolLink symbol={sym} className="watchlist-link" style={{ textDecoration:'none', color:'var(--color-accent)', cursor:'pointer' }}>{sym}</SymbolLink></td>
                <td>{q.price ? q.price.toFixed(2) : (q.error ? 'Err' : '…')}</td>
                <td style={{ fontSize:10, opacity:0.6 }}>{q.asOf ? timeAgo(q.asOf) : ''}</td>
                <td><button onClick={() => remove(sym)} className="inline-btn" style={{ fontSize:10 }}>x</button></td>
              </tr>
            );
          })}
          {symbols.length === 0 && (
            <tr><td colSpan={4} style={{ padding:'6px 8px', opacity:0.5 }}>No symbols</td></tr>
          )}
        </tbody>
      </table>
      <div style={{ fontSize:10, opacity:0.6 }}>
        {loading ? 'Loading quotes…' : lastAt ? `Updated ${lastAt.toLocaleTimeString()}` : ''}
      </div>
    </div>
  );
}
