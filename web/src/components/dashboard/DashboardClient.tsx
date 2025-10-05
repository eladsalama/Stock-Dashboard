"use client";
import React, { useEffect, useState, useRef } from 'react';
import { Portfolio, Position, api } from '@lib/api';
import { DataTable, Column } from '@components/ui/DataTable';
import { timeAgo } from '@lib/time';

interface P extends Portfolio { positions: Position[] }
interface Props { portfolio: P; initialSymbol?: string }

interface HoldingRow {
  id: string; symbol: string; quantity: number; avgCost: number;
  price?: number; previousClose?: number; marketValue?: number;
  dayChange?: number; dayChangePct?: number; longName?: string;
}

// Use lowercase ranges to align with history endpoint (1d,1w,1m,1y,5y)
const RANGES = ['1d','1w','1m','1y','5y'] as const;
type RangeKey = typeof RANGES[number];

export default function DashboardClient({ portfolio, initialSymbol }: Props) {
  const baseHoldings: HoldingRow[] = portfolio.positions.map(p => ({ id:p.id, symbol:p.symbol.toUpperCase(), quantity:Number(p.quantity), avgCost:Number(p.avgCost) }));
  const [holdings, setHoldings] = useState(baseHoldings);
  const [selected, setSelected] = useState<string>(() => {
    if (initialSymbol) return initialSymbol.toUpperCase();
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('dash.selectedSymbol') : null;
    return stored || holdings[0]?.symbol || '';
  });
  const [range, setRange] = useState<RangeKey>(() => {
    if (typeof localStorage === 'undefined') return '1d';
    const raw = localStorage.getItem('dash.range');
    if (!raw) return '1d';
    const lower = raw.toLowerCase();
    return (RANGES as readonly string[]).includes(lower) ? (lower as RangeKey) : '1d';
  });
  const [candles, setCandles] = useState<Array<{ t:string; o:number; h:number; l:number; c:number; v:number }>>([]);
  const cacheRef = useRef<Map<string, Array<{ t:string; o:number; h:number; l:number; c:number; v:number }>>>(new Map());
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightId = useRef(0);
  const [chartMode, setChartMode] = useState<'line'|'candles'>(() => {
    if (typeof localStorage === 'undefined') return 'line';
    const stored = localStorage.getItem('dash.chart.mode');
    return stored === 'candles' ? 'candles' : 'line';
  });
  const [showSMA20, setShowSMA20] = useState<boolean>(() => (localStorage?.getItem('dash.sma20')==='1'));
  const [showSMA50, setShowSMA50] = useState<boolean>(() => (localStorage?.getItem('dash.sma50')==='1'));
  // Log scale removed from UI per request; keep internal false constant
  const logScale = false;
  const [showVolMA, setShowVolMA] = useState<boolean>(() => (localStorage?.getItem('dash.volma')==='1'));
  useEffect(()=>{ localStorage.setItem('dash.sma20', showSMA20?'1':'0'); },[showSMA20]);
  useEffect(()=>{ localStorage.setItem('dash.sma50', showSMA50?'1':'0'); },[showSMA50]);
  useEffect(()=>{ localStorage.setItem('dash.volma', showVolMA?'1':'0'); },[showVolMA]);
  useEffect(()=>{ localStorage.setItem('dash.chart.mode', chartMode); },[chartMode]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [lastQuotesAt, setLastQuotesAt] = useState<Date | null>(null);
  const [sort, setSort] = useState<{ key:string; dir:'asc'|'desc' } | null>(null);
  // longName stored per holding; keep state for potential future global name override (currently unused)
  // (disabled to satisfy no-unused-vars)
  // const [longName, setLongName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Persist preferences
  useEffect(()=>{ if(selected) localStorage.setItem('dash.selectedSymbol', selected); },[selected]);
  useEffect(()=>{ if(initialSymbol && initialSymbol.toUpperCase() !== selected) setSelected(initialSymbol.toUpperCase()); },[initialSymbol]);
  useEffect(()=>{ if(range) localStorage.setItem('dash.range', range); },[range]);
  useEffect(()=>{ if(sort) localStorage.setItem('dash.holdings.sort', JSON.stringify(sort)); },[sort]);
  useEffect(()=>{
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('dash.holdings.sort') : null;
    if(raw) { try { setSort(JSON.parse(raw)); } catch{} }
  },[]);

  // Quotes polling
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      if(!holdings.length) return;
      setLoadingQuotes(true);
      try {
        const symbols = holdings.map(h=>h.symbol);
        const qmap = await api.batchQuotes(symbols);
        setHoldings(hs => hs.map(h => {
          const q = qmap[h.symbol];
          if(!q) return h;
          const price = q.price != null ? Number(q.price) : h.price;
          const previousClose = q.previousClose != null ? Number(q.previousClose) : h.previousClose;
          const marketValue = price != null ? price * h.quantity : h.marketValue;
            const dayChange = (price != null && previousClose != null) ? (price - previousClose) * h.quantity : undefined;
            const dayChangePct = (price != null && previousClose != null) ? ((price - previousClose)/previousClose)*100 : undefined;
          return { ...h, price, previousClose, marketValue, dayChange, dayChangePct, longName: q.longName || h.longName };
        }));
        setLastQuotesAt(new Date());
      } catch(e) {
        const msg = e instanceof Error ? e.message : 'Quotes failed';
        setError(msg);
      } finally {
        setLoadingQuotes(false);
        timer = setTimeout(load, 15000);
      }
    }
    load();
    return ()=>{ if(timer) clearTimeout(timer); };
  },[holdings.length]);

  // Debounced chart loading + caching (avoid rate limit and flicker)
  useEffect(() => {
    if(!selected) return;
    if(fetchTimer.current) clearTimeout(fetchTimer.current);
    const key = `${selected}:${range}`;
    // Serve from cache immediately if available
    const cached = cacheRef.current.get(key);
    if(cached) setCandles(cached);
    fetchTimer.current = setTimeout(async () => {
      const myId = ++inflightId.current;
      setLoadingChart(true);
      try {
        const h = await api.history(selected, range);
        if(inflightId.current !== myId) return; // out-of-date response
        const mapped = h.candles.map(c => ({ t:c.t, o:c.o, h:c.h, l:c.l, c:c.c, v:c.v }));
        cacheRef.current.set(key, mapped);
        setCandles(mapped);
      } catch(e) {
        if(inflightId.current === myId) {
          const msg = e instanceof Error ? e.message : 'History failed';
          setError(msg);
        }
      } finally {
        if(inflightId.current === myId) setLoadingChart(false);
      }
    }, 250); // slight debounce to batch rapid range clicks
    return () => { if(fetchTimer.current) clearTimeout(fetchTimer.current); };
  },[selected, range]);

  const aggregateMV = holdings.reduce((a,h)=> a + (h.marketValue || 0), 0);
  const aggregatePrev = holdings.reduce((a,h)=> a + ((h.previousClose!=null && h.quantity) ? h.previousClose * h.quantity : 0), 0);
  const aggregateDayChange = aggregatePrev ? aggregateMV - aggregatePrev : 0;
  const aggregateDayPct = (aggregatePrev && aggregateDayChange) ? (aggregateDayChange / aggregatePrev) * 100 : 0;
  // (aggregate day change class computed inline where needed)

  const [adding, setAdding] = useState(false);
  const [newSym, setNewSym] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newCost, setNewCost] = useState('');
  const [editingRow, setEditingRow] = useState<string|null>(null);
  const [editQty, setEditQty] = useState('');
  const [editCost, setEditCost] = useState('');
  async function addPosition(e: React.FormEvent) {
    e.preventDefault();
    if(!newSym.trim()) { setAdding(false); return; }
    try {
      const pos = await api.createPosition(portfolio.id, newSym.trim().toUpperCase(), Number(newQty||'0'), Number(newCost||'0'));
      setHoldings(hs => [...hs, { id:pos.id, symbol:pos.symbol, quantity:pos.quantity, avgCost:pos.avgCost }]);
      setNewSym(''); setNewQty(''); setNewCost(''); setAdding(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Add failed';
      alert(msg);
    }
  }
  async function commitEdit(id:string) {
    try {
      const qty = editQty.trim() ? Number(editQty) : undefined;
      const avgCost = editCost.trim() ? Number(editCost) : undefined;
      if(qty==null && avgCost==null) { setEditingRow(null); return; }
      const p = await api.updatePosition(id, { quantity: qty, avgCost });
      setHoldings(hs => hs.map(h => h.id===id? { ...h, quantity:p.quantity, avgCost:p.avgCost }: h));
  } catch(e) { const msg = e instanceof Error ? e.message : 'Update failed'; alert(msg); }
    finally { setEditingRow(null); }
  }
  async function delPosition(id:string) {
    if(!confirm('Delete position?')) return;
    const prev = holdings;
    setHoldings(hs => hs.filter(h=>h.id!==id));
  try { await api.deletePosition(id); } catch(e) { const msg = e instanceof Error ? e.message : 'Delete failed'; alert(msg); setHoldings(prev); }
  }
  const holdingColumns: Column<HoldingRow>[] = [
    { key:'symbol', label:'Sym', sortable:true, render: h => <span onClick={()=>setSelected(h.symbol)} style={{ cursor:'pointer', fontWeight: h.symbol===selected ? 600: undefined, color: h.symbol===selected? 'var(--color-accent)': undefined }}>{h.symbol}</span> },
    { key:'quantity', label:'Qty', sortable:true, align:'right', render: h => editingRow===h.id ? <input autoFocus style={{ width:60 }} value={editQty} onChange={e=>setEditQty(e.target.value)} onBlur={()=>commitEdit(h.id)} /> : <span onDoubleClick={()=>{ setEditingRow(h.id); setEditQty(String(h.quantity)); setEditCost(String(h.avgCost)); }}>{h.quantity}</span> },
    { key:'avgCost', label:'Avg', sortable:true, align:'right', render: h => editingRow===h.id ? <input style={{ width:70 }} value={editCost} onChange={e=>setEditCost(e.target.value)} onBlur={()=>commitEdit(h.id)} /> : <span onDoubleClick={()=>{ setEditingRow(h.id); setEditQty(String(h.quantity)); setEditCost(String(h.avgCost)); }}>{h.avgCost.toFixed(2)}</span> },
    { key:'price', label:'Price', sortable:true, align:'right', render: h => h.price!=null ? h.price.toFixed(2) : <span className="skeleton" style={{display:'inline-block', width:34, height:10}}/> },
    { key:'marketValue', label:'Value', sortable:true, align:'right', render: h => h.marketValue!=null ? h.marketValue.toFixed(2) : '…' },
    { key:'dayChange', label:'Δ Day', sortable:true, align:'right', render: h => h.dayChange!=null ? <span className={h.dayChange>=0?'pl-pos':'pl-neg'}>{h.dayChange.toFixed(2)}</span> : '…' },
    { key:'dayChangePct', label:'Δ %', sortable:true, align:'right', render: h => h.dayChangePct!=null ? <span className={h.dayChangePct>=0?'pl-pos':'pl-neg'}>{h.dayChangePct.toFixed(2)}%</span> : '…' },
    { key:'actions', label:'', render: h => <div style={{ display:'flex', gap:4 }}><button className="mini-btn" onClick={()=> delPosition(h.id)} style={{ color:'#f85149' }}>✕</button></div> }
  ];

  const selectedHolding = holdings.find(h=>h.symbol===selected);

  // Full-height layout: consume available viewport minus header/footer handled by outer layout.
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gridTemplateRows:'1fr 220px', gap:24, alignItems:'stretch', height:'calc(100vh - 40px - 22px)', overflow:'hidden' }}>
      {/* Large Chart Area */}
      <div style={{ gridColumn:'1 / 2', gridRow:'1 / 3', display:'flex', flexDirection:'column', gap:16 }}>
        <ChartPanel
          symbol={selected}
          holding={selectedHolding}
          range={range}
          onRangeChange={setRange}
          candles={candles}
          loading={loadingChart}
          mode={chartMode}
          onToggleMode={()=> setChartMode(m=> m==='line'?'candles':'line')}
          showSMA20={showSMA20} showSMA50={showSMA50} logScale={logScale} showVolMA={showVolMA}
          toggleSMA20={()=>setShowSMA20(v=>!v)} toggleSMA50={()=>setShowSMA50(v=>!v)} toggleVolMA={()=>setShowVolMA(v=>!v)}
        />
        {error && <div style={{ fontSize:12, color:'var(--color-danger)' }}>Error: {error}</div>}
      </div>
      {/* Metrics on right top */}
      <div style={{ gridColumn:'2 / 3', gridRow:'1 / 2' }}>
        <AggregatedHeader total={aggregateMV} change={aggregateDayChange} pct={aggregateDayPct} lastQuotesAt={lastQuotesAt} loading={loadingQuotes} />
      </div>
      {/* Holdings on right bottom */}
      <div style={{ gridColumn:'2 / 3', gridRow:'2 / 3', minHeight:0 }}>
        <div className="panel" style={{ display:'flex', flexDirection:'column', height:'100%' }}>
          <div className="panel-header" style={{ position:'sticky', top:0, zIndex:2 }}>
            <span>Holdings</span>
            <small style={{ fontSize:10, opacity:0.6 }}>{loadingQuotes? 'Quotes…' : lastQuotesAt ? timeAgo(lastQuotesAt.toISOString()) : ''}</small>
          </div>
          <div className="panel-body" style={{ padding:0, overflow:'auto', flex:1 }}>
            <DataTable columns={holdingColumns} rows={holdings} rowKey={r=>r.id} sort={sort} onSortChange={setSort} emptyMessage="No holdings" />
            {!adding && <button className="mini-btn" style={{ margin:8 }} onClick={()=> setAdding(true)}>＋ Add Position</button>}
            {adding && (
              <form onSubmit={addPosition} style={{ display:'flex', gap:4, padding:8, flexWrap:'wrap', alignItems:'center' }}>
                <input required placeholder='SYM' value={newSym} onChange={e=>setNewSym(e.target.value)} style={{ width:70 }} />
                <input placeholder='Qty' value={newQty} onChange={e=>setNewQty(e.target.value)} style={{ width:70 }} />
                <input placeholder='Avg' value={newCost} onChange={e=>setNewCost(e.target.value)} style={{ width:70 }} />
                <button type='submit' className='mini-btn'>Add</button>
                <button type='button' className='mini-btn' onClick={()=>{ setAdding(false); setNewSym(''); }}>Cancel</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AggregatedHeader({ total, change, pct, lastQuotesAt, loading }:{ total:number; change:number; pct:number; lastQuotesAt:Date|null; loading:boolean }) {
  const cls = change>=0 ? 'pl-pos' : 'pl-neg';
  return (
    <div className="panel" style={{ padding:0 }}>
      <div className="panel-body" style={{ display:'flex', gap:40, flexWrap:'wrap' }}>
        <Metric label="Total Value" value={formatNum(total)} />
        <Metric label="Day Change" value={formatSigned(change)} className={cls} />
        <Metric label="Day %" value={change ? formatSigned(pct)+'%' : '—'} className={cls} />
        <Metric label="Quotes" value={loading ? '…' : lastQuotesAt? lastQuotesAt.toLocaleTimeString() : '—'} />
      </div>
    </div>
  );
}

function ChartPanel({ symbol, holding, range, onRangeChange, candles, loading, mode, onToggleMode, showSMA20, showSMA50, logScale, showVolMA, toggleSMA20, toggleSMA50, toggleVolMA }:{ symbol:string; holding?:HoldingRow; range:RangeKey; onRangeChange:(r:RangeKey)=>void; candles:Array<{t:string;o:number;h:number;l:number;c:number;v:number}>; loading:boolean; mode:'line'|'candles'; onToggleMode:()=>void; showSMA20:boolean; showSMA50:boolean; logScale:boolean; showVolMA:boolean; toggleSMA20:()=>void; toggleSMA50:()=>void; toggleVolMA:()=>void }) {
  const price = holding?.price;
  // Timeframe-based change derived from current candle set (first vs last) for selected range
  let dayChange: number | undefined = undefined;
  let dayChangePct: number | undefined = undefined;
  if(candles.length >= 2) {
    const first = candles[0].c;
    const last = candles[candles.length -1].c;
    if(first != null && last != null && first !== 0) {
      dayChange = last - first;
      dayChangePct = (dayChange / first) * 100;
    }
  }
  const longName = holding?.longName;
  return (
    <div className="panel" style={{ minHeight:420, flex:1, display:'flex', flexDirection:'column' }}>
      <div className="panel-header" style={{ gap:16, flexWrap:'wrap' }}>
        <div style={{ display:'flex', flexDirection:'column' }}>
          <strong>{symbol}</strong>
          <span style={{ fontSize:11, opacity:0.65, maxWidth:480, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{longName || '—'}</span>
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <button onClick={onToggleMode} className="inline-btn" style={{ background: mode==='candles'?'var(--color-bg-hover)':'transparent', color: mode==='candles'?'var(--color-accent)':'var(--color-fg-muted)' }}>{mode==='candles'?'Candles':'Line'}</button>
          <button onClick={toggleSMA20} className="inline-btn" style={showSMA20?{background:'var(--color-bg-hover)', color:'#e0b341'}:undefined}>SMA20</button>
          <button onClick={toggleSMA50} className="inline-btn" style={showSMA50?{background:'var(--color-bg-hover)', color:'#b65bff'}:undefined}>SMA50</button>
          <button onClick={toggleVolMA} className="inline-btn" style={showVolMA?{background:'var(--color-bg-hover)', color:'#58a6ff'}:undefined}>VolMA</button>
          <button onClick={()=>window.dispatchEvent(new CustomEvent('chart-reset'))} className="inline-btn">Reset</button>
        </div>
      </div>
      <div className="panel-body" style={{ display:'flex', flexDirection:'column', gap:12, flex:1, minHeight:0 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:20 }}>
          <div style={{ fontSize:34, fontWeight:500 }}>{price!=null ? price.toFixed(2) : <span className="skeleton" style={{ display:'inline-block', width:120, height:30 }} />}</div>
          <div style={{ fontSize:14 }}>
            {dayChange!=null ? <span className={dayChange>=0? 'pl-pos':'pl-neg'}>{formatSigned(dayChange)} ({dayChangePct?.toFixed(2)}%)</span> : '—'}
          </div>
        </div>
        <div style={{ flex:1, position:'relative', minHeight:0 }}>
          {loading && <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', opacity:0.6 }}>Loading chart…</div>}
          {!loading && candles.length>0 && <AdvancedPriceChart data={candles} mode={mode} range={range} showSMA20={showSMA20} showSMA50={showSMA50} logScale={logScale} showVolMA={showVolMA} />}
          {!loading && candles.length===0 && <div style={{ fontSize:12, opacity:0.6 }}>Loading…</div>}
        </div>
        {/* Range buttons and X-axis labels moved below chart */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:4, gap:12 }}>
          <div style={{ display:'flex', gap:6 }}>
            {RANGES.map(r => <button key={r} onClick={()=>onRangeChange(r)} className="inline-btn" style={r===range?{ background:'var(--color-bg-hover)', color:'var(--color-accent)' }:undefined}>{r.toUpperCase()}</button>)}
          </div>
          <div style={{ fontSize:10, opacity:0.5 }}>Scroll to zoom · drag to pan</div>
        </div>
        {/* Inline stats bar (like IBKR): O H L C Vol for last/hover candle */}
        <OHLCBar candles={candles} />
      </div>
    </div>
  );
}

function AdvancedPriceChart({ data, mode, range, showSMA20, showSMA50, logScale, showVolMA }:{ data:Array<{ t:string; o:number; h:number; l:number; c:number; v:number }>; mode:'line'|'candles'; range:RangeKey; showSMA20:boolean; showSMA50:boolean; logScale:boolean; showVolMA:boolean }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const [windowIdx, setWindowIdx] = React.useState<[number, number]>(()=>[0, data.length-1]);
  // Reset window on external event
  useEffect(()=>{
    function reset(){ setWindowIdx([0, data.length-1]); }
    window.addEventListener('chart-reset', reset as EventListener);
    return ()=> window.removeEventListener('chart-reset', reset as EventListener);
  },[data.length]);
  // Dynamic target visual candle count per range to keep candles large & informative
  const TARGET_PER_RANGE: Record<RangeKey, number> = { '1d': 18, '1w': 40, '1m': 70, '1y': 140, '5y': 220 };
  const target = TARGET_PER_RANGE[range] || 120;
  const bucketSize = data.length > target ? Math.ceil(data.length / target) : 1;
  function bucketAggregate(src: typeof data, size:number) {
    if(size <= 1) return src;
    const out: typeof data = [];
    for(let i=0;i<src.length;i+=size) {
      const slice = src.slice(i, i+size);
      if(!slice.length) continue;
      const o = slice[0].o;
      const c = slice[slice.length-1].c;
      let h = -Infinity, l = Infinity, v = 0;
      for(const s of slice) { if(s.h>h) h=s.h; if(s.l<l) l=s.l; v += s.v; }
      out.push({ t: slice[0].t, o, h, l, c, v });
    }
    return out;
  }
  const baseData = bucketSize === 1 ? data : bucketAggregate(data, bucketSize);
  const [wStart, wEnd] = windowIdx;
  const safeEnd = Math.min(wEnd, baseData.length-1);
  const safeStart = Math.max(0, Math.min(wStart, safeEnd-5));
  const drawData = baseData.slice(safeStart, safeEnd+1);
  const closes = drawData.map(d=>d.c);
  const highs = drawData.map(d=>d.h);
  const lows  = drawData.map(d=>d.l);
  // Outlier clipping (ignore extreme spikes 0.5% tails) for vertical scale
  function quantile(arr:number[], q:number) {
    if(!arr.length) return 0;
    const sorted = [...arr].sort((a,b)=>a-b);
    const pos = (sorted.length-1)*q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if(sorted[base+1] !== undefined) return sorted[base] + rest*(sorted[base+1]-sorted[base]);
    return sorted[base];
  }
  const clipLow = quantile(lows, 0.005);
  const clipHigh = quantile(highs, 0.995);
  let min = clipLow;
  let max = clipHigh;
  // ensure last candle fully visible
  const lastC = drawData[drawData.length-1];
  if(lastC) { if(lastC.l < min) min = lastC.l; if(lastC.h > max) max = lastC.h; }
  const span = max - min || 1;
  // Logical canvas with right gutter reserved for labels
  const w = 1080; const gutterRight = 70; const hVisual = 380; const axisFooter = 24; const h = hVisual + axisFooter; // extend for labels
  const volH = 74; const priceH = hVisual - volH; // split areas (price+volume only)
  const padTop = 8; const padBottom = 6; const padLeft = 4;
  const priceArea = priceH - padTop - padBottom;
  const up = closes[closes.length-1] >= closes[0];
  const priceW = w - gutterRight - padLeft;
  // Derived points for line mode
  const linePts = drawData.map((d,i)=>{
    const x = padLeft + (i/(drawData.length-1))*priceW;
    const val = logScale ? (Math.log10(d.c) - Math.log10(min)) / (Math.log10(max) - Math.log10(min || 1)) : (d.c - min) / span;
    const y = padTop + (priceArea - (val)*priceArea);
    return `${x},${y}`;
  }).join(' ');
  // Map hover index to original drawData indexing
  const hoverPoint = hover!=null ? drawData[hover] : null;
  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, (x - padLeft) / (rect.width - (gutterRight/ w)*rect.width)));
    const idx = Math.round(ratio * (drawData.length -1));
    setHover(idx);
  }
  // Pan & zoom
  const dragState = useRef<{ startX:number; startRange:[number,number] }|null>(null);
  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    if(drawData.length < 10) return;
    const delta = e.deltaY;
    const factor = delta > 0 ? 1.1 : 0.9;
    const currentLen = (wEnd - wStart +1);
  const newLen = Math.max(20, Math.min(baseData.length, Math.round(currentLen * factor)));
  const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const xRatio = (e.clientX - rect.left - padLeft) / (rect.width - gutterRight);
    const focusIdx = wStart + Math.round(currentLen * xRatio);
    let newStart = focusIdx - Math.round(newLen * xRatio);
    let newEnd = newStart + newLen -1;
    if(newStart < 0) { newStart = 0; newEnd = newLen -1; }
    if(newEnd > baseData.length-1) { newEnd = baseData.length-1; newStart = newEnd - newLen +1; }
    setWindowIdx([newStart, newEnd]);
  }
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startRange: windowIdx };
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if(!dragState.current) return;
    const [s,eIdx] = dragState.current.startRange;
    const len = eIdx - s +1;
    const pixelPerCandle = priceW / drawData.length;
    const deltaPx = e.clientX - dragState.current.startX;
    const shift = Math.round(-deltaPx / pixelPerCandle);
    let newStart = s + shift;
    let newEnd = newStart + len -1;
    if(newStart < 0) { newStart = 0; newEnd = len -1; }
    if(newEnd > baseData.length-1) { newEnd = baseData.length-1; newStart = newEnd - len +1; }
    setWindowIdx([newStart, newEnd]);
  }
  function onPointerUp() { dragState.current = null; }
  // Nice tick generation
  function niceTicks(low:number, high:number, target=5): number[] {
    const rawSpan = high - low || 1;
    const roughStep = rawSpan / (target - 1);
    const pow10 = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const multiples = [1,2,2.5,5,10];
  const found = multiples.find(m => m*pow10 >= roughStep) || multiples[multiples.length-1];
  const step = found * pow10;
    const first = Math.ceil(low / step) * step;
    const ticks: number[] = [];
    for(let v=first; v<=high; v+=step) ticks.push(v);
    return ticks;
  }
  const ticks = niceTicks(min, max, 5);
  // Build time (x) ticks & lines
  const timeTicks: Array<{ x:number; label:string }> = [];
  if(drawData.length>1) {
    const firstDate = new Date(drawData[0].t);
    const lastDate = new Date(drawData[drawData.length-1].t);
    const times = drawData.map(d=> new Date(d.t).getTime());
    function nearestIdx(ts:number) {
      let lo=0, hi=times.length-1;
      while(lo<hi) { const mid=(lo+hi)>>1; if(times[mid]<ts) lo=mid+1; else hi=mid; }
      return lo;
    }
    if(range==='1d') {
      const start = new Date(firstDate); start.setMinutes(start.getMinutes() < 30 ? 0:30,0,0);
      start.setMinutes(start.getMinutes() - (start.getMinutes()%30));
      const cursor = new Date(start);
      while(cursor <= lastDate) {
        const idx = nearestIdx(cursor.getTime());
        const ratio = idx/(drawData.length-1);
        timeTicks.push({ x: padLeft + ratio*priceW, label: cursor.getHours().toString().padStart(2,'0')+':' + cursor.getMinutes().toString().padStart(2,'0') });
        cursor.setMinutes(cursor.getMinutes()+30);
      }
    } else if(range==='1w') {
      const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
      while(cursor <= lastDate) {
        const idx = nearestIdx(cursor.getTime());
        const ratio = idx/(drawData.length-1);
        const label = cursor.toLocaleDateString(undefined,{ weekday:'short' }).toUpperCase();
        if(idx < drawData.length) timeTicks.push({ x: padLeft + ratio*priceW, label });
        cursor.setDate(cursor.getDate()+1);
      }
    } else if(range==='1m') {
      // weekly ticks
      const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
      while(cursor <= lastDate) {
        if(cursor.getDay()===1) { // Monday
          const idx = nearestIdx(cursor.getTime());
          const ratio = idx/(drawData.length-1);
          const label = (cursor.getMonth()+1)+'/'+cursor.getDate();
          timeTicks.push({ x: padLeft + ratio*priceW, label });
        }
        cursor.setDate(cursor.getDate()+1);
      }
    } else if(range==='1y') {
      for(let m=firstDate.getMonth(); m<= lastDate.getMonth() + (12*(lastDate.getFullYear()-firstDate.getFullYear())); m++) {
        const year = firstDate.getFullYear() + Math.floor(m/12);
        const month = m % 12;
        const d = new Date(year, month, 1);
        if(d < firstDate) continue; if(d>lastDate) break;
        const idx = nearestIdx(d.getTime());
        const ratio = idx/(drawData.length-1);
        timeTicks.push({ x: padLeft + ratio*priceW, label: d.toLocaleString(undefined,{ month:'short' }).toUpperCase() });
      }
    } else if(range==='5y') {
      for(let y=firstDate.getFullYear(); y<=lastDate.getFullYear(); y++) {
        const d = new Date(y,0,1);
        if(d<firstDate) continue; if(d>lastDate) break;
        const idx = nearestIdx(d.getTime());
        const ratio = idx/(drawData.length-1);
        timeTicks.push({ x: padLeft + ratio*priceW, label: String(y) });
      }
    }
  }
  const maxVol = Math.max(...drawData.map(d=>d.v), 1);
  // Candle width relative to aggregated length with clamped bounds (IBKR thicker look)
  let candleWidth = (priceW / drawData.length) * 0.8;
  if(candleWidth < 5) candleWidth = 5;
  if(candleWidth > 18) candleWidth = 18;
  const labelFontSize = 22 * 0.5;
  // Price precision adaptive
  const magnitude = Math.abs(max);
  const decimals = magnitude >= 500 ? 0 : (magnitude >= 100 ? 1 : 2);
  // Moving averages (simple)
  function sma(src:number[], period:number) {
    if(src.length < period) return [] as number[];
    const out:number[] = [];
    let sum = 0;
    for(let i=0;i<src.length;i++) {
      sum += src[i];
      if(i>=period) sum -= src[i-period];
      if(i>=period-1) out.push(sum/period);
    }
    return out;
  }
  const sma20 = showSMA20? sma(drawData.map(d=>d.c), 20):[];
  const sma50 = showSMA50? sma(drawData.map(d=>d.c), 50):[];
  const volMA = showVolMA? sma(drawData.map(d=>d.v), 20):[];
  return (
    <div style={{ position:'absolute', inset:0, fontSize:11 }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ width:'100%', height:'100%', cursor:'crosshair', userSelect:'none', fontFamily:'system-ui, ui-monospace, Menlo, monospace' }}
        onMouseMove={onMove} onMouseLeave={()=>setHover(null)}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Grid & ticks (price area only) */}
        {ticks.map(t => {
          const y = padTop + (priceArea - ((t-min)/span)*priceArea);
          return <g key={t.toFixed(6)}>
            <line x1={padLeft} x2={padLeft+priceW} y1={y} y2={y} stroke="#222b" strokeWidth={1} />
            <text x={padLeft+priceW + 4} y={y+labelFontSize/3} fill="#9aa0a6" fontSize={labelFontSize}>{t.toFixed(decimals)}</text>
          </g>;
        })}
        {/* Price representation */}
        {mode==='line' && <polyline points={linePts} fill="none" stroke={up? 'var(--color-success)':'var(--color-danger)'} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
        {mode==='candles' && drawData.map((d,i)=>{
          const x = padLeft + (i/(drawData.length))*priceW + candleWidth*0.05;
          const valOpen = logScale ? (Math.log10(d.o)-Math.log10(min))/(Math.log10(max)-Math.log10(min||1)) : (d.o-min)/span;
          const valClose= logScale ? (Math.log10(d.c)-Math.log10(min))/(Math.log10(max)-Math.log10(min||1)) : (d.c-min)/span;
          const valHigh = logScale ? (Math.log10(d.h)-Math.log10(min))/(Math.log10(max)-Math.log10(min||1)) : (d.h-min)/span;
          const valLow  = logScale ? (Math.log10(d.l)-Math.log10(min))/(Math.log10(max)-Math.log10(min||1)) : (d.l-min)/span;
          const openY = padTop + (priceArea - (valOpen)*priceArea);
          const closeY= padTop + (priceArea - (valClose)*priceArea);
          const highY = padTop + (priceArea - (valHigh)*priceArea);
          const lowY  = padTop + (priceArea - (valLow )*priceArea);
          const rising = d.c >= d.o;
          const pct = Math.min(0.05, Math.max(-0.05, (d.c - d.o)/d.o));
          const intensity = Math.abs(pct)/0.05; // 0..1
          const baseColor = rising? 'var(--color-success)':'var(--color-danger)';
          const fill = rising? `rgba(35,134,54,${0.35+0.55*intensity})` : `rgba(248,81,73,${0.35+0.55*intensity})`;
          return <g key={d.t}>
            <line x1={x + candleWidth/2} x2={x + candleWidth/2} y1={highY} y2={lowY} stroke={rising? 'var(--color-success)':'var(--color-danger)'} strokeWidth={1} />
            <rect x={x} y={Math.min(openY, closeY)} width={candleWidth} height={Math.max(2, Math.abs(closeY-openY))} fill={fill} stroke={baseColor} strokeWidth={0.5} />
          </g>;
        })}
        {/* Moving averages */}
        {showSMA20 && sma20.length && (
          <polyline points={sma20.map((v,i)=> {
            const idx = i + (drawData.length - sma20.length); // align end
            const x = padLeft + (idx/(drawData.length-1))*priceW;
            const val = logScale ? (Math.log10(v)-Math.log10(min))/(Math.log10(max)-Math.log10(min||1)) : (v-min)/span;
            const y = padTop + (priceArea - val*priceArea);
            return `${x},${y}`; }).join(' ')} fill="none" stroke="#e0b341" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        )}
        {showSMA50 && sma50.length && (
          <polyline points={sma50.map((v,i)=> {
            const idx = i + (drawData.length - sma50.length);
            const x = padLeft + (idx/(drawData.length-1))*priceW;
            const val = logScale ? (Math.log10(v)-Math.log10(min))/(Math.log10(max)-Math.log10(min||1)) : (v-min)/span;
            const y = padTop + (priceArea - val*priceArea);
            return `${x},${y}`; }).join(' ')} fill="none" stroke="#b65bff" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        )}
        {/* Volume bars */}
        {drawData.map((d,i)=>{
          const x = padLeft + (i/(drawData.length))*priceW + candleWidth*0.05;
          const volRatio = d.v / maxVol;
          const barH = volRatio * (volH-16);
          const y = priceH + (volH- barH);
          const rising = d.c >= d.o;
          return <rect key={d.t+':vol'} x={x} y={y} width={candleWidth} height={barH} fill={rising? 'var(--color-success)':'var(--color-danger)'} opacity={0.35} />;
        })}
        {/* Volume MA overlay */}
        {showVolMA && volMA.length && (
          <polyline points={volMA.map((v,i)=>{
            const idx = i + (drawData.length - volMA.length);
            const x = padLeft + (idx/(drawData.length-1))*priceW + candleWidth/2;
            const ratio = v / maxVol;
            const barH = ratio * (volH-16);
            const y = priceH + (volH- barH);
            return `${x},${y}`; }).join(' ')} fill="none" stroke="#58a6ff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
        {/* X-axis grid lines at tick positions */}
  {timeTicks.map(t => <line key={'xtick-'+t.x} x1={t.x} x2={t.x} y1={0} y2={hVisual} stroke="#222b" strokeWidth={1} />)}
        {/* Crosshair for hover */}
        {hoverPoint && (()=>{
          const x = padLeft + (hover!/(drawData.length-1))*priceW;
          const y = padTop + (priceArea - ((hoverPoint.c-min)/span)*priceArea);
          return <g>
            <line x1={x} x2={x} y1={0} y2={priceH} stroke="#555" strokeDasharray="4 3" strokeWidth={1} />
            <line x1={0} x2={w} y1={y} y2={y} stroke="#555" strokeDasharray="4 3" strokeWidth={1} />
            <circle cx={x} cy={y} r={5} fill="var(--color-bg)" stroke={up? 'var(--color-success)':'var(--color-danger)'} strokeWidth={2} />
          </g>;
        })()}
        {/* Last price line / label */}
        {drawData.length>0 && (()=>{
          const last = drawData[drawData.length-1];
          const y = padTop + (priceArea - ((last.c-min)/span)*priceArea);
          return <g>
            <line x1={padLeft} x2={padLeft+priceW} y1={y} y2={y} stroke={last.c>=closes[0]? 'var(--color-success)':'var(--color-danger)'} strokeDasharray="2 4" strokeWidth={1} />
            <rect x={padLeft+priceW+4} y={y-10} width={gutterRight-8} height={18} fill="#1d2630" stroke="#30363d" />
            <text x={padLeft+priceW+ (gutterRight/2)} y={y+3} textAnchor="middle" fill={last.c>=closes[0]? 'var(--color-success)':'var(--color-danger)'} fontSize={12} fontWeight={600}>{last.c.toFixed(decimals)}</text>
          </g>;
        })()}
        {/* X-axis labels at bottom */}
        {timeTicks.map(t => <text key={'xlabel-'+t.x} x={t.x} y={h-6} textAnchor="middle" fontSize={10} fill="#888">{t.label}</text>)}
      </svg>
      {hoverPoint && (
        <div style={{ position:'absolute', left:`calc(${(hover!/(drawData.length-1))*100}% - 40px)`, top:8, background:'rgba(0,0,0,0.78)', padding:'6px 8px', borderRadius:4, pointerEvents:'none', border:'1px solid #30363d', whiteSpace:'nowrap', backdropFilter:'blur(2px)', fontFamily:'system-ui, ui-monospace, Menlo, monospace' }}>
          <div style={{ fontSize:11, opacity:0.7 }}>{new Date(hoverPoint.t).toLocaleString()}</div>
          <div style={{ fontWeight:600 }}>{hoverPoint.c.toFixed(2)}</div>
          <div style={{ fontSize:11, marginTop:4, display:'flex', gap:10 }}>
            <span>O {hoverPoint.o.toFixed(2)}</span>
            <span>H {hoverPoint.h.toFixed(2)}</span>
            <span>L {hoverPoint.l.toFixed(2)}</span>
            <span>C {hoverPoint.c.toFixed(2)}</span>
            <span>Vol {Intl.NumberFormat(undefined,{ notation:'compact' }).format(hoverPoint.v)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function OHLCBar({ candles }:{ candles:Array<{ t:string; o:number; h:number; l:number; c:number; v:number }> }) {
  if(!candles.length) return null;
  const last = candles[candles.length-1];
  const items: Array<[string,string]> = [
    ['O', last.o.toFixed(2)],
    ['H', last.h.toFixed(2)],
    ['L', last.l.toFixed(2)],
    ['C', last.c.toFixed(2)],
    ['Vol', Intl.NumberFormat(undefined,{ notation:'compact' }).format(last.v)]
  ];
  return (
    <div style={{ display:'flex', gap:18, fontSize:11, padding:'4px 2px', borderTop:'1px solid var(--color-border)', flexWrap:'wrap' }}>
      {items.map(([k,v]) => <div key={k} style={{ display:'flex', gap:4 }}><span style={{ opacity:0.55 }}>{k}</span><span>{v}</span></div>)}
    </div>
  );
}

function Metric({ label, value, className }:{ label:string; value:string; className?:string }) {
  return (
    <div style={{ minWidth:120 }}>
      <div style={{ fontSize:10, opacity:0.6, textTransform:'uppercase', letterSpacing:0.5 }}>{label}</div>
      <div className={className}>{value}</div>
    </div>
  );
}

function formatNum(v:number) { return v ? v.toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 }) : '—'; }
function formatSigned(v:number) { const sign = v>0?'+':''; return v ? sign+v.toFixed(2) : '—'; }