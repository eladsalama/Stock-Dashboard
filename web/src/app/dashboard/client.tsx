"use client";
import React, { useEffect, useState } from "react";
import { Portfolio, Position, api } from "@lib/api";
import { DataTable, Column } from "@components/ui/DataTable";
import { timeAgo } from "@lib/time";

interface P extends Portfolio {
  positions: Position[];
}

interface Props {
  portfolio: P;
}

interface HoldingRow {
  id: string;
  symbol: string;
  quantity: number;
  avgCost: number;
  marketValue?: number;
  price?: number;
  previousClose?: number;
  dayChange?: number;
  dayChangePct?: number;
}

const RANGES = ["1D", "1W", "1M", "3M", "1Y", "5Y"] as const;

type RangeKey = (typeof RANGES)[number];

export default function DashboardClient({ portfolio }: Props) {
  const [holdings, setHoldings] = useState<HoldingRow[]>(() =>
    portfolio.positions.map((p) => ({
      id: p.id,
      symbol: p.symbol,
      quantity: Number(p.quantity),
      avgCost: Number(p.avgCost),
    })),
  );
  const [selected, setSelected] = useState<string | null>(
    () =>
      (typeof localStorage !== "undefined" ? localStorage.getItem("dash.selectedSymbol") : null) ||
      holdings[0]?.symbol ||
      null,
  );
  const [range, setRange] = useState<RangeKey>(
    () =>
      (typeof localStorage !== "undefined"
        ? (localStorage.getItem("dash.range") as RangeKey)
        : null) || "1D",
  );
  const [candles, setCandles] = useState<Array<{ t: string; c: number }>>([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [lastQuotesAt, setLastQuotesAt] = useState<Date | null>(null);

  // Persist selection
  useEffect(() => {
    if (selected) localStorage.setItem("dash.selectedSymbol", selected);
  }, [selected]);
  useEffect(() => {
    if (range) localStorage.setItem("dash.range", range);
  }, [range]);

  // Load quotes for holdings periodically
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function loadQuotes() {
      if (!holdings.length) return;
      setLoadingQuotes(true);
      try {
        const symbols = holdings.map((h) => h.symbol);
        const q = await api.batchQuotes(symbols);
        setHoldings((hs) =>
          hs.map((h) => {
            const qq = q[h.symbol.toUpperCase()];
            if (!qq) return h;
            const price = Number(qq.price);
            const previousClose = qq.previousClose != null ? Number(qq.previousClose) : undefined;
            const marketValue = price * h.quantity;
            const dayChange =
              previousClose != null ? (price - previousClose) * h.quantity : undefined;
            const dayChangePct =
              previousClose != null ? ((price - previousClose) / previousClose) * 100 : undefined;
            return { ...h, price, previousClose, marketValue, dayChange, dayChangePct };
          }),
        );
        setLastQuotesAt(new Date());
      } finally {
        setLoadingQuotes(false);
        timer = setTimeout(loadQuotes, 15000);
      }
    }
    loadQuotes();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [holdings.length]);

  // Chart load
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    (async () => {
      setLoadingChart(true);
      try {
        const h = await api.history(selected, range);
        if (cancelled) return;
        setCandles(h.candles.map((c) => ({ t: c.t, c: c.c })));
      } finally {
        if (!cancelled) setLoadingChart(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, range]);

  const aggregateMV = holdings.reduce((a, h) => a + (h.marketValue || 0), 0);
  const aggregateDayChange = holdings.reduce((a, h) => a + (h.dayChange || 0), 0);
  const aggregateDayPct = aggregateMV
    ? (aggregateDayChange / (aggregateMV - aggregateDayChange)) * 100
    : 0;

  const holdingColumns: Column<HoldingRow>[] = [
    {
      key: "symbol",
      label: "Sym",
      sortable: true,
      render: (h) => (
        <span
          style={{
            cursor: "pointer",
            color: h.symbol === selected ? "var(--color-accent)" : undefined,
          }}
          onClick={() => setSelected(h.symbol)}
        >
          {h.symbol}
        </span>
      ),
    },
    {
      key: "price",
      label: "Price",
      sortable: true,
      align: "right",
      render: (h) => (h.price ? h.price.toFixed(2) : "…"),
    },
    {
      key: "marketValue",
      label: "Value",
      sortable: true,
      align: "right",
      render: (h) => (h.marketValue != null ? h.marketValue.toFixed(2) : "…"),
    },
    {
      key: "dayChange",
      label: "Δ Day",
      sortable: true,
      align: "right",
      render: (h) =>
        h.dayChange != null ? (
          <span className={h.dayChange >= 0 ? "pl-pos" : "pl-neg"}>{h.dayChange.toFixed(2)}</span>
        ) : (
          "…"
        ),
    },
    {
      key: "dayChangePct",
      label: "Δ %",
      sortable: true,
      align: "right",
      render: (h) =>
        h.dayChangePct != null ? (
          <span className={h.dayChangePct >= 0 ? "pl-pos" : "pl-neg"}>
            {h.dayChangePct.toFixed(2)}%
          </span>
        ) : (
          "…"
        ),
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <HeaderBar
          total={aggregateMV}
          dayChange={aggregateDayChange}
          dayPct={aggregateDayPct}
          lastQuotesAt={lastQuotesAt}
          loading={loadingQuotes}
        />
        <ChartCard
          symbol={selected}
          range={range}
          onRangeChange={setRange}
          candles={candles}
          loading={loadingChart}
          holdings={holdings}
        />
      </div>
      <div>
        <div
          className="panel"
          style={{
            maxHeight: "70vh",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div className="panel-header" style={{ justifyContent: "space-between" }}>
            <span>Holdings</span>
            <small style={{ fontSize: 10, opacity: 0.6 }}>
              {loadingQuotes ? "Quotes…" : lastQuotesAt ? timeAgo(lastQuotesAt.toISOString()) : ""}
            </small>
          </div>
          <div className="panel-body" style={{ padding: 0, overflow: "auto" }}>
            <DataTable
              columns={holdingColumns}
              rows={holdings}
              rowKey={(r) => r.id}
              emptyMessage="No holdings"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function HeaderBar({
  total,
  dayChange,
  dayPct,
  lastQuotesAt,
  loading,
}: {
  total: number;
  dayChange: number;
  dayPct: number;
  lastQuotesAt: Date | null;
  loading: boolean;
}) {
  return (
    <div className="panel" style={{ padding: 0 }}>
      <div className="panel-body" style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        <Metric label="Total Value" value={total ? total.toFixed(2) : "—"} />
        <Metric
          label="Day Change"
          value={dayChange ? dayChange.toFixed(2) : "—"}
          className={dayChange >= 0 ? "pl-pos" : "pl-neg"}
        />
        <Metric
          label="Day %"
          value={dayChange ? dayPct.toFixed(2) + "%" : "—"}
          className={dayChange >= 0 ? "pl-pos" : "pl-neg"}
        />
        <Metric
          label="Quotes"
          value={loading ? "…" : lastQuotesAt ? lastQuotesAt.toLocaleTimeString() : "—"}
        />
      </div>
    </div>
  );
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontSize: 10, opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div className={className}>{value}</div>
    </div>
  );
}

function ChartCard({
  symbol,
  range,
  onRangeChange,
  candles,
  loading,
  holdings,
}: {
  symbol: string | null;
  range: RangeKey;
  onRangeChange: (r: RangeKey) => void;
  candles: Array<{ t: string; c: number }>;
  loading: boolean;
  holdings: HoldingRow[];
}) {
  const selectedHolding = holdings.find((h) => h.symbol === symbol);
  const currentPrice = selectedHolding?.price;
  const dayChange = selectedHolding?.dayChange;
  const dayChangePct = selectedHolding?.dayChangePct;
  return (
    <div className="panel" style={{ minHeight: 400, display: "flex", flexDirection: "column" }}>
      <div className="panel-header" style={{ gap: 16, flexWrap: "wrap" }}>
        <strong>{symbol || "—"}</strong>
        <div style={{ display: "flex", gap: 6 }}>
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
              className="inline-btn"
              style={
                r === range
                  ? { background: "var(--color-bg-hover)", color: "var(--color-accent)" }
                  : undefined
              }
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 22 }}>{currentPrice != null ? currentPrice.toFixed(2) : "—"}</div>
        <div style={{ fontSize: 13 }}>
          {dayChange != null ? (
            <span className={dayChange >= 0 ? "pl-pos" : "pl-neg"}>
              {dayChange >= 0 ? "+" : ""}
              {dayChange.toFixed(2)} ({dayChangePct?.toFixed(2)}%)
            </span>
          ) : (
            "—"
          )}
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          {loading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.6,
              }}
            >
              Loading chart…
            </div>
          )}
          {!loading && <MiniLine data={candles} />}
        </div>
      </div>
    </div>
  );
}

function MiniLine({ data }: { data: Array<{ t: string; c: number }> }) {
  if (!data.length) return <div style={{ fontSize: 12, opacity: 0.6 }}>No data</div>;
  const values = data.map((d) => d.c);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((d.c - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  const last = values[values.length - 1];
  const first = values[0];
  const up = last >= first;
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0 }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={up ? "var(--color-success)" : "var(--color-danger)"}
        strokeWidth={1.2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
