"use client";
import React, { useEffect, useState, useRef } from 'react';
import { api, IngestRun } from '@lib/api';
import { Panel } from '@components/ui/Panel';
import { DataTable, Column } from '@components/ui/DataTable';
import { timeAgo } from '@lib/time';

interface Props { portfolioId: string; initial: IngestRun[] }

export default function IngestsLive({ portfolioId, initial }: Props) {
  const [rows, setRows] = useState<IngestRun[]>(initial);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        setLoading(true);
        const ing = await api.listIngests(portfolioId);
        setRows(ing);
        setLastRefresh(new Date());
      } finally { setLoading(false); }
    }, 7000);
    return () => clearInterval(interval);
  }, [portfolioId]);

  // Listen for optimistic pending ingest events
  useEffect(()=>{
    function onPending(e: any) {
      const detail = e.detail;
      if(!detail || detail.portfolioId !== portfolioId) return;
      const run = detail.run as IngestRun;
      setRows(curr => {
        if (curr.find(r => r.id === run.id)) return curr; // already there
        return [run, ...curr];
      });
    }
    window.addEventListener('ingest:pending', onPending as any);
    return () => window.removeEventListener('ingest:pending', onPending as any);
  }, [portfolioId]);

  const columns: Column<IngestRun>[] = [
    { key: 'startedAt', label: 'Started', sortable: true, render: r => timeAgo(r.startedAt) },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'rowsOk', label: 'Rows OK', sortable: true, align: 'right' },
    { key: 'rowsFailed', label: 'Rows Failed', sortable: true, align: 'right' }
  ];

  return (
    <Panel title="Ingestion Runs" actions={<span style={{ fontSize:10, opacity:0.6 }}>{loading ? 'Refreshing…' : lastRefresh ? `Upd ${lastRefresh.toLocaleTimeString()}` : ''}</span>}>
      <DataTable columns={columns} rows={rows} rowKey={r => r.id} sort={sort} onSortChange={setSort} emptyMessage="No ingests" />
    </Panel>
  );
}