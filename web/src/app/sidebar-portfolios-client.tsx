"use client";
import React, { useEffect, useState, useRef } from 'react';
import { api, Portfolio } from '@lib/api';
import Link from 'next/link';
import { useToast } from '@components/ui/toast';

interface EditingState { id: string; name: string }

export default function SidebarPortfolios() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [csvMode, setCsvMode] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { push } = useToast();
  const [editing, setEditing] = useState<EditingState | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.listPortfolios();
        setPortfolios(list);
        if (!selectedId && list.length) setSelectedId(list[0].id);
      } catch (e:any) {
        push({ type:'error', title:'Load portfolios failed', message:e.message });
      }
    })();
  }, []);

  // Keep selection in sync with current URL (when navigating directly)
  useEffect(()=>{
    if(typeof window === 'undefined') return;
    const m = window.location.pathname.match(/\/portfolios\/(\w+)/);
    if(m) setSelectedId(prev => prev || m[1]);
  },[]);

  useEffect(()=>{
    if(selectedId) localStorage.setItem('sidebar.selectedPortfolio', selectedId);
  },[selectedId]);
  useEffect(()=>{
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('sidebar.selectedPortfolio') : null;
    if(stored) setSelectedId(stored);
  },[]);

  function beginCreate() { setShowNew(true); setCsvMode(false); setTimeout(()=>{ const el = document.getElementById('new-portfolio-input'); el?.focus(); }, 0); }
  function cancelCreate() { setShowNew(false); setNewName(''); }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if(!newName.trim()) return cancelCreate();
    setLoading(true);
    try {
      const p = await api.createPortfolio(newName.trim());
      setPortfolios(ps => [...ps, p]);
      setSelectedId(p.id);
      push({ type:'success', title:'Created', message:p.name });
    } catch(e:any) {
      push({ type:'error', title:'Create failed', message:e.message });
    } finally { setLoading(false); cancelCreate(); }
  }

  function startRename(p: Portfolio) { setEditing({ id: p.id, name: p.name }); }
  async function commitRename() {
    if(!editing) return;
    const trimmed = editing.name.trim();
    if(!trimmed) { setEditing(null); return; }
    try {
  console.debug('[sidebar] renaming portfolio', editing.id, trimmed);
  console.debug('[sidebar] PATCH', `${window.location.origin} ->`, editing.id);
  const updated = await api.renamePortfolio(editing.id, trimmed);
  // fully refetch to avoid stale counts later
  const fresh = await api.listPortfolios();
  setPortfolios(fresh);
      push({ type:'success', title:'Renamed', message:trimmed });
    } catch(e:any) {
      push({ type:'error', title:'Rename failed', message:e.message });
    } finally { setEditing(null); }
  }

  async function remove(p: Portfolio) {
    if(!confirm(`Delete portfolio ${p.name}?`)) return;
    const prev = portfolios;
    setPortfolios(ps => ps.filter(x => x.id !== p.id));
    try {
  console.debug('[sidebar] deleting portfolio', p.id);
  console.debug('[sidebar] DELETE', p.id);
  await api.deletePortfolio(p.id);
  const fresh = await api.listPortfolios();
  setPortfolios(fresh);
      push({ type:'success', title:'Deleted', message:p.name });
      if(selectedId === p.id) setSelectedId(null);
    } catch(e:any) {
      setPortfolios(prev);
      push({ type:'error', title:'Delete failed', message:e.message });
    }
  }

  async function exportCsv(p: Portfolio) {
    try {
      const csv = await api.exportPositionsCsv(p.id);
      const blob = new Blob([csv], { type:'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${p.name.replace(/[^a-z0-9-_]/gi,'_')}_positions.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch(e:any) {
      push({ type:'error', title:'Export failed', message:e.message });
    }
  }

  function openImport(p: Portfolio) {
    setCsvMode(true);
    setSelectedId(p.id);
    setTimeout(()=> fileRef.current?.click(), 0);
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if(!file || !selectedId) return;
    try {
      console.debug('[import] starting worker pipeline');
      push({ type:'info', title:'Import', message:'Presigning…' });
      const presign = await api.presignPositionsUpload(selectedId, file.name);
      console.debug('[import] presign ok', presign.key);
      push({ type:'info', title:'Import', message:'Uploading to S3…' });
      const put = await fetch(presign.url, { method:'PUT', body:file, headers:{ 'Content-Type':'text/csv' } });
      if(!put.ok) throw new Error('Upload failed');
      console.debug('[import] upload ok');
      push({ type:'info', title:'Import', message:'Enqueueing…' });
  const enq = await api.enqueueIngest(selectedId, presign.key);
  push({ type:'success', title:'Queued import', message: enq.runId ? `${file.name} (run ${enq.runId.slice(0,8)})` : file.name });
      // Optimistically add pending ingest so user sees it without waiting for poll
      if (enq.runId && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ingest:pending', { detail: { portfolioId: selectedId, run: {
          id: enq.runId,
          objectKey: presign.key,
          status: 'pending',
          rowsOk: 0,
          rowsFailed: 0,
          startedAt: new Date().toISOString(),
          finishedAt: null
        }}}));
      }
    } catch(e:any) {
      console.warn('[import] worker pipeline failed, attempting direct fallback', e);
      try {
        const text = await file.text();
        const res = await api.importPositionsCsv(selectedId, text);
        push({ type:'success', title:'Imported directly', message:`${res.imported || ''} rows` });
        if (res.runId && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ingest:pending', { detail: { portfolioId: selectedId, run: {
            id: res.runId,
            objectKey: `direct-upload/${file.name}`,
            status: 'ok',
            rowsOk: res.imported || 0,
            rowsFailed: 0,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString()
          }}}));
        }
      } catch(inner:any) {
        push({ type:'error', title:'Import failed', message: inner.message || e.message });
      }
    } finally {
      if(fileRef.current) fileRef.current.value='';
    }
  }

  function PortfolioRow({ p }: { p: Portfolio }) {
    const active = p.id === selectedId;
    const isEditing = editing?.id === p.id;
    return (
      <div key={p.id} style={{ display:'flex', flexDirection:'column', gap:4, border:'1px solid var(--color-border)', padding:'6px 8px', borderRadius:6, background: active? 'var(--color-bg-alt)':'#0d1117' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {!isEditing && (
            <Link href={`/portfolios/${p.id}`} onClick={()=>setSelectedId(p.id)} style={{ flex:1, textAlign:'left', background:'transparent', border:'none', color:'var(--color-fg)', cursor:'pointer', fontWeight:active?600:500, textDecoration:'none' }}>
              {p.name}
            </Link>
          )}
          {isEditing && (
            <form onSubmit={(e)=>{ e.preventDefault(); commitRename(); }} style={{ flex:1 }}>
              <input autoFocus value={editing.name} onChange={e=>setEditing({ id:p.id, name:e.target.value })} onBlur={commitRename} style={{ width:'100%', padding:'2px 4px', fontSize:12 }} />
            </form>
          )}
          <div style={{ display:'flex', gap:4 }}>
            {!isEditing && <button title="Rename" onClick={()=>startRename(p)} className="mini-btn">✎</button>}
            <button title="Delete" onClick={()=>remove(p)} className="mini-btn" style={{ color:'#f85149' }}>✕</button>
            <button title="Export CSV" onClick={()=>exportCsv(p)} className="mini-btn">⬇</button>
            <button title="Import CSV" onClick={()=>openImport(p)} className="mini-btn">⬆</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <input type="file" ref={fileRef} style={{ display:'none' }} accept='.csv,text/csv' onChange={onFileChange} />
      {portfolios.map(p => <PortfolioRow key={p.id} p={p} />)}
      {!showNew && <button onClick={beginCreate} className="mini-btn" style={{ alignSelf:'flex-start', marginTop:4 }}>＋ New</button>}
      {!csvMode && showNew && (
        <form onSubmit={submitCreate} style={{ display:'flex', gap:4 }}>
          <input id='new-portfolio-input' value={newName} onChange={e=>setNewName(e.target.value)} onBlur={submitCreate} placeholder='Portfolio name' style={{ flex:1, padding:'2px 4px', fontSize:12 }} />
          <button type='submit' disabled={loading} className="mini-btn" style={{ background:'#238636', color:'#fff' }}>{loading? '…':'Add'}</button>
        </form>
      )}
      {portfolios.length===0 && !showNew && <div style={{ fontSize:12, opacity:0.6 }}>No portfolios</div>}
    </div>
  );
}
