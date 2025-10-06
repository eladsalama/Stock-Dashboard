"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, Portfolio, getBase } from '@lib/api';
import { useToast } from '@components/ui/toast';

/* Fresh robust sidebar implementation
  Goals:
  - Never wipe list due to transient empty response
  - Fast initial paint via localStorage cache
  - Reliable selection synced to URL
  - CRUD operations update cache immediately
  - Resilient navigation (router push + fallback)
  + Instrumentation (temporary) to diagnose remaining blank-list bug on navigation.

  DIAGNOSTICS ADDED:
  - Global module-level last list fallback
  - window.__SIDEBAR_STATE and window.__SIDEBAR_DEBUG toggles
  - Detailed console.groupCollapsed logs for each fetch / applyList / navigation event
*/

type Phase = 'idle' | 'loading' | 'ready' | 'error';

interface PortfolioState {
  phase: Phase;
  data: Portfolio[];
  error?: string;
  lastLoadedAt?: number;
}

const LS_CACHE_KEY = 'sidebar.portfolios.cache.v2';
const LS_SELECTED_KEY = 'sidebar.selectedPortfolio';

// Module-level memory fallback (survives component unmount/re-mount within same JS context)
let lastSidebarPortfolios: Portfolio[] = [];

function debugLog(label: string, payload: Record<string, unknown>) {
  // Enable verbose logs only if global debug flag not explicitly disabled
  // Turn on/off via: window.__SIDEBAR_DEBUG = true/false in devtools
  try {
  // @ts-expect-error dev diagnostic flag (not typed on window)
  const enabled = (typeof window !== 'undefined' && window.__SIDEBAR_DEBUG !== false);
    if (!enabled) return;
    const ts = new Date().toISOString();
    // Structured collapsed group
  console.groupCollapsed(`%c[sidebar] ${label} @ ${ts}`,'color:#58a6ff');
  console.log(payload);
  console.groupEnd();
  } catch {}
  // Fire-and-forget send to backend so it appears in server CLI
  try {
    if (typeof window !== 'undefined') {
      const base = getBase();
      fetch(base + '/v1/dev/sidebar-log', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ label, payload, ts: Date.now() })
      }).catch(err => { try { console.warn('[sidebar] log send failed', err); } catch {} });
    }
  } catch (e) { try { console.warn('[sidebar] log exception', e); } catch {} }
}

export default function SidebarPortfolios() {
  const router = useRouter();
  const pathname = usePathname();
  const { push } = useToast();

  const initialCache: Portfolio[] = (() => {
    if (lastSidebarPortfolios.length) {
      debugLog('hydrate-from-module', { count: lastSidebarPortfolios.length });
      return lastSidebarPortfolios;
    }
    if (typeof window === 'undefined') return [];
    try { const raw = localStorage.getItem(LS_CACHE_KEY); if (raw) { const parsed = JSON.parse(raw); debugLog('hydrate-from-localStorage', { count: Array.isArray(parsed)? parsed.length:0 }); return parsed; } } catch {}
    return [];
  })();

  const [state, setState] = useState<PortfolioState>({ phase: 'idle', data: initialCache });
  const dataRef = useRef(state.data); useEffect(()=>{ dataRef.current = state.data; }, [state.data]);

  // Derive selectedId from URL or persisted key
  const selectedFromPath = (() => {
    if (!pathname) return null;
    const m = pathname.match(/\/portfolios\/(\w+)/);
    return m ? m[1] : null;
  })();
  const [selectedId, setSelectedId] = useState<string | null>(() => selectedFromPath || (typeof window !== 'undefined' ? localStorage.getItem(LS_SELECTED_KEY) : null));
  useEffect(()=>{ if(selectedFromPath) setSelectedId(selectedFromPath); }, [selectedFromPath]);
  useEffect(()=>{ if(selectedId) localStorage.setItem(LS_SELECTED_KEY, selectedId); }, [selectedId]);

  const persistCache = (list: Portfolio[]) => {
    try { localStorage.setItem(LS_CACHE_KEY, JSON.stringify(list)); } catch {}
  };

  const applyList = useCallback((list: Portfolio[], phaseOverride?: Phase, meta?: Record<string, unknown>) => {
    // Defensive: never clobber a non-empty existing list with an empty one (transient backend / race)
    if (list.length === 0 && dataRef.current.length > 0) {
      debugLog('applyList:skip-empty', { prev: dataRef.current.length, meta });
      return; // keep previous list
    }
    debugLog('applyList', { incoming: list.length, prev: dataRef.current.length, phaseOverride, meta });
    // Update React state (do not force "loading" once we have data)
    setState(s => ({ phase: phaseOverride || (s.phase==='idle'?'ready':s.phase), data: list, lastLoadedAt: Date.now() }));
    // Persist & module cache only if we actually have something (non-empty)
    if (list.length) {
      persistCache(list);
      lastSidebarPortfolios = list;
    }
    // Expose debug snapshot
    try { if (typeof window !== 'undefined') { // @ts-expect-error diagnostic state snapshot
      window.__SIDEBAR_STATE = { phase: phaseOverride || state.phase, list: list.map(p=>p.id), selected: selectedId, ts: Date.now() }; } } catch {}
    // Fix selected if missing
    setSelectedId(sel => sel && list.some(p=>p.id===sel) ? sel : (list[0]?.id || sel));
  }, [state.phase, selectedId]);

  const fetchPortfolios = useCallback(async (attempt = 1): Promise<Portfolio[]|null> => {
    debugLog('fetchPortfolios:start', { attempt });
    try {
      const res = await api.listPortfolios();
      debugLog('fetchPortfolios:resp', { attempt, length: Array.isArray(res)? res.length: 'non-array' });
      if (!Array.isArray(res)) return [];
      // Retry on suspicious empty (we have data already)
      if (res.length === 0 && dataRef.current.length > 0 && attempt < 3) {
        await new Promise(r=>setTimeout(r, 250 * attempt));
        return fetchPortfolios(attempt+1);
      }
      return res;
    } catch (e) {
      debugLog('fetchPortfolios:error', { attempt, error: (e as Error)?.message });
      if (attempt < 3) { await new Promise(r=>setTimeout(r, 300 * attempt)); return fetchPortfolios(attempt+1); }
      throw e;
    }
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    if (state.phase === 'idle') setState(s => ({ ...s, phase: 'loading' }));
    (async () => {
      try {
        const list = await fetchPortfolios();
        if (cancelled || !list) return;
        applyList(list, 'ready', { source:'initial' });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Load failed';
        setState(s => ({ ...s, phase: s.data.length? 'ready':'error', error: msg }));
        if(!state.data.length) push({ type:'error', title:'Portfolios load failed', message: msg });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Periodic refresh (light weight)
  useEffect(() => {
    const iv = setInterval(()=> { fetchPortfolios().then(list => { if(list) applyList(list, undefined, { source:'interval'}); }).catch(()=>{}); }, 30000);
    return () => clearInterval(iv);
  }, [fetchPortfolios, applyList]);

  // CRUD handlers
  async function createPortfolio(name: string) {
    const trimmed = name.trim(); if(!trimmed) return;
    const optimistic: Portfolio = { id: 'temp-'+Math.random().toString(36).slice(2), name: trimmed, baseCcy: 'USD', createdAt: new Date().toISOString() };
    applyList([...dataRef.current, optimistic], undefined, { action:'create:optimistic' });
    try {
      const created = await api.createPortfolio(trimmed);
      applyList(dataRef.current.map(p => p.id === optimistic.id ? created : p), undefined, { action:'create:confirmed' });
      setSelectedId(created.id); router.push(`/portfolios/${created.id}`);
    } catch (e) {
      applyList(dataRef.current.filter(p => p.id !== optimistic.id), undefined, { action:'create:rollback', error:(e as Error)?.message });
      push({ type:'error', title:'Create failed', message: (e as Error)?.message || 'Error' });
    }
  }
  async function renamePortfolio(id: string, name: string) {
    const trimmed = name.trim(); if(!trimmed) return;
    const prev = dataRef.current;
    applyList(prev.map(p => p.id===id? { ...p, name: trimmed }: p), undefined, { action:'rename:optimistic', id });
    try { const updated = await api.renamePortfolio(id, trimmed); applyList(prev.map(p=> p.id===id? updated: p), undefined, { action:'rename:confirmed', id }); }
    catch(e){ applyList(prev, undefined, { action:'rename:rollback', id, error:(e as Error)?.message }); push({ type:'error', title:'Rename failed', message:(e as Error)?.message||'Error' }); }
  }
  async function deletePortfolio(p: Portfolio) {
    if(!confirm(`Delete portfolio '${p.name}'?`)) return;
    const prev = dataRef.current;
    applyList(prev.filter(x=>x.id!==p.id), undefined, { action:'delete:optimistic', id:p.id });
    try { await api.deletePortfolio(p.id); if(selectedId===p.id) setSelectedId(dataRef.current[0]?.id||null); debugLog('delete:confirmed',{ id:p.id }); }
    catch(e){ applyList(prev, undefined, { action:'delete:rollback', id:p.id, error:(e as Error)?.message }); push({ type:'error', title:'Delete failed', message:(e as Error)?.message||'Error' }); }
  }

  // Upload/import minimal (defer full feature for clarity) — existing upload logic can be re-added later.

  // UI State for creation & renaming
  const [newName,setNewName] = useState('');
  const [showCreate,setShowCreate] = useState(false);
  const newInputRef = useRef<HTMLInputElement|null>(null);
  // Listen for global toggle event from header + button
  useEffect(()=>{
    function toggle(){ setShowCreate(v=>{ const next=!v; if(!next) setNewName(''); return next; }); }
    window.addEventListener('sidebar:toggle-create', toggle);
    return ()=> window.removeEventListener('sidebar:toggle-create', toggle);
  },[]);
  useEffect(()=>{ if(showCreate) setTimeout(()=> newInputRef.current?.focus(), 30); }, [showCreate]);
  const [editingId,setEditingId] = useState<string|null>(null);
  const [editingVal,setEditingVal] = useState('');

  // removed unused beginCreate (unused)
  function submitCreate(e:React.FormEvent){ e.preventDefault(); if(!newName.trim()) return; createPortfolio(newName); setNewName(''); setShowCreate(false); }
  function cancelCreate(){ setShowCreate(false); setNewName(''); }
  function beginEdit(p:Portfolio){ setEditingId(p.id); setEditingVal(p.name); }
  function commitEdit(){ if(editingId){ renamePortfolio(editingId, editingVal); setEditingId(null);} }

  function navigate(id:string){
    const href = `/portfolios/${id}`; debugLog('navigate:click',{ id, href }); setSelectedId(id); let soft = true; try { router.push(href); } catch { soft=false; }
    // First fallback: if soft navigation failed (path unchanged) after 160ms
    setTimeout(()=>{ if(soft && window.location.pathname !== href) { debugLog('navigate:fallback-160',{ id, href, current: window.location.pathname }); window.location.href = href; } }, 160);
    // Hard guarantee: even if router push partially mounted and crashed, enforce full navigation after 700ms
    setTimeout(()=>{ if(window.location.pathname !== href) { debugLog('navigate:force-hard-reload',{ id, href, current: window.location.pathname }); window.location.assign(href); } }, 700);
  }

  const loading = state.phase==='loading' && state.data.length===0;
  const portfolios = state.data;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {loading && (
        <div style={{ fontSize:11, opacity:0.6 }}>
          <div className="sidebar-preload-item skeleton" style={{ height:18, width:'80%' }} />
          <div className="sidebar-preload-item skeleton" style={{ height:18, width:'60%' }} />
        </div>
      )}
      {/* Debug overlay (toggle with window.__SIDEBAR_DEBUG = true) */}
      {typeof window !== 'undefined' && // @ts-expect-error dev flag
        window.__SIDEBAR_DEBUG && (
          <div style={{ fontSize:9, opacity:0.6, lineHeight:1.2, border:'1px solid #30363d', padding:4, borderRadius:4 }}>
            phase:{state.phase} len:{portfolios.length} sel:{selectedId||'-'}
          </div>
        )}
      {portfolios.map(p => {
        const active = p.id === selectedId;
        const isTemp = p.id.startsWith('temp-');
        const editing = editingId === p.id;
        return (
          <div
            key={p.id}
            style={{ display:'flex', flexDirection:'column', gap:4, border:'1px solid var(--color-border)', padding:'6px 8px', borderRadius:6, background: active? 'var(--color-bg-alt)':'#0d1117', opacity:isTemp?0.6:1, position:'relative' }}
            onMouseEnter={e=>{ const act = e.currentTarget.querySelector<HTMLDivElement>('.pf-actions'); if(act) act.style.opacity='1'; }}
            onMouseLeave={e=>{ const act = e.currentTarget.querySelector<HTMLDivElement>('.pf-actions'); if(act) act.style.opacity='0'; }}
          >
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              {!editing && (
                <a
                  href={`/portfolios/${p.id}`}
                  onClick={(e)=>{ if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0) return; e.preventDefault(); navigate(p.id); }}
                  style={{ flex:1, textDecoration:'none', color:'var(--color-fg)', fontWeight:active?600:500, padding:0, cursor:'pointer', background:'transparent', border:'none' }}
                >
                  {p.name}
                </a>
              )}
              {editing && (
                <form onSubmit={(e)=>{ e.preventDefault(); commitEdit(); }} style={{ flex:1 }}>
                  <input autoFocus value={editingVal} onChange={e=>setEditingVal(e.target.value)} onBlur={commitEdit} style={{ width:'100%', padding:'2px 4px', fontSize:12 }} />
                </form>
              )}
              <div className='pf-actions' style={{ display:'flex', gap:4, opacity:0, transition:'opacity 0.15s' }}>
                {!editing && <button title="Rename" onClick={()=>beginEdit(p)} className="mini-btn">✎</button>}
                <button title="Delete" onClick={()=>deletePortfolio(p)} className="mini-btn" style={{ color:'#f85149' }}>✕</button>
              </div>
            </div>
          </div>
        );
      })}
      {showCreate && (
        <form onSubmit={submitCreate} style={{ display:'flex', gap:4 }}>
          <input ref={newInputRef} placeholder='New portfolio' value={newName} onChange={e=>setNewName(e.target.value)} style={{ flex:1, padding:'2px 4px', fontSize:12 }} />
          <button type='submit' className='mini-btn' disabled={!newName.trim()}>Add</button>
          <button type='button' className='mini-btn' onClick={cancelCreate} title='Cancel' style={{ color:'#f85149' }}>✕</button>
        </form>
      )}
      {(!loading && portfolios.length===0) && <div style={{ fontSize:12, opacity:0.6 }}>No portfolios</div>}
    </div>
  );
}
