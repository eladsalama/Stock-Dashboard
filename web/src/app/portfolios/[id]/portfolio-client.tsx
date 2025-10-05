"use client";
import React from 'react';
import { api, Position, IngestRun } from '@lib/api';
import PositionsLive, { PositionsLiveHandle } from './positions-live';
import IngestsLive from './ingests-live';
import { Panel } from '@components/ui/Panel';

interface Props { id:string; initialPositions: Position[]; initialIngests: IngestRun[] }

export default function PortfolioClient({ id, initialPositions, initialIngests }: Props) {
  const [metrics, setMetrics] = React.useState<{ mv:number; day:number; dayPct:number; pl:number; plPct:number; last?: Date|null }>();
  const fileRef = React.useRef<HTMLInputElement|null>(null);
  const [importing, setImporting] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  async function exportCsv() {
    setExporting(true);
    try {
      const csv = await api.exportPositionsCsv(id);
      const blob = new Blob([csv], { type:'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'positions.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } finally { setExporting(false); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if(!f) return;
    setImporting(true);
    try {
      const presign = await api.presignPositionsUpload(id, f.name);
      const put = await fetch(presign.url, { method:'PUT', body:f, headers:{ 'Content-Type':'text/csv' } });
      if(!put.ok) throw new Error('Upload failed');
      await api.enqueueIngest(id, presign.key);
    } catch(err) { console.error('import failed', err); }
    finally { setImporting(false); if(fileRef.current) fileRef.current.value=''; }
  }

  const positionsRef = React.useRef<PositionsLiveHandle>(null);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
      <div style={{ display:'flex', flexWrap:'wrap', gap:24, alignItems:'flex-end' }}>
        <div style={{ minWidth:160 }}>
          <div style={{ fontSize:30, fontWeight:600 }}>{metrics?.mv ? metrics.mv.toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 }) : '—'}</div>
          <div style={{ fontSize:14 }}>
            {metrics ? (
              <span className={metrics.day>=0?'pl-pos':'pl-neg'}>
                {metrics.day>=0?'+':''}{metrics.day.toFixed(2)} ({metrics.dayPct>=0?'+':''}{metrics.dayPct.toFixed(2)}%) today
              </span>
            ) : <span style={{ opacity:0.6 }}>—</span>}
          </div>
          <div style={{ fontSize:11, opacity:0.7, display:'flex', gap:12, flexWrap:'wrap' }}>
            {metrics && <span>Unreal P/L: <b className={metrics.pl>=0?'pl-pos':'pl-neg'}>{metrics.pl>=0?'+':''}{metrics.pl.toFixed(2)}</b> ({metrics.plPct>=0?'+':''}{metrics.plPct.toFixed(2)}%)</span>}
            {metrics && <span>Quotes: {metrics.last ? metrics.last.toLocaleTimeString() : '—'}</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={()=>fileRef.current?.click()} className='mini-btn' disabled={importing}>{importing? 'Import…':'Import CSV'}</button>
          <button onClick={exportCsv} className='mini-btn' disabled={exporting}>{exporting? 'Export…':'Export CSV'}</button>
          <input ref={fileRef} type='file' accept='.csv,text/csv' style={{ display:'none' }} onChange={onFile} />
        </div>
      </div>
      <Panel title="Positions" actions={<button className='mini-btn' onClick={()=>positionsRef.current?.startNew()} title='Add Position'>＋</button>}>
        <PositionsLive
          ref={positionsRef}
          portfolioId={id}
          initial={initialPositions}
          onMetrics={(m)=>setMetrics({ mv:m.totalMV, day:m.portfolioDayChange, dayPct:m.portfolioDayPct, pl:m.totalPL, plPct:m.plPct, last:m.lastQuoteAt })}
        />
      </Panel>
      <IngestsLive portfolioId={id} initial={initialIngests} />
    </div>
  );
}
