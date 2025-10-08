"use client";
import React, { useEffect, useState, useRef } from "react";
import { Portfolio, Position, api } from "@lib/api";
import AdvancedPriceChart from "./AdvancedPriceChart";
import { RANGES, RangeKey } from "./constants";
import { LayoutConfig } from "./layoutConfig";
import { useAuth } from "../auth-context/AuthContext";
// Holdings table removed for IBKR-style analytics focus

interface P extends Portfolio {
  positions: Position[];
}
interface Props {
  portfolio: P;
  initialSymbol?: string;
  starInitialState?: boolean;
}

interface HoldingRow {
  id: string;
  symbol: string;
  quantity: number;
  avgCost: number;
  price?: number;
  previousClose?: number;
  marketValue?: number;
  dayChange?: number;
  dayChangePct?: number;
  longName?: string;
}

// Derived layout values from centralized LayoutConfig
const S = LayoutConfig.CHART_SCALE;
const RIGHT_COLUMN_WIDTH = LayoutConfig.RIGHT_COLUMN_WIDTH;
const GRID_GAP = LayoutConfig.GRID_GAP;
const CHART_PANEL_MIN_HEIGHT = LayoutConfig.CHART_PANEL_MIN_HEIGHT * S;
// Overview + news vertical space naturally flex; no second parameter needed

export default function DashboardClient({ portfolio, initialSymbol, starInitialState }: Props) {
  const baseHoldings: HoldingRow[] = portfolio.positions.map((p) => ({
    id: p.id,
    symbol: p.symbol.toUpperCase(),
    quantity: Number(p.quantity),
    avgCost: Number(p.avgCost),
  }));
  const [holdings, setHoldings] = useState(baseHoldings);
  const [selected, setSelected] = useState<string>(() => {
    if (initialSymbol) return initialSymbol.toUpperCase();
    const stored =
      typeof localStorage !== "undefined" ? localStorage.getItem("dash.selectedSymbol") : null;
    return stored || holdings[0]?.symbol || "";
  });
  const [range, setRange] = useState<RangeKey>(() => {
    if (typeof localStorage === "undefined") return "1d";
    const raw = localStorage.getItem("dash.range");
    if (!raw) return "1d";
    const lower = raw.toLowerCase();
    return (RANGES as readonly string[]).includes(lower) ? (lower as RangeKey) : "1d";
  });
  const [candles, setCandles] = useState<
    Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>
  >([]);
  const cacheRef = useRef<
    Map<string, Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>>
  >(new Map());
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightId = useRef(0);
  const [chartMode, setChartMode] = useState<"line" | "candles">(() => {
    if (typeof localStorage === "undefined") return "line";
    const stored = localStorage.getItem("dash.chart.mode");
    return stored === "candles" ? "candles" : "line";
  });
  // Log scale removed from UI per request; keep internal false constant
  const logScale = false;
  const [showVolMA, setShowVolMA] = useState<boolean>(
    () => localStorage?.getItem("dash.volma") === "1",
  );
  const [showBollingerBands, setShowBollingerBands] = useState<boolean>(
    () => localStorage?.getItem("dash.bb") === "1",
  );
  const [showEMA20, setShowEMA20] = useState<boolean>(
    () => localStorage?.getItem("dash.ema20") === "1",
  );
  useEffect(() => {
    localStorage.setItem("dash.volma", showVolMA ? "1" : "0");
  }, [showVolMA]);
  useEffect(() => {
    localStorage.setItem("dash.bb", showBollingerBands ? "1" : "0");
  }, [showBollingerBands]);
  useEffect(() => {
    localStorage.setItem("dash.ema20", showEMA20 ? "1" : "0");
  }, [showEMA20]);

  // Reset function to turn off all indicators
  const resetIndicators = () => {
    setShowEMA20(false);
    setShowVolMA(false);
    setShowBollingerBands(false);
    // Also reset chart zoom
    window.dispatchEvent(new CustomEvent("chart-reset"));
  };
  useEffect(() => {
    localStorage.setItem("dash.chart.mode", chartMode);
  }, [chartMode]);
  const [loadingChart, setLoadingChart] = useState(false);
  // (removed per new stats panel – keeping minimal state)
  // sort & holdings table removed
  // longName stored per holding; keep state for potential future global name override (currently unused)
  // (disabled to satisfy no-unused-vars)
  // const [longName, setLongName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // When the incoming portfolio changes (user switched portfolios in sidebar),
  // reset holdings state, selected symbol, and clear cached candles so we don't show stale data.
  useEffect(() => {
    setHoldings(
      portfolio.positions.map((p) => ({
        id: p.id,
        symbol: p.symbol.toUpperCase(),
        quantity: Number(p.quantity),
        avgCost: Number(p.avgCost),
      })),
    );
    cacheRef.current.clear();
    // Prefer explicitly provided initialSymbol, else first holding symbol
    const nextSel =
      (initialSymbol
        ? initialSymbol.toUpperCase()
        : portfolio.positions[0]?.symbol.toUpperCase()) || "";
    setSelected(nextSel);
  }, [portfolio.id]);

  // Persist preferences
  useEffect(() => {
    if (selected) localStorage.setItem("dash.selectedSymbol", selected);
  }, [selected]);
  useEffect(() => {
    if (initialSymbol && initialSymbol.toUpperCase() !== selected)
      setSelected(initialSymbol.toUpperCase());
  }, [initialSymbol]);
  useEffect(() => {
    if (range) localStorage.setItem("dash.range", range);
  }, [range]);
  // removed holdings sorting persistence

  // (quotes polling removed: stats endpoint includes price & prev close; keep holdings price static unless refreshed via selection change)

  // Debounced chart loading + caching (avoid rate limit and flicker)
  useEffect(() => {
    if (!selected) return;
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    
    // Data-driven fetch strategy: request exactly what user selected
    function getOptimalFetchRange(requestedRange: string): string {
      // Request the exact range - let backend handle it
      switch (requestedRange) {
        case "1d":
          return "1d";
        case "1w":
          return "1w";
        case "1m":
          return "1m";
        case "3m":
          return "3m";
        case "1y":
          return "1y";
        case "5y":
          return "5y";
        default:
          return "1m"; // fallback
      }
    }
    
    const fetchRange = getOptimalFetchRange(range);
    console.log(`Fetch debug: requested="${range}", calculated fetchRange="${fetchRange}"`);
    const key = `${selected}:${fetchRange}`;
    
    // Serve from cache immediately if available
    const cached = cacheRef.current.get(key);
    if (cached) setCandles(cached);
    fetchTimer.current = setTimeout(async () => {
      const myId = ++inflightId.current;
      setLoadingChart(true);
      try {
        const h = await api.history(selected, fetchRange);
        if (inflightId.current !== myId) return; // out-of-date response
        const mapped = h.candles.map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v }));
        cacheRef.current.set(key, mapped);
        setCandles(mapped);
      } catch (e) {
        if (inflightId.current === myId) {
          const msg = e instanceof Error ? e.message : "History failed";
          setError(msg);
        }
      } finally {
        if (inflightId.current === myId) setLoadingChart(false);
      }
    }, 250); // slight debounce to batch rapid range clicks
    return () => {
      if (fetchTimer.current) clearTimeout(fetchTimer.current);
    };
  }, [selected, range]); // Restore range dependency since we now fetch different amounts

  // Aggregates retained for potential future metrics panel extensions (currently not rendered)
  // const aggregateMV = holdings.reduce((a,h)=> a + (h.marketValue || 0), 0);
  // const aggregatePrev = holdings.reduce((a,h)=> a + ((h.previousClose!=null && h.quantity) ? h.previousClose * h.quantity : 0), 0);
  // const aggregateDayChange = aggregatePrev ? aggregateMV - aggregatePrev : 0;
  // (aggregate day change class computed inline where needed)

  // Removed add/edit/delete position UI for analytics-only view
  // holdings table columns removed

  const selectedHolding = holdings.find((h) => h.symbol === selected);

  // Full-height layout: consume available viewport minus header/footer handled by outer layout.
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `minmax(0,1fr) ${RIGHT_COLUMN_WIDTH}px`,
        gridTemplateRows: "1fr",
        gap: GRID_GAP,
        alignItems: "stretch",
        height: LayoutConfig.HEIGHT,
        minHeight: LayoutConfig.HEIGHT,
        overflow: "hidden",
        paddingRight: LayoutConfig.RIGHT_GAP_PX,
      }}
    >
      {/* Large Chart Area */}
      <div
        style={{
          gridColumn: "1 / 2",
          gridRow: "1 / 2",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxWidth: "100%",
          overflow: "hidden",
        }}
      >
        <ChartPanel
          symbol={selected}
          holding={selectedHolding}
          range={range}
          onRangeChange={setRange}
          candles={candles}
          loading={loadingChart}
          mode={chartMode}
          onToggleMode={() => setChartMode((m) => (m === "line" ? "candles" : "line"))}
          logScale={logScale}
          showVolMA={showVolMA}
          showBollingerBands={showBollingerBands}
          showEMA20={showEMA20}
          toggleVolMA={() => setShowVolMA((v) => !v)}
          toggleBollingerBands={() => setShowBollingerBands((v) => !v)}
          toggleEMA20={() => setShowEMA20((v) => !v)}
          resetIndicators={resetIndicators}
          starInitialState={starInitialState}
        />
        {error && <div style={{ fontSize: 12, color: "var(--color-danger)" }}>Error: {error}</div>}
      </div>
      {/* Analytics + Overview + News */}
      <div style={{ gridColumn: "2 / 3", gridRow: "1 / 2", minHeight: 0 }}>
        <AnalyticsPanel symbol={selectedHolding?.symbol} holding={selectedHolding} />
      </div>
    </div>
  );
}
// (previous 52wk stats helper removed; now served via stats endpoint)

function AnalyticsPanel({ symbol, holding }: { symbol?: string; holding?: HoldingRow }) {
  const { theme } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stats, setStats] = useState<any | null>(null);
  const [news, setNews] = useState<
    Array<{ id: string; title: string; publisher?: string; link: string; publishedAt: string }>
  >([]);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!symbol) {
      setStats(null);
      setNews([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const s = await api.stats(symbol);
        if (cancelled) return;
        setStats(s);
        try {
          const n = await api.news(symbol);
          if (!cancelled) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const raw: any = n;
            const items = Array.isArray(raw) ? raw : raw.items || raw.news || [];
            setNews(Array.isArray(items) ? items : []);
            setNewsError(items.length ? null : "No news items");
          }
        } catch (e) {
          if (!cancelled) setNewsError(e instanceof Error ? e.message : "News failed");
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sAny: any = stats || {};
  const price = holding?.price ?? sAny.open;
  const prevClose = sAny.previousClose;
  const change = price != null && prevClose != null ? price - prevClose : undefined;
  const changePct = change != null && prevClose ? (change / prevClose) * 100 : undefined;
  const cls = change != null ? (change >= 0 ? "pl-pos" : "pl-neg") : "";
  function fmt(
    v: number | undefined,
    opts: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  ) {
    if (v == null || !isFinite(v)) return "—";
    return new Intl.NumberFormat(undefined, opts).format(v);
  }
  function fmtInt(v: number | undefined) {
    if (v == null || !isFinite(v)) return "—";
    return v.toLocaleString();
  }
  function fmtCap(v: number | undefined) {
    if (v == null || !isFinite(v)) return "—";
    if (v >= 1e12) return (v / 1e12).toFixed(2) + "T";
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(2) + "K";
    return String(v);
  }
  function fmtDate(s: string | undefined) {
    if (!s) return "—";
    try {
      return new Date(s).toLocaleDateString();
    } catch {
      return "—";
    }
  }
  function fmtDiv(y: number | undefined, rate: number | undefined) {
    if (rate == null && y == null) return "—";
    const parts: string[] = [];
    if (rate != null) parts.push(rate.toFixed(2));
    if (y != null) parts.push((y * 100).toFixed(2) + "%");
    return parts.join(" / ");
  }
  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        className="panel-body dashboard-scroll-container"
        style={{ 
          overflow: "auto", 
          display: "flex", 
          flexDirection: "column", 
          gap: 14,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div
            style={{
              fontSize: LayoutConfig.STATS_HEADER_NAME_FONT_SIZE,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
              lineHeight: 1,
            }}
          >
            <span style={{ lineHeight: 1, color: theme === "light" ? "#1f2328" : "#e6edf3" }}>
              {sAny.longName || "—"}
            </span>
            <span
              style={{
                opacity: LayoutConfig.STATS_HEADER_BULLET_COLOR_OPACITY,
                lineHeight: 1,
                display: "inline-block",
                transform: `translateY(${LayoutConfig.STATS_HEADER_BULLET_NUDGE_Y}px)`,
                color: theme === "light" ? "#656d76" : "#8b949e",
              }}
            >
              •
            </span>
            <span
              style={{
                fontFamily: LayoutConfig.STATS_HEADER_SYMBOL_FONT_FAMILY,
                letterSpacing: 0.5,
                fontSize: LayoutConfig.STATS_HEADER_SYMBOL_FONT_SIZE,
                lineHeight: 1,
                color: theme === "light" ? "#1f2328" : "#e6edf3",
              }}
            >
              {symbol || "—"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div
              style={{
                fontSize: 24,
                fontWeight: 500,
                color: theme === "light" ? "#1f2328" : "#e6edf3",
              }}
            >
              {price != null ? price.toFixed(2) : "—"}
            </div>
            <div style={{ fontSize: 11 }} className={cls}>
              {change != null ? (change >= 0 ? "+" : "") + change.toFixed(2) : "—"}{" "}
              {changePct != null ? (
                <span style={{ opacity: 0.7 }}>
                  ({(changePct >= 0 ? "+" : "") + changePct.toFixed(2)}%)
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {err && (
          <div style={{ color: "var(--color-danger)", fontSize: 12 }}>Stats error: {err}</div>
        )}
        <div
          style={{
            display: "flex",
            gap: 22,
            fontSize: 10,
            flexWrap: "nowrap",
            alignItems: "flex-start",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 160 }}>
            <Stat label="Previous Close" value={fmt(sAny.previousClose)} />
            <Stat label="Open" value={fmt(sAny.open)} />
            <Stat
              label="Bid"
              value={sAny.bid ? `${fmt(sAny.bid)} x ${sAny.bidSize || "—"}` : "—"}
            />
            <Stat
              label="Ask"
              value={sAny.ask ? `${fmt(sAny.ask)} x ${sAny.askSize || "—"}` : "—"}
            />
            <Stat
              label="Day's Range"
              value={
                sAny.dayLow != null && sAny.dayHigh != null
                  ? `${fmt(sAny.dayLow)} - ${fmt(sAny.dayHigh)}`
                  : "—"
              }
            />
            <Stat
              label="52 Week Range"
              value={
                sAny.fiftyTwoWeekLow != null && sAny.fiftyTwoWeekHigh != null
                  ? `${fmt(sAny.fiftyTwoWeekLow)} - ${fmt(sAny.fiftyTwoWeekHigh)}`
                  : "—"
              }
            />
            <Stat label="Volume" value={fmtInt(sAny.volume)} />
            <Stat label="Avg. Volume" value={fmtInt(sAny.avgVolume)} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 160 }}>
            <Stat label="Market Cap" value={fmtCap(sAny.marketCap)} />
            <Stat label="Beta (5Y Monthly)" value={fmt(sAny.beta, { maximumFractionDigits: 2 })} />
            <Stat
              label="PE Ratio (TTM)"
              value={fmt(sAny.peRatioTTM, { maximumFractionDigits: 2 })}
            />
            <Stat label="EPS (TTM)" value={fmt(sAny.epsTTM, { maximumFractionDigits: 2 })} />
            <Stat label="Earnings Date" value={fmtDate(sAny.earningsDate)} />
            <Stat
              label="Forward Dividend & Yield"
              value={fmtDiv(sAny.forwardDividendYield, sAny.forwardDividendRate)}
            />
            <Stat label="Ex-Dividend Date" value={fmtDate(sAny.exDividendDate)} />
            <Stat label="1y Target Est" value={fmt(sAny.oneYearTargetEst)} />
          </div>
        </div>
        <OverviewSection stats={sAny} />
        <NewsSection news={news} loading={loading} fmtDate={fmtDate} newsError={newsError} />
      </div>
    </div>
  );
}

function ChartPanel({
  symbol,
  holding,
  range,
  onRangeChange,
  candles,
  loading,
  mode,
  onToggleMode,
  logScale,
  showVolMA,
  showBollingerBands,
  showEMA20,
  toggleVolMA,
  toggleBollingerBands,
  toggleEMA20,
  resetIndicators,
  starInitialState,
}: {
  symbol: string;
  holding?: HoldingRow;
  range: RangeKey;
  onRangeChange: (r: RangeKey) => void;
  candles: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>;
  loading: boolean;
  mode: "line" | "candles";
  onToggleMode: () => void;
  logScale: boolean;
  showVolMA: boolean;
  showBollingerBands: boolean;
  showEMA20: boolean;
  toggleVolMA: () => void;
  toggleBollingerBands: () => void;
  toggleEMA20: () => void;
  resetIndicators: () => void;
  starInitialState?: boolean;
}) {
  const { theme, user, token } = useAuth();
  const [quote, setQuote] = useState<{ price?: number; longName?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const q = await api.quote(symbol);
        if (alive) setQuote(q);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [symbol]);
  const price = holding?.price ?? quote?.price;
  // Timeframe-based change derived from current candle set (first vs last) for selected range
  let dayChange: number | undefined = undefined;
  let dayChangePct: number | undefined = undefined;
  if (candles.length >= 2) {
    const first = candles[0].c;
    const last = candles[candles.length - 1].c;
    if (first != null && last != null && first !== 0) {
      dayChange = last - first;
      dayChangePct = (dayChange / first) * 100;
    }
  }
  const longName = holding?.longName || quote?.longName;

  // SAFETY: Feature flag to disable star button if it causes issues
  const ENABLE_STAR_BUTTON = true; // Set to false to disable completely

  // ULTRA-SIMPLE star button using your brilliant idea!
  // If coming from watchlist link, star starts yellow. Otherwise starts empty.
  const [fav, setFav] = useState<boolean>(starInitialState || false);

  // SIMPLE toggle function that calls watchlist functions directly
  function toggleFav() {
    if (!ENABLE_STAR_BUTTON || !token || !symbol) return;

    try {
      const storageKey = `watchlist.symbols.v1.${user?.email || "anon"}`;
      const raw = localStorage.getItem(storageKey);
      let arr: string[] = [];

      if (raw) {
        try {
          arr = JSON.parse(raw);
        } catch {}
      }
      if (!Array.isArray(arr)) arr = [];

      const symbolUpper = symbol.trim().toUpperCase();
      const index = arr.findIndex(
        (item) => typeof item === "string" && item.trim().toUpperCase() === symbolUpper,
      );

      if (index >= 0) {
        // Remove from watchlist
        arr.splice(index, 1);
        setFav(false);
        // Call watchlist function directly
        if (window.watchlistRemove) {
          window.watchlistRemove(symbol);
        }
      } else {
        // Add to watchlist
        arr.push(symbol);
        setFav(true);
        // Call watchlist function directly
        if (window.watchlistAdd) {
          window.watchlistAdd(symbol);
        }
      }

      localStorage.setItem(storageKey, JSON.stringify(arr));
    } catch (e) {
      console.warn("Failed to toggle watchlist:", e);
    }
  }
  return (
    <div
      className="panel"
      style={{
        minHeight: CHART_PANEL_MIN_HEIGHT,
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        className="panel-header"
        style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-start", paddingBottom: 4 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "nowrap",
            minWidth: 0,
          }}
        >
          {/* Simple letter icon */}
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: theme === "light" ? "#f6f8fa" : "#141a21",
              border: theme === "light" ? "1px solid #d0d7de" : "1px solid #222e",
              fontSize: 11,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              color: theme === "light" ? "#24292f" : "#9ab",
              flex: "0 0 auto",
            }}
            title={symbol}
          >
            {symbol.slice(0, 1)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <strong
                style={{
                  fontSize: 13,
                  letterSpacing: 0.5,
                  color: theme === "light" ? "#24292f" : "#e6edf3",
                }}
              >
                {symbol}
              </strong>
              <span
                style={{
                  fontSize: 10,
                  opacity: 0.6,
                  maxWidth: 280,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: theme === "light" ? "#656d76" : "#7d8590",
                }}
              >
                {longName || "—"}
              </span>
            </div>
          </div>
          {ENABLE_STAR_BUTTON && (
            <button
              onClick={toggleFav}
              className="mini-btn"
              style={{
                fontSize: 15,
                padding: "2px 6px",
                color: fav ? "#e3b341" : theme === "light" ? "#656d76" : "#7d8590",
                marginLeft: 4,
              }}
              title={fav ? "Remove from watchlist" : "Add to watchlist"}
            >
              {fav ? "★" : "☆"}
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {/* Line/Candles */}
          <button
            onClick={onToggleMode}
            className="inline-btn"
            style={{
              background: mode === "candles" ? "var(--color-bg-hover)" : "transparent",
              color: mode === "candles" ? "var(--color-accent)" : "var(--color-fg-muted)",
            }}
          >
            {mode === "candles" ? "Candles" : "Line"}
          </button>
          
          {/* EMA */}
          <button
            onClick={toggleEMA20}
            className="inline-btn"
            style={
              showEMA20 ? { background: "var(--color-bg-hover)", color: "#ff9500" } : undefined
            }
          >
            EMA20
          </button>
          
          {/* VolMA */}
          <button
            onClick={toggleVolMA}
            className="inline-btn"
            style={
              showVolMA ? { background: "var(--color-bg-hover)", color: "#58a6ff" } : undefined
            }
          >
            VolMA
          </button>
          
          {/* Bollinger Bands */}
          <button
            onClick={toggleBollingerBands}
            className="inline-btn"
            style={
              showBollingerBands ? { background: "var(--color-bg-hover)", color: "#87ceeb" } : undefined
            }
          >
            Bollinger Bands
          </button>
          
          {/* Reset */}
          <button
            onClick={resetIndicators}
            className="inline-btn"
          >
            Reset
          </button>
        </div>
      </div>
      <div
        className="panel-body"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 500,
              color: theme === "light" ? "#1f2328" : "#f6f8fa",
            }}
          >
            {price != null ? (
              price.toFixed(2)
            ) : (
              <span
                className="skeleton"
                style={{ display: "inline-block", width: 80, height: 24 }}
              />
            )}
          </div>
          <div style={{ fontSize: 12 }}>
            {dayChange != null ? (
              <span className={dayChange >= 0 ? "pl-pos" : "pl-neg"}>
                {formatSigned(dayChange)} ({dayChangePct?.toFixed(2)}%)
              </span>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
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
          {!loading && candles.length > 0 && (
            <AdvancedPriceChart
              data={candles}
              mode={mode}
              range={range}
              logScale={logScale}
              showVolMA={showVolMA}
              showBollingerBands={showBollingerBands}
              showEMA20={showEMA20}
            />
          )}
          {!loading && candles.length === 0 && (
            <div style={{ fontSize: 12, opacity: 0.6 }}>Loading…</div>
          )}
        </div>
        {/* Range buttons and X-axis labels moved below chart */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 4,
            gap: 12,
          }}
        >
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
                {r.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, opacity: 0.5 }}>Scroll to zoom · drag to pan</div>
        </div>
        {/* Inline stats bar (like IBKR): O H L C Vol for last/hover candle */}
        {/* Removed duplicate price-only bar */}
      </div>
    </div>
  );
}

// Chart implementation now in AdvancedPriceChart.tsx using LayoutConfig.CHART_SCALE

// (OHLCBar removed)

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ opacity: 0.55 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 140 }}>
      <span
        style={{
          opacity: 0.5,
          fontSize: LayoutConfig.OVERVIEW_LABEL_FONT_SIZE,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: LayoutConfig.OVERVIEW_VALUE_FONT_SIZE,
          fontWeight: 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function OverviewSection({ stats }: { stats: any }) {
  const [expanded, setExpanded] = useState(false);
  const summary: string = stats.longBusinessSummary || "—";
  
  // Split into words and take first N words for collapsed view
  const words = summary.split(/\s+/);
  const wordLimit = LayoutConfig.OVERVIEW_WORD_LIMIT;
  const short = words.length > wordLimit 
    ? words.slice(0, wordLimit).join(" ") 
    : summary;
  const needsExpansion = words.length > wordLimit;
  
  return (
    <div
      className="panel"
      style={{
        background: "var(--color-bg-muted)",
        border: "1px solid var(--color-border)",
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>
        {stats.longName || "—"} Overview
      </div>
      <div
        style={{
          position: "relative",
          fontSize: 11,
          lineHeight: 1.3,
          opacity: 0.9,
          maxHeight: expanded
            ? LayoutConfig.OVERVIEW_COLLAPSED_MAX_HEIGHT * S
            : LayoutConfig.OVERVIEW_COLLAPSED_MAX_HEIGHT * S,
          overflow: expanded ? "auto" : "hidden",
          scrollbarWidth: "none", // Firefox
          msOverflowStyle: "none", // IE and Edge
        }}
        className="hide-scrollbar"
      >
        {expanded ? summary : short}
        {!expanded && needsExpansion && (
          <button
            onClick={() => setExpanded(true)}
            className="inline-btn"
            style={{ marginLeft: 4, fontSize: 10 }}
          >
            …
          </button>
        )}
        {expanded && (
          <button
            onClick={() => setExpanded(false)}
            className="inline-btn"
            style={{ marginLeft: 6, fontSize: 10 }}
          >
            Collapse
          </button>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: LayoutConfig.OVERVIEW_GROUPS_GAP,
        }}
      >
        <div
          style={{ display: "flex", gap: LayoutConfig.OVERVIEW_GROUP_ITEM_GAP, flexWrap: "wrap" }}
        >
          <InfoItem label="Sector" value={stats.sector || "—"} />
          <InfoItem label="Industry" value={stats.industry || "—"} />
        </div>
        <div
          style={{ display: "flex", gap: LayoutConfig.OVERVIEW_GROUP_ITEM_GAP, flexWrap: "wrap" }}
        >
          <InfoItem
            label="Full Time Employees"
            value={stats.fullTimeEmployees ? stats.fullTimeEmployees.toLocaleString() : "—"}
          />
          <InfoItem
            label="Fiscal Year Ends"
            value={stats.fiscalYearEnd ? new Date(stats.fiscalYearEnd).toLocaleDateString() : "—"}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: LayoutConfig.OVERVIEW_URL_INTERNAL_GAP,
            minWidth: 140,
            marginLeft: LayoutConfig.OVERVIEW_URL_GAP,
          }}
        >
          <span
            style={{
              opacity: 0,
              fontSize: LayoutConfig.OVERVIEW_LABEL_FONT_SIZE,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              lineHeight: 1,
            }}
          >
            .
          </span>
          <span
            style={{
              fontSize: LayoutConfig.OVERVIEW_VALUE_FONT_SIZE,
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1,
            }}
          >
            {stats.website ? (
              <a href={stats.website} target="_blank" rel="noreferrer">
                {stats.website}
              </a>
            ) : (
              "—"
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function NewsSection({
  news,
  loading,
  fmtDate,
  newsError,
}: {
  news: Array<{ id: string; title: string; publisher?: string; link: string; publishedAt: string }>;
  loading: boolean;
  fmtDate: (s: string) => string;
  newsError: string | null;
}) {
  const maxHeight = LayoutConfig.NEWS_VISIBLE_ARTICLES * LayoutConfig.NEWS_ARTICLE_ROW_HEIGHT;
  return (
    <div
      className="panel"
      style={{
        background: "var(--color-bg-muted)",
        border: "1px solid var(--color-border)",
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginTop: LayoutConfig.OVERVIEW_NEWS_GAP,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>
        News {loading && <span style={{ fontSize: 10, opacity: 0.5 }}>loading…</span>}
      </div>
      <div
        className="news-scroll-container"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontSize: 12,
          overflowY: "auto",
          maxHeight,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {news.map((n) => (
          <a
            key={n.id}
            href={n.link}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "none", color: "var(--color-fg)" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontWeight: 500, lineHeight: 1.15 }}>{n.title}</span>
              <span style={{ opacity: 0.55, fontSize: 10 }}>
                {(n.publisher || "").trim()} · {fmtDate(n.publishedAt)}
              </span>
            </div>
          </a>
        ))}
        {!news.length && !loading && <div style={{ opacity: 0.6 }}>{newsError || "No news."}</div>}
      </div>
    </div>
  );
}

function formatSigned(v: number) {
  const sign = v > 0 ? "+" : "";
  return v ? sign + v.toFixed(2) : "—";
}
