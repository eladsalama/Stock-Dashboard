"use client";
import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@lib/api';

interface WLQuote { price?: number; previousClose?: number; longName?: string; asOf?: string; error?: string }

const STORAGE_KEY = 'watchlist.symbols.v1';

export default function WatchlistClient() {
  const [symbols, setSymbols] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch {}
    }
    return [];
  });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
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

  const commitDraft = useCallback(() => {
    const sym = draft.trim().toUpperCase();
    if(sym && !symbols.includes(sym)) setSymbols(s=>[...s, sym]);
    setDraft('');
    setAdding(false);
  }, [draft, symbols]);
  function cancelDraft(){ setDraft(''); setAdding(false); }
  // remove symbol feature will be reintroduced later (context menu); currently omitted

  useEffect(()=>{
    function onAdd(){ setAdding(true); setTimeout(()=>{ const el = document.getElementById('watchlist-new-input'); el?.focus(); }, 30); }
    window.addEventListener('watchlist:add', onAdd as EventListener);
    function onReload(){ try { const raw=localStorage.getItem(STORAGE_KEY); if(raw){ const arr=JSON.parse(raw); if(Array.isArray(arr)) setSymbols(arr); } } catch{} }
    window.addEventListener('watchlist:add-remove', onReload as EventListener);
    return ()=> { window.removeEventListener('watchlist:add', onAdd as EventListener); window.removeEventListener('watchlist:add-remove', onReload as EventListener); };
  },[]);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {/* Header with plus icon */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:12, fontWeight:600, padding:'2px 2px 4px 2px' }}>
        <span style={{ letterSpacing:0.4 }}>Watchlist</span>
        <button
          className='mini-btn'
          title='Add symbol'
          onClick={()=>{ if(!adding){ setAdding(true); setTimeout(()=>{ const el=document.getElementById('watchlist-new-input'); el?.focus(); }, 20);} }}
          style={{ lineHeight:1, fontSize:14 }}
        >＋</button>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {symbols.map(sym => {
          const q = quotes[sym] || {};
          const price = q.price;
            const prev = q.previousClose;
            const delta = (price!=null && prev!=null)? price - prev : undefined;
            const cls = delta!=null ? (delta>=0? 'pl-pos':'pl-neg'):'';
          return (
            <div
              key={sym}
              style={{ position:'relative', display:'flex', justifyContent:'space-between', gap:8, padding:'6px 8px', border:'1px solid var(--color-border)', borderRadius:6, background:'#0d1117' }}
              onMouseEnter={e=>{ const btn = e.currentTarget.querySelector<HTMLButtonElement>('.wl-x'); if(btn) btn.style.opacity='1'; }}
              onMouseLeave={e=>{ const btn = e.currentTarget.querySelector<HTMLButtonElement>('.wl-x'); if(btn) btn.style.opacity='0'; }}
            >
              <div style={{ display:'flex', flexDirection:'column', minWidth:0 }}>
                <a href={`/symbol/${sym}`} style={{ fontWeight:600, textDecoration:'none', color:'var(--color-fg)', cursor:'pointer' }}>{sym}</a>
                <span style={{ fontSize:10, opacity:0.65, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:140 }}>{q.longName || '—'}</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
                <span style={{ fontSize:12 }}>{price!=null? price.toFixed(2): (q.error? 'Err':'…')}</span>
                <span style={{ fontSize:11 }} className={cls}>{delta!=null? `${delta>=0?'+':''}${delta.toFixed(2)}`:' '}</span>
              </div>
              <button
                className='mini-btn wl-x'
                onClick={()=> setSymbols(s=>s.filter(x=>x!==sym))}
                style={{ position:'absolute', top:2, right:2, fontSize:10, padding:'2px 4px', opacity:0, transition:'opacity 0.15s', color:'#f85149' }}
                title='Remove'
              >✕</button>
            </div>
          );
        })}
        {adding && (
          <div style={{ display:'flex', gap:6, padding:'6px 8px', border:'1px dashed var(--color-border)', borderRadius:6 }}>
            <input
              id='watchlist-new-input'
              placeholder='SYM'
              value={draft}
              onChange={e=>setDraft(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter') commitDraft(); else if(e.key==='Escape') cancelDraft(); }}
              onBlur={commitDraft}
              style={{ flex:1, background:'transparent', border:'none', outline:'none', color:'var(--color-fg)', fontSize:12 }}
            />
            <button className='mini-btn' onClick={cancelDraft} style={{ color:'#f85149' }}>✕</button>
          </div>
        )}
        {!symbols.length && !adding && <div style={{ fontSize:11, opacity:0.6, padding:'4px 2px' }}>No symbols</div>}
      </div>
      <div style={{ fontSize:9, opacity:0.5, paddingTop:4 }}>{loading? 'Quotes…' : lastAt? `Updated ${lastAt.toLocaleTimeString()}`:' '}</div>
    </div>
  );
}
