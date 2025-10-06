"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@lib/api';

// Lightweight symbol search bar with optional quick suggestions.
export default function TopSearchClient() {
  const [q, setQ] = useState('');
  const [suggest, setSuggest] = useState<Array<{ symbol:string; shortname?:string; longname?:string; exch?:string }>>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(()=>{
    const term = q.trim();
    if(term.length < 2){ setSuggest([]); return; }
    let active = true; const current = term;
    const controller = new AbortController();
    const run = async () => {
      try {
        const res = await api.search(current.toUpperCase());
        if(!active) return;
        setSuggest(res.items || []);
        setOpen(true);
      } catch { if(active) setSuggest([]); }
    };
    run();
    return ()=>{ active=false; controller.abort(); };
  },[q]);

  useEffect(()=>{
    function onClick(e:MouseEvent){ if(!boxRef.current) return; if(!boxRef.current.contains(e.target as Node)) setOpen(false); }
    window.addEventListener('click', onClick);
    return ()=> window.removeEventListener('click', onClick);
  },[]);

  function submit(symbol?:string){
    const target = (symbol || q).trim().toUpperCase();
    if(!target) return;
    router.push(`/symbol/${encodeURIComponent(target)}`);
    setOpen(false);
  }

  return (
    <div ref={boxRef} style={{ position:'relative', display:'flex', alignItems:'center', gap:6 }}>
      <button type='button' onClick={()=>history.back()} style={navBtnStyle} title='Back'>◀</button>
      <button type='button' onClick={()=>history.forward()} style={navBtnStyle} title='Forward'>▶</button>
      <form onSubmit={(e)=>{ e.preventDefault(); submit(); }} style={{ display:'flex', alignItems:'center', gap:0 }}>
        <div style={{ position:'relative' }}>
          <span style={{ position:'absolute', left:10, top:5, fontSize:12, opacity:0.55 }}>🔍</span>
          <input
            aria-label='Search symbol'
            value={q}
            onChange={e=>{ setQ(e.target.value); setOpen(true); }}
            placeholder='Search symbol or company'
            style={{ background:'#161b22', border:'1px solid #30363d', borderRadius:20, padding:'4px 14px 4px 26px', fontSize:12, color:'var(--color-fg)', width:250, outline:'none' }}
          />
        </div>
      </form>
      {open && suggest.length>0 && (
        <div style={{ position:'absolute', top:'100%', left:52, marginTop:4, background:'#161b22', border:'1px solid #30363d', borderRadius:8, padding:6, display:'flex', flexDirection:'column', gap:4, minWidth:240, zIndex:50, boxShadow:'0 4px 12px rgba(0,0,0,0.4)' }}>
          {suggest.map(s => (
            <button key={s.symbol} onClick={()=>submit(s.symbol)} style={{ background:'transparent', border:'none', textAlign:'left', padding:'6px 6px', fontSize:12, cursor:'pointer', color:'var(--color-fg)', borderRadius:6, display:'flex', flexDirection:'column', gap:2 }} onMouseDown={e=>e.preventDefault()} onKeyDown={e=>{ if(e.key==='Enter'){ submit(s.symbol);} }}>
              <span style={{ fontWeight:600, letterSpacing:0.5 }}>{s.symbol}</span>
              <span style={{ fontSize:10, opacity:0.55 }}>{s.longname || s.shortname || ''}</span>
            </button>
          ))}
          <div style={{ fontSize:9, opacity:0.45, padding:'2px 4px' }}>Enter to open • Esc to close</div>
        </div>
      )}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background:'#161b22',
  border:'1px solid #30363d',
  color:'#9aa0a6',
  fontSize:11,
  padding:'4px 6px',
  borderRadius:6,
  cursor:'pointer',
  lineHeight:1,
  width:30,
  height:28,
  display:'flex',
  alignItems:'center',
  justifyContent:'center'
};
