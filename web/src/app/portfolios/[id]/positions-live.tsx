"use client";
import React, { useEffect, useState, useRef, useImperativeHandle } from 'react';
import { api, Position } from '@lib/api';
import Link from 'next/link';
import { DataTable, Column } from '@components/ui/DataTable';

interface Props { portfolioId: string; initial: Position[]; onMetrics?: (m: PositionsMetrics)=>void }
export interface PositionsLiveHandle { startNew: () => void }

type Enriched = Position & {
  price?: number;
  previousClose?: number;
  marketValue?: number;
  pl?: number;
  dayChange?: number;
  dayChangePct?: number;
  asOf?: string;
  error?: string;
  _editing?: boolean;
  _new?: boolean; // draft new row
};

export interface PositionsMetrics { totalMV: number; totalPrev: number; portfolioDayChange: number; portfolioDayPct: number; totalPL: number; plPct: number; lastQuoteAt: Date | null; }

const PositionsLive = React.forwardRef<PositionsLiveHandle, Props>(function PositionsLive({ portfolioId, initial, onMetrics }, ref) {
  const [positions, setPositions] = useState<Enriched[]>(initial);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [lastQuoteAt, setLastQuoteAt] = useState<Date | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [newRow, setNewRow] = useState<Enriched | null>(null);
  const symbolInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setHydrated(true); }, []);

  // Poll positions list every 10s (skip while draft exists to avoid losing inputs)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (newRow) return; // don't clobber draft
      try {
        const fresh = await api.listPositions(portfolioId);
        setPositions(prev => mergeQuotes(fresh, prev));
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, [portfolioId, newRow]);

  // Quotes polling
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function loadQuotes() {
      if (!positions.length) return; // new row has no symbol yet maybe
      setLoadingQuotes(true);
      try {
        const symbols = Array.from(new Set(positions.map(p => p.symbol)));
        const qmap = await api.batchQuotes(symbols);
        setPositions(ps => ps.map(p => {
          const q = qmap[p.symbol.toUpperCase()];
            if (!q || q.error) return { ...p, error: q?.error };
            const price = Number(q.price);
            const previousClose = q.previousClose != null ? Number(q.previousClose) : undefined;
            const marketValue = price * Number(p.quantity);
            const pl = (price - Number(p.avgCost)) * Number(p.quantity);
            const dayChange = previousClose != null ? (price - previousClose) * Number(p.quantity) : undefined;
            const dayChangePct = previousClose != null ? ((price - previousClose) / previousClose) * 100 : undefined;
            return { ...p, price, previousClose, marketValue, pl, dayChange, dayChangePct, asOf: q.asOf };
        }));
        setLastQuoteAt(new Date());
      } finally {
        setLoadingQuotes(false);
        timer = setTimeout(loadQuotes, 15000);
      }
    }
    loadQuotes();
    return () => { if (timer) clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions.length]);

  function enterEdit(id:string) { setPositions(ps => ps.map(p => p.id===id? { ...p, _editing:true } : (p._editing? { ...p, _editing:false }: p))); }
  function editField(id:string, field:'quantity'|'avgCost', value:number) { setPositions(ps => ps.map(p => p.id===id? { ...p, [field]: value } : p)); }
  async function saveAndExit(id:string) {
    const row = positions.find(p=>p.id===id); if(!row) return;
    try { await api.updatePosition(id, { quantity: Number(row.quantity), avgCost: Number(row.avgCost) }); }
    catch {}
    finally { setPositions(ps => ps.map(p => p.id===id? { ...p, _editing:false } : p)); }
  }
  async function removePosition(id:string) {
    if(!confirm('Delete position?')) return;
    const prev = positions;
    setPositions(ps => ps.filter(p=>p.id!==id));
    try { await api.deletePosition(id); } catch { setPositions(prev); }
  }

  function startNew() {
    if (newRow) return;
    setNewRow({ id: '__new__', portfolioId, symbol: '', quantity: 0, avgCost: 0, createdAt: new Date().toISOString(), _new:true });
    setTimeout(()=>symbolInputRef.current?.focus(), 10);
  }
  useImperativeHandle(ref, () => ({ startNew }), [newRow, portfolioId]);
  function updateNew(field:'symbol'|'quantity'|'avgCost', value:string) {
    setNewRow(r => r ? { ...r, [field]: field==='symbol'? value.toUpperCase(): Number(value) } : r);
  }
  function cancelNew() { setNewRow(null); }
  async function saveNew() {
    if(!newRow) return;
    const symbol = newRow.symbol.trim().toUpperCase();
    if(!symbol || !isFinite(newRow.quantity) || newRow.quantity <= 0) { cancelNew(); return; }
    let avgCost = Number(newRow.avgCost);
    if(!avgCost || avgCost <= 0) {
      try {
        const qmap = await api.batchQuotes([symbol]);
        const q = qmap[symbol];
        if(q && q.price) avgCost = Number(q.price);
      } catch {}
    }
    try {
      const created = await api.createPosition(portfolioId, symbol, Number(newRow.quantity), avgCost);
      setPositions(ps => [...ps, created]);
    } finally { setNewRow(null); }
  }

  const totalMV = positions.reduce((acc, p) => acc + (p.marketValue || 0), 0);
  const totalPrev = positions.reduce((acc, p) => acc + ((p.previousClose ?? p.price ?? 0) * Number(p.quantity)), 0);
  const portfolioDayChange = totalPrev ? (totalMV - totalPrev) : 0;
  const portfolioDayPct = totalPrev ? (portfolioDayChange / totalPrev) * 100 : 0;
  const totalPL = positions.reduce((acc, p) => acc + (p.pl || 0), 0);
  const plPct = (totalMV && (totalMV - totalPL) !== 0) ? (totalPL / (totalMV - totalPL)) * 100 : 0;
  useEffect(()=>{ if(onMetrics) onMetrics({ totalMV, totalPrev, portfolioDayChange, portfolioDayPct, totalPL, plPct, lastQuoteAt });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalMV,totalPrev,portfolioDayChange,portfolioDayPct,totalPL,plPct,lastQuoteAt, positions.length]);

  const columns: Column<Enriched>[] = [
    { key: 'symbol', label: 'Symbol', sortable: true, render: r => (
      r._new ? <input ref={symbolInputRef} value={r.symbol} onChange={e=>updateNew('symbol', e.target.value)} style={{ width:80, padding:'2px 4px' }} placeholder='SYM' />
      : <Link href={`/symbol/${r.symbol.toLowerCase()}`} style={{ textDecoration:'none', color:'var(--color-accent)' }}>{r.symbol}</Link>
    ) },
    { key: 'quantity', label: 'Qty', sortable: true, render: r => r._new ? (
      <input type='number' value={r.quantity || ''} onChange={e=>updateNew('quantity', e.target.value)} style={{ width:70, padding:'2px 4px' }} />
    ) : ( r._editing ? <input
        style={{ width:70 }} autoFocus type='number' value={r.quantity}
        onChange={e=>editField(r.id,'quantity', Number(e.target.value))}
        onBlur={()=>saveAndExit(r.id)}
        onKeyDown={e=>{ if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } else if(e.key==='Escape'){ setPositions(ps=>ps.map(p=>p.id===r.id?{...p,_editing:false}:p)); } }}
      /> : <span onDoubleClick={()=>enterEdit(r.id)} style={{ cursor:'pointer' }}>{Number(r.quantity)}</span>) },
    { key: 'avgCost', label: 'Avg Cost', sortable: true, align:'right', render: r => r._new ? (
      <input type='number' step='0.01' value={r.avgCost || ''} onChange={e=>updateNew('avgCost', e.target.value)} style={{ width:80, padding:'2px 4px', textAlign:'right' }} placeholder='Auto' />
    ) : ( r._editing ? <input
        style={{ width:80, textAlign:'right' }} type='number' step='0.01' value={r.avgCost}
        onChange={e=>editField(r.id,'avgCost', Number(e.target.value))}
        onBlur={()=>saveAndExit(r.id)}
        onKeyDown={e=>{ if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } else if(e.key==='Escape'){ setPositions(ps=>ps.map(p=>p.id===r.id?{...p,_editing:false}:p)); } }}
      /> : <span onDoubleClick={()=>enterEdit(r.id)} style={{ cursor:'pointer' }}>{Number(r.avgCost).toFixed(2)}</span>) },
    { key: 'price', label: 'Price', sortable: true, align:'right', render: r => r.price ? r.price.toFixed(2) : (r.error ? 'Err' : '…') },
    { key: 'dayChange', label: 'Day Δ', sortable: true, align:'right', render: r => r.dayChange !== undefined ? <span className={r.dayChange >= 0 ? 'pl-pos' : 'pl-neg'}>{r.dayChange.toFixed(2)}</span> : '…' },
    { key: 'dayChangePct', label: 'Day %', sortable: true, align:'right', render: r => r.dayChangePct !== undefined ? <span className={r.dayChangePct >= 0 ? 'pl-pos' : 'pl-neg'}>{r.dayChangePct.toFixed(2)}%</span> : '…' },
    { key: 'marketValue', label: 'Mkt Value', sortable: true, align:'right', render: r => r.marketValue !== undefined ? r.marketValue.toFixed(2) : '…' },
    { key: 'pl', label: 'Unreal. P/L', sortable: true, align:'right', render: r => r.pl !== undefined ? <span className={r.pl >= 0 ? 'pl-pos' : 'pl-neg'}>{r.pl.toFixed(2)}</span> : '…' },
    { key: 'actions', label: '', render: r => r._new ? (
      <div style={{ display:'flex', gap:4 }}>
        <button className='mini-btn' style={{ background:'#238636', color:'#fff' }} onClick={saveNew}>✔</button>
        <button className='mini-btn' style={{ color:'#f85149' }} onClick={cancelNew}>✕</button>
      </div>
    ) : (
      <button className='mini-btn' style={{ color:'#f85149' }} onClick={()=>removePosition(r.id)}>✕</button>
    ) }
  ];

  const skeleton = !hydrated && positions.length === 0 && !newRow;
  // Show draft row at bottom (after existing positions)
  const rows = newRow ? [...positions, newRow] : positions;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {skeleton && <div style={{ fontSize:12, opacity:0.6 }}>Loading positions…</div>}
      {!skeleton && <DataTable columns={columns} rows={rows} rowKey={r=>r.id} sort={sort} onSortChange={setSort} emptyMessage="No positions" />}
      <div style={{ fontSize:10, opacity:0.5 }}>Double‑click Qty / Avg Cost to edit. Use ＋ to add a new position (Avg Cost defaults to market price if left blank).</div>
    </div>
  );
});

export default PositionsLive;

function mergeQuotes(next: Position[], prev: Enriched[]): Enriched[] {
  const prevMap = new Map(prev.map(p => [p.id, p] as const));
  return next.map(p => {
    const old = prevMap.get(p.id);
    if (!old) return p;
    if (old.symbol === p.symbol) {
      const { price, previousClose, marketValue, pl, asOf, error, dayChange, dayChangePct } = old;
      return { ...p, price, previousClose, marketValue, pl, asOf, error, dayChange, dayChangePct };
    }
    return p;
  });
}
