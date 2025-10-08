"use client";
import React, { useEffect, useRef } from "react";
import { RangeKey } from "./constants";
import { LayoutConfig } from "./layoutConfig";
import { useAuth } from "../auth-context/AuthContext";

interface Candle {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}
interface Props {
  data: Candle[];
  mode: "line" | "candles";
  range: RangeKey;
  showSMA20: boolean;
  showSMA50: boolean;
  logScale: boolean;
  showVolMA: boolean;
}

export default function AdvancedPriceChart({
  data,
  mode,
  range,
  showSMA20,
  showSMA50,
  logScale,
  showVolMA,
}: Props) {
  const { theme } = useAuth();
  const [hover, setHover] = React.useState<number | null>(null);
  const [windowIdx, setWindowIdx] = React.useState<[number, number]>(() => [0, data.length - 1]);
  useEffect(() => {
    function reset() {
      setWindowIdx([0, data.length - 1]);
    }
    window.addEventListener("chart-reset", reset as EventListener);
    return () => window.removeEventListener("chart-reset", reset as EventListener);
  }, [data.length]);
  const TARGET_PER_RANGE: Record<RangeKey, number> = {
    "1d": 18,
    "1w": 40,
    "1m": 70,
    "1y": 140,
    "5y": 220,
  };
  const target = TARGET_PER_RANGE[range] || 120;
  const bucketSize = data.length > target ? Math.ceil(data.length / target) : 1;
  function bucketAggregate(src: Candle[], size: number) {
    if (size <= 1) return src;
    const out: Candle[] = [];
    for (let i = 0; i < src.length; i += size) {
      const slice = src.slice(i, i + size);
      if (!slice.length) continue;
      const o = slice[0].o;
      const c = slice[slice.length - 1].c;
      let h = -Infinity,
        l = Infinity,
        v = 0;
      for (const s of slice) {
        if (s.h > h) h = s.h;
        if (s.l < l) l = s.l;
        v += s.v;
      }
      out.push({ t: slice[0].t, o, h, l, c, v });
    }
    return out;
  }
  const baseData = bucketSize === 1 ? data : bucketAggregate(data, bucketSize);
  // Always show full range unless user zooms/pans (windowIdx acts as user override after first wheel/drag)
  const [wStart, wEnd] = windowIdx;
  const fullStart = 0;
  const fullEnd = baseData.length - 1;
  const effectiveStart =
    wStart === 0 && wEnd === data.length - 1 ? fullStart : Math.max(0, Math.min(wStart, fullEnd));
  const effectiveEnd = wStart === 0 && wEnd === data.length - 1 ? fullEnd : Math.min(wEnd, fullEnd);
  const safeEnd = Math.min(effectiveEnd, baseData.length - 1);
  const safeStart = Math.max(0, Math.min(effectiveStart, safeEnd - 5));
  const drawData = baseData.slice(safeStart, safeEnd + 1);
  const closes = drawData.map((d) => d.c),
    highs = drawData.map((d) => d.h),
    lows = drawData.map((d) => d.l);
  function quantile(arr: number[], q: number) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return sorted[base + 1] !== undefined
      ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
      : sorted[base];
  }
  let min = quantile(lows, 0.005),
    max = quantile(highs, 0.995);
  const lastC = drawData[drawData.length - 1];
  if (lastC) {
    if (lastC.l < min) min = lastC.l;
    if (lastC.h > max) max = lastC.h;
  }
  const span = max - min || 1;
  // Single scale variable
  const S = LayoutConfig.CHART_SCALE; // affects vertical real estate
  const hVisualBase = LayoutConfig.GRAPH_HEIGHT; // baseline visual height from config
  const volumePortion = 0.23; // fraction reserved for volume area
  const hVisual = hVisualBase * S;
  const volH = hVisual * volumePortion;
  const priceH = hVisual - volH;
  const axisFooter = LayoutConfig.AXIS_FOOTER_HEIGHT;
  const h = hVisual + axisFooter;
  const w = LayoutConfig.GRAPH_WIDTH;
  const gutterRight = LayoutConfig.AXIS_RIGHT_GUTTER;
  const padTop = 8,
    padBottom = 6,
    padLeft = 4;
  const priceArea = priceH - padTop - padBottom;
  const up = closes[closes.length - 1] >= closes[0];
  const priceW = w - gutterRight - padLeft;
  const linePts = drawData
    .map((d, i) => {
      const x = padLeft + (i / (drawData.length - 1)) * priceW;
      const val = logScale
        ? (Math.log10(d.c) - Math.log10(min)) / (Math.log10(max) - Math.log10(min || 1))
        : (d.c - min) / span;
      const y = padTop + (priceArea - val * priceArea);
      return `${x},${y}`;
    })
    .join(" ");
  const hoverPoint = hover != null ? drawData[hover] : null;
  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(
      0,
      Math.min(1, (x - padLeft) / (rect.width - (gutterRight / w) * rect.width)),
    );
    const idx = Math.round(ratio * (drawData.length - 1));
    setHover(idx);
  }
  const dragState = useRef<{ startX: number; startRange: [number, number] } | null>(null);
  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    if (drawData.length < 10) return;
    const delta = e.deltaY;
    const factor = delta > 0 ? 1.1 : 0.9;
    const currentLen = wEnd - wStart + 1;
    const newLen = Math.max(20, Math.min(baseData.length, Math.round(currentLen * factor)));
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const xRatio = (e.clientX - rect.left - padLeft) / (rect.width - gutterRight);
    const focusIdx = wStart + Math.round(currentLen * xRatio);
    let newStart = focusIdx - Math.round(newLen * xRatio);
    let newEnd = newStart + newLen - 1;
    if (newStart < 0) {
      newStart = 0;
      newEnd = newLen - 1;
    }
    if (newEnd > baseData.length - 1) {
      newEnd = baseData.length - 1;
      newStart = newEnd - newLen + 1;
    }
    setWindowIdx([newStart, newEnd]);
  }
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startRange: windowIdx };
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragState.current) return;
    const [s, eIdx] = dragState.current.startRange;
    const len = eIdx - s + 1;
    const pixelPerCandle = priceW / drawData.length;
    const deltaPx = e.clientX - dragState.current.startX;
    const shift = Math.round(-deltaPx / pixelPerCandle);
    let newStart = s + shift;
    let newEnd = newStart + len - 1;
    if (newStart < 0) {
      newStart = 0;
      newEnd = len - 1;
    }
    if (newEnd > baseData.length - 1) {
      newEnd = baseData.length - 1;
      newStart = newEnd - len + 1;
    }
    setWindowIdx([newStart, newEnd]);
  }
  function onPointerUp() {
    dragState.current = null;
  }
  function niceTicks(low: number, high: number, target = 5) {
    const rawSpan = high - low || 1;
    const roughStep = rawSpan / (target - 1);
    const pow10 = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const multiples = [1, 2, 2.5, 5, 10];
    const found = multiples.find((m) => m * pow10 >= roughStep) || multiples[multiples.length - 1];
    const step = found * pow10;
    const first = Math.ceil(low / step) * step;
    const ticks: number[] = [];
    for (let v = first; v <= high; v += step) ticks.push(v);
    return ticks;
  }
  // Time ticks
  const timeTicks: Array<{ x: number; label: string }> = [];
  if (drawData.length > 1) {
    const firstDate = new Date(drawData[0].t);
    const lastDate = new Date(drawData[drawData.length - 1].t);
    const times = drawData.map((d) => new Date(d.t).getTime());
    function nearestIdx(ts: number) {
      let lo = 0,
        hi = times.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] < ts) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    }
    if (range === "1d") {
      const start = new Date(firstDate);
      start.setMinutes(start.getMinutes() < 30 ? 0 : 30, 0, 0);
      start.setMinutes(start.getMinutes() - (start.getMinutes() % 30));
      const cursor = new Date(start);
      while (cursor <= lastDate) {
        const idx = nearestIdx(cursor.getTime());
        const ratio = idx / (drawData.length - 1);
        timeTicks.push({
          x: padLeft + ratio * priceW,
          label:
            cursor.getHours().toString().padStart(2, "0") +
            ":" +
            cursor.getMinutes().toString().padStart(2, "0"),
        });
        cursor.setMinutes(cursor.getMinutes() + 30);
      }
    } else if (range === "1w") {
      const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
      while (cursor <= lastDate) {
        const idx = nearestIdx(cursor.getTime());
        const ratio = idx / (drawData.length - 1);
        const label = cursor.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
        if (idx < drawData.length) timeTicks.push({ x: padLeft + ratio * priceW, label });
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (range === "1m") {
      const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
      while (cursor <= lastDate) {
        if (cursor.getDay() === 1) {
          const idx = nearestIdx(cursor.getTime());
          const ratio = idx / (drawData.length - 1);
          const label = cursor.getMonth() + 1 + "/" + cursor.getDate();
          timeTicks.push({ x: padLeft + ratio * priceW, label });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (range === "1y") {
      for (
        let m = firstDate.getMonth();
        m <= lastDate.getMonth() + 12 * (lastDate.getFullYear() - firstDate.getFullYear());
        m++
      ) {
        const year = firstDate.getFullYear() + Math.floor(m / 12);
        const month = m % 12;
        const d = new Date(year, month, 1);
        if (d < firstDate) continue;
        if (d > lastDate) break;
        const idx = nearestIdx(d.getTime());
        const ratio = idx / (drawData.length - 1);
        timeTicks.push({
          x: padLeft + ratio * priceW,
          label: d.toLocaleString(undefined, { month: "short" }).toUpperCase(),
        });
      }
    } else if (range === "5y") {
      for (let y = firstDate.getFullYear(); y <= lastDate.getFullYear(); y++) {
        const d = new Date(y, 0, 1);
        if (d < firstDate) continue;
        if (d > lastDate) break;
        const idx = nearestIdx(d.getTime());
        const ratio = idx / (drawData.length - 1);
        timeTicks.push({ x: padLeft + ratio * priceW, label: String(y) });
      }
    }
  }
  const maxVol = Math.max(...drawData.map((d) => d.v), 1);
  let candleWidth = (priceW / drawData.length) * 0.8;
  if (candleWidth < 5) candleWidth = 5;
  if (candleWidth > 18) candleWidth = 18;
  const magnitude = Math.abs(max);
  const decimals = magnitude >= 500 ? 0 : magnitude >= 100 ? 1 : 2;
  function sma(src: number[], period: number) {
    if (src.length < period) return [];
    const out: number[] = [];
    let sum = 0;
    for (let i = 0; i < src.length; i++) {
      sum += src[i];
      if (i >= period) sum -= src[i - period];
      if (i >= period - 1) out.push(sum / period);
    }
    return out;
  }
  const sma20 = showSMA20
    ? sma(
        drawData.map((d) => d.c),
        20,
      )
    : [];
  const sma50 = showSMA50
    ? sma(
        drawData.map((d) => d.c),
        50,
      )
    : [];
  const volMA = showVolMA
    ? sma(
        drawData.map((d) => d.v),
        20,
      )
    : [];
  return (
    <div style={{ position: "absolute", inset: 0, fontSize: 11 }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{
          width: "100%",
          height: "100%",
          cursor: "crosshair",
          userSelect: "none",
          fontFamily: "system-ui, ui-monospace, Menlo, monospace",
        }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {niceTicks(min, max, 5).map((t) => {
          const y = 8 + (priceArea - ((t - min) / span) * priceArea);
          return (
            <g key={t.toFixed(6)}>
              <line
                x1={padLeft}
                x2={padLeft + priceW}
                y1={y}
                y2={y}
                stroke={theme === "light" ? "#d0d7de" : "#30363d"}
                strokeWidth={1}
              />
              <text
                x={padLeft + priceW + LayoutConfig.AXIS_Y_LABEL_X_OFFSET}
                y={y + LayoutConfig.AXIS_Y_FONT_SIZE / 3}
                fill={theme === "light" ? "#656d76" : "#9aa0a6"}
                fontSize={LayoutConfig.AXIS_Y_FONT_SIZE}
              >
                {t.toFixed(decimals)}
              </text>
            </g>
          );
        })}
        {mode === "line" && (
          <polyline
            points={linePts}
            fill="none"
            stroke={up ? "var(--color-success)" : "var(--color-danger)"}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {mode === "candles" &&
          drawData.map((d, i) => {
            const x = padLeft + (i / drawData.length) * priceW + candleWidth * 0.05;
            const valOpen = logScale
              ? (Math.log10(d.o) - Math.log10(min)) / (Math.log10(max) - Math.log10(min || 1))
              : (d.o - min) / span;
            const valClose = logScale
              ? (Math.log10(d.c) - Math.log10(min)) / (Math.log10(max) - Math.log10(min || 1))
              : (d.c - min) / span;
            const valHigh = logScale
              ? (Math.log10(d.h) - Math.log10(min)) / (Math.log10(max) - Math.log10(min || 1))
              : (d.h - min) / span;
            const valLow = logScale
              ? (Math.log10(d.l) - Math.log10(min)) / (Math.log10(max) - Math.log10(min || 1))
              : (d.l - min) / span;
            const openY = 8 + (priceArea - valOpen * priceArea);
            const closeY = 8 + (priceArea - valClose * priceArea);
            const highY = 8 + (priceArea - valHigh * priceArea);
            const lowY = 8 + (priceArea - valLow * priceArea);
            const rising = d.c >= d.o;
            const pct = Math.min(0.05, Math.max(-0.05, (d.c - d.o) / d.o));
            const intensity = Math.abs(pct) / 0.05;
            const baseColor = rising ? "var(--color-success)" : "var(--color-danger)";
            const fill = rising
              ? `rgba(35,134,54,${0.35 + 0.55 * intensity})`
              : `rgba(248,81,73,${0.35 + 0.55 * intensity})`;
            return (
              <g key={d.t}>
                <line
                  x1={x + candleWidth / 2}
                  x2={x + candleWidth / 2}
                  y1={highY}
                  y2={lowY}
                  stroke={baseColor}
                  strokeWidth={1}
                />
                <rect
                  x={x}
                  y={Math.min(openY, closeY)}
                  width={candleWidth}
                  height={Math.max(2, Math.abs(closeY - openY))}
                  fill={fill}
                  stroke={baseColor}
                  strokeWidth={0.5}
                />
              </g>
            );
          })}
        {showSMA20 && sma20.length && (
          <polyline
            points={sma20
              .map((v, i) => {
                const idx = i + (drawData.length - sma20.length);
                const x = padLeft + (idx / (drawData.length - 1)) * priceW;
                const val = logScale
                  ? (Math.log10(v) - Math.log10(min)) / (Math.log10(max) - Math.log10(min || 1))
                  : (v - min) / span;
                const y = 8 + (priceArea - val * priceArea);
                return `${x},${y}`;
              })
              .join(" ")}
            fill="none"
            stroke="#e0b341"
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {showSMA50 && sma50.length && (
          <polyline
            points={sma50
              .map((v, i) => {
                const idx = i + (drawData.length - sma50.length);
                const x = padLeft + (idx / (drawData.length - 1)) * priceW;
                const val = logScale
                  ? (Math.log10(v) - Math.log10(min)) / (Math.log10(max) - Math.log10(min || 1))
                  : (v - min) / span;
                const y = 8 + (priceArea - val * priceArea);
                return `${x},${y}`;
              })
              .join(" ")}
            fill="none"
            stroke="#b65bff"
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {drawData.map((d, i) => {
          const x = padLeft + (i / drawData.length) * priceW + candleWidth * 0.05;
          const volRatio = d.v / maxVol;
          const barH = volRatio * (volH - 16);
          const y = priceH + (volH - barH);
          const rising = d.c >= d.o;
          return (
            <rect
              key={d.t + ":vol"}
              x={x}
              y={y}
              width={candleWidth}
              height={barH}
              fill={rising ? "var(--color-success)" : "var(--color-danger)"}
              opacity={0.35}
            />
          );
        })}
        {showVolMA && volMA.length && (
          <polyline
            points={volMA
              .map((v, i) => {
                const idx = i + (drawData.length - volMA.length);
                const x = padLeft + (idx / (drawData.length - 1)) * priceW + candleWidth / 2;
                const ratio = v / maxVol;
                const barH = ratio * (volH - 16);
                const y = priceH + (volH - barH);
                return `${x},${y}`;
              })
              .join(" ")}
            fill="none"
            stroke="#58a6ff"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {timeTicks.map((t, i) => (
          <line
            key={"xtick-" + i}
            x1={t.x}
            x2={t.x}
            y1={0}
            y2={hVisual}
            stroke={theme === "light" ? "#d0d7de" : "#30363d"}
            strokeWidth={1}
          />
        ))}
        {hoverPoint &&
          (() => {
            const x = padLeft + (hover! / (drawData.length - 1)) * priceW;
            const y = 8 + (priceArea - ((hoverPoint.c - min) / span) * priceArea);
            return (
              <g>
                <line
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={priceH}
                  stroke={theme === "light" ? "#656d76" : "#7d8590"}
                  strokeDasharray="4 3"
                  strokeWidth={1}
                />
                <line
                  x1={0}
                  x2={w}
                  y1={y}
                  y2={y}
                  stroke={theme === "light" ? "#656d76" : "#7d8590"}
                  strokeDasharray="4 3"
                  strokeWidth={1}
                />
                <circle
                  cx={x}
                  cy={y}
                  r={5}
                  fill="var(--color-bg)"
                  stroke={up ? "var(--color-success)" : "var(--color-danger)"}
                  strokeWidth={2}
                />
              </g>
            );
          })()}
        {drawData.length > 0 &&
          (() => {
            const last = drawData[drawData.length - 1];
            const y = 8 + (priceArea - ((last.c - min) / span) * priceArea);
            return (
              <g>
                <line
                  x1={padLeft}
                  x2={padLeft + priceW}
                  y1={y}
                  y2={y}
                  stroke={last.c >= closes[0] ? "var(--color-success)" : "var(--color-danger)"}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                />
                <rect
                  x={padLeft + priceW + 4}
                  y={y - LayoutConfig.LAST_PRICE_LABEL_HEIGHT / 2}
                  width={LayoutConfig.LAST_PRICE_LABEL_WIDTH}
                  height={LayoutConfig.LAST_PRICE_LABEL_HEIGHT}
                  fill={theme === "light" ? "#f6f8fa" : "#1d2630"}
                  stroke={theme === "light" ? "#d0d7de" : "#30363d"}
                  rx={3}
                />
                <text
                  x={padLeft + priceW + 4 + LayoutConfig.LAST_PRICE_LABEL_WIDTH / 2}
                  y={y + LayoutConfig.AXIS_Y_FONT_SIZE / 3}
                  textAnchor="middle"
                  fill={last.c >= closes[0] ? "var(--color-success)" : "var(--color-danger)"}
                  fontSize={LayoutConfig.AXIS_Y_FONT_SIZE + 2}
                  fontWeight={600}
                >
                  {last.c.toFixed(decimals)}
                </text>
              </g>
            );
          })()}
        {timeTicks.map((t, i) => (
          <text
            key={"xlabel-" + i}
            x={t.x}
            y={h - 6}
            textAnchor="middle"
            fontSize={LayoutConfig.AXIS_X_FONT_SIZE}
            fill={theme === "light" ? "#656d76" : "#888"}
          >
            {t.label}
          </text>
        ))}
      </svg>
      {hoverPoint && (
        <div
          style={{
            position: "absolute",
            left: `calc(${(hover! / (drawData.length - 1)) * 100}% - 40px)`,
            top: 8,
            background: theme === "light" ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.78)",
            padding: "6px 8px",
            borderRadius: 4,
            pointerEvents: "none",
            border: theme === "light" ? "1px solid #d0d7de" : "1px solid #30363d",
            whiteSpace: "nowrap",
            backdropFilter: "blur(2px)",
            color: theme === "light" ? "#24292f" : "#e6edf3",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            {new Date(hoverPoint.t).toLocaleString()}
          </div>
          <div style={{ fontWeight: 600 }}>{hoverPoint.c.toFixed(2)}</div>
        </div>
      )}
    </div>
  );
}
