"use client";
import React, { useEffect, useState } from "react";
import { api, IngestRun } from "@lib/api";
import { Panel } from "@components/ui/Panel";
import { DataTable, Column } from "@components/ui/DataTable";
import { timeAgo } from "@lib/time";

interface Props {
  portfolioId: string;
  initial: IngestRun[];
}

export default function IngestsLive({ portfolioId, initial }: Props) {
  const [rows, setRows] = useState<IngestRun[]>(initial);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        setLoading(true);
        const ing = await api.listIngests(portfolioId);
        setRows(ing);
        setLastRefresh(new Date());
      } finally {
        setLoading(false);
      }
    }, 7000);
    return () => clearInterval(interval);
  }, [portfolioId]);

  // Listen for optimistic pending ingest events
  useEffect(() => {
    type PendingDetail = { portfolioId: string; run: IngestRun };
    function onPending(ev: Event) {
      const custom = ev as CustomEvent<PendingDetail>;
      const detail = custom.detail;
      if (!detail || detail.portfolioId !== portfolioId) return;
      const run = detail.run;
      setRows((curr) => (curr.some((r) => r.id === run.id) ? curr : [run, ...curr]));
    }
    window.addEventListener("ingest:pending", onPending);
    return () => window.removeEventListener("ingest:pending", onPending);
  }, [portfolioId]);

  const columns: Column<IngestRun>[] = [
    { key: "startedAt", label: "Started", sortable: true, render: (r) => timeAgo(r.startedAt) },
    { key: "status", label: "Status", sortable: true },
    { key: "rowsOk", label: "Rows OK", sortable: true, align: "right" },
    { key: "rowsFailed", label: "Rows Failed", sortable: true, align: "right" },
  ];

  return (
    <Panel
      title="Ingestion Runs"
      actions={
        <span style={{ fontSize: 10, opacity: 0.6 }}>
          {loading ? "Refreshing…" : lastRefresh ? `Upd ${lastRefresh.toLocaleTimeString()}` : ""}
        </span>
      }
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        sort={sort}
        onSortChange={setSort}
        emptyMessage="No ingests"
      />
    </Panel>
  );
}
