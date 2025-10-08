"use client";
import React, { useEffect, useRef, useState } from "react";
import { api, Position, IngestRun } from "@lib/api";
import { Panel } from "@components/ui/Panel";
import SymbolLink from "@components/ui/SymbolLink";
import { timeAgo } from "@lib/time";
import { useToast } from "@components/ui/toast";

interface Props {
  id: string;
  initialPositions: Position[];
  initialIngests: IngestRun[];
  initialName?: string;
  baseCcy?: string;
}
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
};
interface Metrics {
  mv: number;
  day: number;
  dayPct: number;
  pl: number;
  plPct: number;
  last?: Date | null;
}

const cache: Record<string, { positions: Position[]; ingests: IngestRun[] }> = {};

export default function PortfolioClient({
  id,
  initialPositions,
  initialIngests,
  initialName = "Portfolio",
  baseCcy = "USD",
}: Props) {
  const cached = cache[id];
  const [positions, setPositions] = useState<Enriched[]>(cached?.positions || initialPositions);
  const [ingests, setIngests] = useState<IngestRun[]>(cached?.ingests || initialIngests);
  const [name, setName] = useState<string>(initialName);
  const [ccy, setCcy] = useState<string>(baseCcy);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "refreshing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastQuoteAt, setLastQuoteAt] = useState<Date | null>(null);
  const [newRow, setNewRow] = useState<Enriched | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { push } = useToast();

  // Persist to in-memory cache so switching away/back is instant
  useEffect(() => {
    cache[id] = { positions: positions.map(strip), ingests };
  }, [id, positions, ingests]);

  // Load on id change
  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStatus((prev) => (prev === "idle" ? "loading" : "refreshing"));
    setError(null);
    (async () => {
      try {
        const [detail, ing] = await Promise.all([
          api.getPortfolioWithPositions(id),
          api.listIngests(id),
        ]);
        if (ac.signal.aborted) return;
        setPositions((prev) => merge(detail.portfolio.positions, prev));
        setIngests(ing);
        if (detail.portfolio.name) setName(detail.portfolio.name);
        if (detail.portfolio.baseCcy) setCcy(detail.portfolio.baseCcy);
        setStatus("idle");
      } catch (e) {
        if (ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
        setStatus("error");
      }
    })();
    return () => ac.abort();
  }, [id]);

  // Structural positions polling
  useEffect(() => {
    if (newRow) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    let stop = false;
    async function loop() {
      try {
        const fresh = await api.listPositions(id);
        if (stop) return;
        setPositions((p) => merge(fresh, p));
      } catch {
      } finally {
        if (!stop) t = setTimeout(loop, 12000);
      }
    }
    t = setTimeout(loop, 12000);
    return () => {
      stop = true;
      if (t) clearTimeout(t);
    };
  }, [id, newRow]);

  // Quotes polling
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    let stop = false;
    async function load() {
      if (!positions.length) {
        t = setTimeout(load, 15000);
        return;
      }
      try {
        const syms = [...new Set(positions.map((p) => p.symbol.toUpperCase()))];
        const q = await api.batchQuotes(syms);
        if (stop) return;
        setPositions((ps) =>
          ps.map((p) => {
            const qq = q[p.symbol.toUpperCase()];
            if (!qq) return p;
            if (qq.error) return { ...p, error: qq.error };
            const price = Number(qq.price);
            const previousClose =
              qq.previousClose != null ? Number(qq.previousClose) : p.previousClose;
            const marketValue = price * Number(p.quantity);
            const pl = (price - Number(p.avgCost)) * Number(p.quantity);
            const dayChange =
              previousClose != null ? (price - previousClose) * Number(p.quantity) : p.dayChange;
            const dayChangePct =
              previousClose != null
                ? ((price - previousClose) / previousClose) * 100
                : p.dayChangePct;
            return {
              ...p,
              price,
              previousClose,
              marketValue,
              pl,
              dayChange,
              dayChangePct,
              asOf: qq.asOf,
            };
          }),
        );
        setLastQuoteAt(new Date());
      } finally {
        if (!stop) t = setTimeout(load, 15000);
      }
    }
    load();
    return () => {
      stop = true;
      if (t) clearTimeout(t);
    };
  }, [id, positions.length]);

  // Ingests polling
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    let stop = false;
    async function loop() {
      try {
        const ing = await api.listIngests(id);
        if (!stop) setIngests(ing);
      } catch {
      } finally {
        if (!stop) t = setTimeout(loop, 9000);
      }
    }
    t = setTimeout(loop, 9000);
    return () => {
      stop = true;
      if (t) clearTimeout(t);
    };
  }, [id]);

  // Metrics derivation
  useEffect(() => {
    if (!positions.length) {
      setMetrics(null);
      return;
    }
    const mv = positions.reduce((a, p) => a + (p.marketValue || 0), 0);
    const prev = positions.reduce(
      (a, p) => a + (p.previousClose ?? p.price ?? 0) * Number(p.quantity),
      0,
    );
    const day = prev ? mv - prev : 0;
    const dayPct = prev ? (day / prev) * 100 : 0;
    const pl = positions.reduce((a, p) => a + (p.pl || 0), 0);
    const plPct = mv && mv - pl !== 0 ? (pl / (mv - pl)) * 100 : 0;
    setMetrics({ mv, day, dayPct, pl, plPct, last: lastQuoteAt });
  }, [positions, lastQuoteAt]);

  // CRUD helpers
  function startNew() {
    if (newRow) return;
    setNewRow({
      id: "__new__",
      portfolioId: id,
      symbol: "",
      quantity: 0,
      avgCost: 0,
      createdAt: new Date().toISOString(),
    });
  }
  function updateNew(field: "symbol" | "quantity" | "avgCost", v: string) {
    setNewRow((r) => (r ? { ...r, [field]: field === "symbol" ? v.toUpperCase() : Number(v) } : r));
  }
  function cancelNew() {
    setNewRow(null);
  }
  async function saveNew() {
    if (!newRow) return;
    const symbol = newRow.symbol.trim().toUpperCase();
    if (!symbol || newRow.quantity <= 0) {
      cancelNew();
      return;
    }
    let avgCost = Number(newRow.avgCost);
    if (!avgCost || avgCost <= 0) {
      try {
        const q = await api.batchQuotes([symbol]);
        const qq = q[symbol];
        if (qq && qq.price) avgCost = Number(qq.price);
      } catch {}
    }
    try {
      const created = await api.createPosition(id, symbol, Number(newRow.quantity), avgCost);
      setPositions((ps) => [...ps, created]);
    } finally {
      setNewRow(null);
    }
  }
  function enterEdit(pid: string) {
    setPositions((ps) =>
      ps.map((p) => (p.id === pid ? { ...p, _editing: true } : { ...p, _editing: false })),
    );
  }
  function editField(pid: string, field: "quantity" | "avgCost", value: number) {
    setPositions((ps) => ps.map((p) => (p.id === pid ? { ...p, [field]: value } : p)));
  }
  async function saveEdit(pid: string) {
    const row = positions.find((p) => p.id === pid);
    if (!row) return;
    try {
      await api.updatePosition(pid, {
        quantity: Number(row.quantity),
        avgCost: Number(row.avgCost),
      });
    } catch {
    } finally {
      setPositions((ps) => ps.map((p) => (p.id === pid ? { ...p, _editing: false } : p)));
    }
  }
  async function delPosition(pid: string) {
    if (!confirm("Delete position?")) return;
    const prev = positions;
    setPositions((ps) => ps.filter((p) => p.id !== pid));
    try {
      await api.deletePosition(pid);
    } catch {
      setPositions(prev);
    }
  }
  async function exportCsv() {
    setExporting(true);
    try {
      const csv = await api.exportPositionsCsv(id);
      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "positions.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImporting(true);
    try {
      let presign = await api.presignPositionsUpload(id, f.name);
      let put = await fetch(presign.url, {
        method: "PUT",
        body: f,
        headers: { "Content-Type": "text/csv", ...(presign.headers || {}) },
      });
      if (!put.ok) {
        const txt = await put.text().catch(() => "");
        const needsChecksum = /checksum-crc32/i.test(txt) || /InvalidRequest/i.test(txt);
        if (needsChecksum) {
          const b64 = await computeCrc32Base64(f);
          presign = await api.presignPositionsUpload(id, f.name); // re-presign without checksum server set; client supplies header
          put = await fetch(presign.url, {
            method: "PUT",
            body: f,
            headers: { "Content-Type": "text/csv", "x-amz-checksum-crc32": b64 },
          });
        }
        if (!put.ok) {
          const failTxt = await put.text().catch(() => "");
          throw new Error(`S3 upload failed (${put.status}) ${failTxt.slice(0, 120)}`);
        }
      }
      await api.enqueueIngest(id, presign.key);
      push({ type: "success", title: "Import queued", message: f.name });
      try {
        const fresh = await api.listIngests(id);
        setIngests(fresh);
      } catch {}
    } catch (err) {
      console.error("S3 import failed", err);
      const msg = err instanceof Error ? err.message : "Failed";
      push({ type: "error", title: "S3 import failed", message: msg });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const rows: Enriched[] = newRow ? [...positions, newRow] : positions;

  const currencySymbol =
    ccy === "USD" ? "$" : ccy === "ILS" ? "₪" : ccy === "EUR" ? "€" : ccy + " ";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Top summary row */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 32,
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div style={{ minWidth: 260, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{name}</div>
          <div style={{ fontSize: 34, fontWeight: 600, lineHeight: 1 }}>
            {`${currencySymbol}${(metrics ? metrics.mv : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
          <div style={{ fontSize: 14 }}>
            <span className={(metrics ? metrics.day : 0) >= 0 ? "pl-pos" : "pl-neg"}>
              {(metrics ? metrics.day : 0) >= 0 ? "+" : ""}
              {(metrics ? metrics.day : 0).toFixed(2)} (
              {(metrics ? metrics.dayPct : 0) >= 0 ? "+" : ""}
              {(metrics ? metrics.dayPct : 0).toFixed(2)}%) today
            </span>
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span>
              Unreal P/L:{" "}
              <b className={(metrics ? metrics.pl : 0) >= 0 ? "pl-pos" : "pl-neg"}>
                {(metrics ? metrics.pl : 0) >= 0 ? "+" : ""}
                {(metrics ? metrics.pl : 0).toFixed(2)}
              </b>{" "}
              ({(metrics ? metrics.plPct : 0) >= 0 ? "+" : ""}
              {(metrics ? metrics.plPct : 0).toFixed(2)}%)
            </span>
            <span>Quotes: {metrics && metrics.last ? metrics.last.toLocaleTimeString() : "—"}</span>
            {status !== "idle" && (
              <span style={{ opacity: 0.5 }}>
                {status === "loading" ? "Loading…" : "Refreshing…"}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <button
            onClick={() => fileRef.current?.click()}
            className="mini-btn"
            disabled={importing}
          >
            {importing ? "Import…" : "Import CSV"}
          </button>
          <button onClick={exportCsv} className="mini-btn" disabled={exporting}>
            {exporting ? "Export…" : "Export CSV"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={onFile}
          />
        </div>
      </div>

      <Panel
        title="Positions"
        actions={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="mini-btn" onClick={startNew} title="Add Position">
              ＋
            </button>
            <span style={{ fontSize: 10, opacity: 0.6 }}>
              {lastQuoteAt ? `Quotes ${lastQuoteAt.toLocaleTimeString()}` : "—"}
            </span>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {error && (
            <div style={{ fontSize: 12, color: "var(--color-danger)" }}>Error: {error}</div>
          )}
          <table className="data-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Symbol</th>
                <th style={{ textAlign: "right" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Avg Cost</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ textAlign: "right" }}>Day Δ</th>
                <th style={{ textAlign: "right" }}>Day %</th>
                <th style={{ textAlign: "right" }}>Mkt Value</th>
                <th style={{ textAlign: "right" }}>Unreal P/L</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const editing = r._editing;
                const isNew = r.id === "__new__";
                return (
                  <tr key={r.id}>
                    <td>
                      {isNew ? (
                        <input
                          value={r.symbol}
                          onChange={(e) => updateNew("symbol", e.target.value)}
                          style={{ width: 80 }}
                          placeholder="SYM"
                        />
                      ) : (
                        <SymbolLink symbol={r.symbol}>{r.symbol}</SymbolLink>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {isNew ? (
                        <input
                          type="number"
                          value={r.quantity || ""}
                          onChange={(e) => updateNew("quantity", e.target.value)}
                          style={{ width: 70 }}
                        />
                      ) : editing ? (
                        <input
                          autoFocus
                          type="number"
                          value={r.quantity}
                          onChange={(e) => editField(r.id, "quantity", Number(e.target.value))}
                          onBlur={() => saveEdit(r.id)}
                        />
                      ) : (
                        <span onDoubleClick={() => enterEdit(r.id)} style={{ cursor: "pointer" }}>
                          {r.quantity}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {isNew ? (
                        <input
                          type="number"
                          step="0.01"
                          value={r.avgCost || ""}
                          onChange={(e) => updateNew("avgCost", e.target.value)}
                          style={{ width: 80 }}
                          placeholder="Auto"
                        />
                      ) : editing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={r.avgCost}
                          onChange={(e) => editField(r.id, "avgCost", Number(e.target.value))}
                          onBlur={() => saveEdit(r.id)}
                        />
                      ) : (
                        <span onDoubleClick={() => enterEdit(r.id)} style={{ cursor: "pointer" }}>
                          {Number(r.avgCost).toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {r.price != null ? r.price.toFixed(2) : r.error ? "Err" : "…"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {r.dayChange != null ? (
                        <span className={r.dayChange >= 0 ? "pl-pos" : "pl-neg"}>
                          {r.dayChange.toFixed(2)}
                        </span>
                      ) : (
                        "…"
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {r.dayChangePct != null ? (
                        <span className={r.dayChangePct >= 0 ? "pl-pos" : "pl-neg"}>
                          {r.dayChangePct.toFixed(2)}%
                        </span>
                      ) : (
                        "…"
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {r.marketValue != null ? r.marketValue.toFixed(2) : "…"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {r.pl != null ? (
                        <span className={r.pl >= 0 ? "pl-pos" : "pl-neg"}>{r.pl.toFixed(2)}</span>
                      ) : (
                        "…"
                      )}
                    </td>
                    <td>
                      {isNew ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            className="mini-btn"
                            style={{ background: "var(--color-success)", color: "#fff" }}
                            onClick={saveNew}
                          >
                            ✔
                          </button>
                          <button
                            className="mini-btn"
                            style={{ color: "var(--color-danger)" }}
                            onClick={cancelNew}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          className="mini-btn"
                          style={{ color: "var(--color-danger)" }}
                          onClick={() => delPosition(r.id)}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ opacity: 0.6, padding: "6px 8px" }}>
                    No positions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ fontSize: 10, opacity: 0.5 }}>
            Double‑click Qty / Avg Cost to edit. Use ＋ or button to add new position (Avg Cost
            auto-fills if blank).
          </div>
        </div>
      </Panel>

      <Panel
        title="Ingestion Runs"
        actions={
          <span style={{ fontSize: 10, opacity: 0.6 }}>
            {ingests.length ? `${ingests.length} runs` : "—"}
          </span>
        }
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>Started</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Rows OK</th>
              <th style={{ textAlign: "right" }}>Rows Failed</th>
            </tr>
          </thead>
          <tbody>
            {ingests.map((r) => (
              <tr key={r.id}>
                <td>{timeAgo(r.startedAt)}</td>
                <td>{r.status}</td>
                <td style={{ textAlign: "right" }}>{r.rowsOk}</td>
                <td style={{ textAlign: "right" }}>{r.rowsFailed}</td>
              </tr>
            ))}
            {ingests.length === 0 && (
              <tr>
                <td colSpan={4} style={{ opacity: 0.6, padding: "6px 8px" }}>
                  No ingests
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
async function computeCrc32Base64(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xff];
  crc = (crc ^ -1) >>> 0;
  return btoa(
    String.fromCharCode((crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255),
  );
}
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

// (Removed CRC32 logic added during debugging – simplified path retained)

function strip(p: Enriched): Position {
  const { id, portfolioId, symbol, quantity, avgCost, createdAt } = p;
  return { id, portfolioId, symbol, quantity, avgCost, createdAt };
}
function merge(next: Position[], prev: Enriched[]): Enriched[] {
  const prevMap = new Map(prev.map((p) => [p.id, p] as const));
  return next.map((p) => {
    const old = prevMap.get(p.id);
    if (!old) return p;
    if (old.symbol === p.symbol) {
      const { price, previousClose, marketValue, pl, dayChange, dayChangePct, asOf, error } = old;
      return { ...p, price, previousClose, marketValue, pl, dayChange, dayChangePct, asOf, error };
    }
    return p;
  });
}
