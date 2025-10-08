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
  logScale: boolean;
  showVolMA: boolean;
  showBollingerBands?: boolean;
  showEMA20?: boolean;
}

export default function AdvancedPriceChart({
  data,
  mode,
  range,
  logScale,
  showVolMA,
  showBollingerBands = false,
  showEMA20 = false,
}: Props) {
  const { theme } = useAuth();
  const [hover, setHover] = React.useState<number | null>(null);

  // Note: symbol prop defined but not used - chart is data-driven from parent's data prop
  // Parent (DashboardClient) handles all data fetching via api.history()
  // Backend already fetches the correct range, so we use sourceData directly

  const sourceData: Candle[] = data || [];
  
  const TARGET_PER_RANGE: Record<RangeKey, number> = {
    "1d": 18,
    "1w": 40,
    "1m": 70,
    "3m": 90,
    "1y": 140,
    "5y": 220,
  };
  const target = TARGET_PER_RANGE[range] || 120;
  let bucketSize = sourceData.length > target ? Math.ceil(sourceData.length / target) : 1;
  if (range === '1d') bucketSize = 1; // never bucket intraday so ticks align with real times
  
  // Calculate indicators on RAW sourceData BEFORE bucketing for maximum accuracy
  const rawEma20 = showEMA20 ? ema(sourceData.map((d: Candle) => d.c), 20) : [];
  const rawVolMA = showVolMA ? sma(sourceData.map((d: Candle) => d.v), 20) : [];
  const rawBollingerBands = showBollingerBands 
    ? calculateBollingerBands(sourceData.map((d: Candle) => d.c)) 
    : { upper: [], lower: [], middle: [] };
  
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
  
  // Bucket indicators alongside the data (take every Nth value to match bucketing)
  function bucketIndicator(values: (number | null)[], size: number): (number | null)[] {
    if (size <= 1) return values;
    const out: (number | null)[] = [];
    for (let i = 0; i < values.length; i += size) {
      out.push(values[i]); // Take the first value of each bucket
    }
    return out;
  }
  
  const baseData = bucketSize === 1 ? sourceData : bucketAggregate(sourceData, bucketSize);
  const bucketedEma20 = bucketSize === 1 ? rawEma20 : bucketIndicator(rawEma20, bucketSize);
  const bucketedVolMA = bucketSize === 1 ? rawVolMA : bucketIndicator(rawVolMA, bucketSize);
  const bucketedBollingerBands = bucketSize === 1 ? rawBollingerBands : {
    upper: bucketIndicator(rawBollingerBands.upper, bucketSize),
    lower: bucketIndicator(rawBollingerBands.lower, bucketSize),
    middle: bucketIndicator(rawBollingerBands.middle, bucketSize),
  };
  
  // Backend fetches extra candles for indicator calculation (20-50 depending on range)
  // After bucketing, we hide proportionally fewer candles
  const bufferPerRange: Record<RangeKey, number> = {
    "1d": 50,   // Works perfectly
    "1w": 50,   // Now much smaller since indicators pre-calculated
    "1m": 50,   // Now much smaller since indicators pre-calculated
    "3m": 50,   // Perfect already
    "1y": 50,   // Works perfectly
    "5y": 50,   // Works perfectly
  };
  const bufferCandles = Math.min(bufferPerRange[range], Math.floor(baseData.length * 0.2));
  const displayData = baseData.slice(bufferCandles); // Hide first candles from user
  
  const [windowIdx, setWindowIdx] = React.useState<[number, number]>(() => [0, displayData.length - 1]);
  // Reset window when displayData length changes (range change or new data)
  useEffect(() => {
    setWindowIdx([0, displayData.length - 1]);
  }, [displayData.length]);
  
  // Always show full range unless user zooms/pans (windowIdx acts as user override after first wheel/drag)
  const [wStart, wEnd] = windowIdx;
  const fullStart = 0;
  const fullEnd = displayData.length - 1;
  const effectiveStart =
    wStart === 0 && wEnd === displayData.length - 1 ? fullStart : Math.max(0, Math.min(wStart, fullEnd));
  const effectiveEnd = wStart === 0 && wEnd === displayData.length - 1 ? fullEnd : Math.min(wEnd, fullEnd);
  const safeEnd = Math.min(effectiveEnd, displayData.length - 1);
  const safeStart = Math.max(0, Math.min(effectiveStart, safeEnd - 5));
  const drawData = displayData.slice(safeStart, safeEnd + 1);
  
  // Slice pre-calculated indicators to match drawData (offset by buffer + window)
  const indicatorStart = bufferCandles + safeStart;
  const indicatorEnd = bufferCandles + safeEnd + 1;
  const ema20 = bucketedEma20.slice(indicatorStart, indicatorEnd);
  const volMA = bucketedVolMA.slice(indicatorStart, indicatorEnd);
  const bollingerBands = {
    upper: bucketedBollingerBands.upper.slice(indicatorStart, indicatorEnd),
    lower: bucketedBollingerBands.lower.slice(indicatorStart, indicatorEnd),
    middle: bucketedBollingerBands.middle.slice(indicatorStart, indicatorEnd),
  };
  
  const closes = drawData.map((d: Candle) => d.c),
    highs = drawData.map((d: Candle) => d.h),
    lows = drawData.map((d: Candle) => d.l);
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
  
  // Index-based horizontal scale (removes time gaps for continuous display)
  const numCandles = drawData.length;
  function xForIdx(idx: number) { return padLeft + (idx / Math.max(1, numCandles - 1)) * priceW; }
  
  // (Removed unused drawTimes variable to satisfy lint)
  
  // Adaptive candle width from data density
  let candleWidth: number;
  if (numCandles <= 2) {
    candleWidth = (priceW / Math.max(1, numCandles)) * 0.6;
  } else {
    candleWidth = (priceW / numCandles) * 0.8;
  }
  if (candleWidth < 3) candleWidth = 3; if (candleWidth > 22) candleWidth = 22;
  const linePts = drawData.map((d, idx) => {
    const x = xForIdx(idx);
    const val = logScale ? (Math.log10(d.c) - Math.log10(min)) / (Math.log10(max) - Math.log10(min || 1)) : (d.c - min) / span;
    const y = padTop + (priceArea - val * priceArea);
    return `${x},${y}`;
  }).join(" ");
  const hoverPoint = hover != null ? drawData[hover] : null;
  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    // Index-based hover: find nearest candle by x position
    if (drawData.length === 0) return;
    
    const xRatio = Math.max(0, Math.min(1, (x - padLeft) / (rect.width - (gutterRight / w) * rect.width)));
    const idx = Math.round(xRatio * (numCandles - 1));
    
    setHover(Math.max(0, Math.min(numCandles - 1, idx)));
  }
  const dragState = useRef<{ startX: number; startRange: [number, number] } | null>(null);
  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    if (drawData.length < 10) return;
    const delta = e.deltaY;
    const factor = delta > 0 ? 1.1 : 0.9;
    const currentLen = wEnd - wStart + 1;
    const newLen = Math.max(20, Math.min(displayData.length, Math.round(currentLen * factor)));
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const xRatio = (e.clientX - rect.left - padLeft) / (rect.width - gutterRight);
    const focusIdx = wStart + Math.round(currentLen * xRatio);
    let newStart = focusIdx - Math.round(newLen * xRatio);
    let newEnd = newStart + newLen - 1;
    if (newStart < 0) {
      newStart = 0;
      newEnd = newLen - 1;
    }
    if (newEnd > displayData.length - 1) {
      newEnd = displayData.length - 1;
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
    if (newEnd > displayData.length - 1) {
      newEnd = displayData.length - 1;
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
  // Time ticks per explicit spec
  const timeTicks: Array<{ x: number; label: string }> = [];
  if (drawData.length > 1) {
    if (range === '1d') {
      // Show label every hour for cleaner display
      const seen = new Set<string>();
      drawData.forEach((c, idx) => {
        const d = new Date(c.t);
        const hh = d.getHours();
        const mm = d.getMinutes();
        // Show label every hour on the hour
        if (mm === 0) {
          const timeKey = `${hh}:00`;
          if (!seen.has(timeKey)) {
            seen.add(timeKey);
            timeTicks.push({ 
              x: xForIdx(idx), 
              label: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }) 
            });
          }
        }
      });
    } else if (range === '1w') {
      const seen = new Set<string>(); drawData.forEach((c, idx) => { const d = new Date(c.t); const k = d.toDateString(); if (!seen.has(k)) { seen.add(k); timeTicks.push({ x: xForIdx(idx), label: d.toLocaleDateString(undefined,{ weekday:'short'}).toUpperCase() }); } });
    } else if (range === '1m') {
      const seen = new Set<string>(); drawData.forEach((c, idx) => { const d = new Date(c.t); if (d.getDay() === 1) { const key = d.getFullYear()+"-"+d.getMonth()+"-"+d.getDate(); if (!seen.has(key)) { seen.add(key); timeTicks.push({ x: xForIdx(idx), label: (d.getMonth()+1)+"/"+d.getDate() }); } } });
    } else if (range === '3m') {
      let mondayCount = 0; drawData.forEach((c, idx) => { const d = new Date(c.t); if (d.getDay() === 1) { if (mondayCount % 3 === 0) timeTicks.push({ x: xForIdx(idx), label: (d.getMonth()+1)+"/"+d.getDate() }); mondayCount++; } });
    } else if (range === '1y') {
      const seenMonth = new Set<string>(); drawData.forEach((c, idx) => { const d = new Date(c.t); const mk = d.getFullYear()+"-"+d.getMonth(); if (!seenMonth.has(mk) && d.getDate() <= 7) { seenMonth.add(mk); timeTicks.push({ x: xForIdx(idx), label: d.toLocaleString(undefined,{ month:'short'}).toUpperCase() }); } });
    } else if (range === '5y') {
      const seenYear = new Set<number>(); drawData.forEach((c, idx) => { const d = new Date(c.t); if (!seenYear.has(d.getFullYear()) && d.getMonth() < 2) { seenYear.add(d.getFullYear()); timeTicks.push({ x: xForIdx(idx), label: String(d.getFullYear()) }); } });
    }
  }
  const maxVol = Math.max(...drawData.map((d: Candle) => d.v), 1);
  const magnitude = Math.abs(max);
  const decimals = magnitude >= 500 ? 0 : magnitude >= 100 ? 1 : 2;
  function sma(src: number[], period: number) {
    if (src.length < period) return [];
    const out: (number | null)[] = new Array(period - 1).fill(null); // Pad beginning with nulls
    let sum = 0;
    for (let i = 0; i < src.length; i++) {
      sum += src[i];
      if (i >= period) sum -= src[i - period];
      if (i >= period - 1) out.push(sum / period);
    }
    return out;
  }

  function ema(src: number[], period: number): (number | null)[] {
    if (src.length < period) return [];
    const k = 2 / (period + 1);
    const out: (number | null)[] = new Array(period - 1).fill(null); // Pad beginning with nulls
    
    // Start with SMA for first value
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += src[i];
    }
    out.push(sum / period);
    
    // Then use EMA formula
    for (let i = period; i < src.length; i++) {
      out.push(src[i] * k + (out[out.length - 1] as number) * (1 - k));
    }
    
    return out;
  }

  function calculateBollingerBands(closes: number[], period: number = 20, stdDevMultiplier: number = 2) {
    if (closes.length < period) return { upper: [], lower: [], middle: [] };
    
    const middle: (number | null)[] = new Array(period - 1).fill(null);
    const upper: (number | null)[] = new Array(period - 1).fill(null);
    const lower: (number | null)[] = new Array(period - 1).fill(null);
    
    for (let i = period - 1; i < closes.length; i++) {
      const slice = closes.slice(i - period + 1, i + 1);
      const avg = slice.reduce((sum, val) => sum + val, 0) / period;
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / period;
      const stdDev = Math.sqrt(variance);
      
      middle.push(avg);
      upper.push(avg + stdDevMultiplier * stdDev);
      lower.push(avg - stdDevMultiplier * stdDev);
    }
    
    return { upper, lower, middle };
  }
  
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
                fill={theme === "light" ? "#000000" : "#ffffff"}
                fontSize={LayoutConfig.AXIS_Y_FONT_SIZE}
              >
                {t.toFixed(decimals)}
              </text>
            </g>
          );
        })}

        {/* Vertical grid lines (render before chart data so they appear behind) */}
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

        {/* Bollinger Bands */}
        {showBollingerBands && bollingerBands.upper.length > 0 && (
          <>
            {/* Fill area */}
            <polygon
              points={(() => {
                const points: string[] = [];
                // Upper band
                for (let i = 0; i < bollingerBands.upper.length; i++) {
                  const upperVal = bollingerBands.upper[i];
                  if (upperVal === null) continue;
                  const x = xForIdx(i);
                  const val = (upperVal - min) / span;
                  const y = padTop + (priceArea - val * priceArea);
                  if (isFinite(x) && isFinite(y)) {
                    points.push(`${x},${y}`);
                  }
                }
                // Lower band (reversed)
                for (let i = bollingerBands.lower.length - 1; i >= 0; i--) {
                  const lowerVal = bollingerBands.lower[i];
                  if (lowerVal === null) continue;
                  const x = xForIdx(i);
                  const val = (lowerVal - min) / span;
                  const y = padTop + (priceArea - val * priceArea);
                  if (isFinite(x) && isFinite(y)) {
                    points.push(`${x},${y}`);
                  }
                }
                return points.join(" ");
              })()}
              fill="rgba(135, 206, 235, 0.15)"
              stroke="none"
            />
            
            {/* Upper band outline */}
            <polyline
              points={bollingerBands.upper
                .map((v, i) => {
                  if (v === null) return null;
                  const x = xForIdx(i);
                  const val = (v - min) / span;
                  const y = padTop + (priceArea - val * priceArea);
                  return `${x},${y}`;
                })
                .filter(p => p !== null)
                .join(" ")}
              fill="none"
              stroke="rgba(135, 206, 235, 0.8)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            
            {/* Lower band outline */}
            <polyline
              points={bollingerBands.lower
                .map((v, i) => {
                  if (v === null) return null;
                  const x = xForIdx(i);
                  const val = (v - min) / span;
                  const y = padTop + (priceArea - val * priceArea);
                  return `${x},${y}`;
                })
                .filter(p => p !== null)
                .join(" ")}
              fill="none"
              stroke="rgba(135, 206, 235, 0.8)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
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
          drawData.map((d: Candle, idx: number) => {
            const centerX = xForIdx(idx);
            const x = centerX - candleWidth / 2;
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

        {/* EMA 20 */}
        {showEMA20 && ema20.length && (
          <polyline
            points={ema20
              .map((v, i) => {
                if (v === null) return null;
                const x = xForIdx(i);
                const val = logScale
                  ? (Math.log10(v) - Math.log10(min)) / (Math.log10(max) - Math.log10(min || 1))
                  : (v - min) / span;
                const y = 8 + (priceArea - val * priceArea);
                return `${x},${y}`;
              })
              .filter(p => p !== null)
              .join(" ")}
            fill="none"
            stroke="#ff9500"
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {drawData.map((d, idx) => {
          const centerX = xForIdx(idx);
          const x = centerX - candleWidth / 2;
          const volRatio = d.v / maxVol;
          let barH = volRatio * (volH - 16);
          
          // Minimum bar height for visibility (especially for low after-hours volume)
          const minBarHeight = 2;
          if (barH > 0 && barH < minBarHeight) barH = minBarHeight;
          
          const y = priceH + (volH - barH);
          const rising = d.c >= d.o;
          
          // Check if this is extended hours (before 9:30 or after 16:00 ET)
          const candleDate = new Date(d.t);
          const hour = candleDate.getHours();
          const minute = candleDate.getMinutes();
          const timeInMinutes = hour * 60 + minute;
          const marketOpen = 9 * 60 + 30; // 9:30 AM
          const marketClose = 16 * 60; // 4:00 PM
          const isExtendedHours = timeInMinutes < marketOpen || timeInMinutes >= marketClose;
          
          return (
            <rect
              key={d.t + ":vol"}
              x={x}
              y={y}
              width={candleWidth}
              height={barH}
              fill={rising ? "var(--color-success)" : "var(--color-danger)"}
              opacity={isExtendedHours ? 0.2 : 0.35}
            />
          );
        })}
        {showVolMA && volMA.length && (
          <polyline
            points={volMA
              .map((v, i) => {
                if (v === null) return null;
                const x = xForIdx(i);
                const ratio = v / maxVol;
                const barH = ratio * (volH - 16);
                const y = priceH + (volH - barH);
                return `${x},${y}`;
              })
              .filter(p => p !== null)
              .join(" ")}
            fill="none"
            stroke="#58a6ff"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {hoverPoint &&
          (() => {
            const x = xForIdx(hover!);
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
            const isUp = last.c >= closes[0];
            // Brighter, higher contrast colors for last price label
            const brightGreen = "#00ff41"; // Bright neon green
            const brightRed = "#ff3366"; // Bright red
            const color = isUp ? brightGreen : brightRed;
            
            return (
              <g>
                <line
                  x1={padLeft}
                  x2={padLeft + priceW}
                  y1={y}
                  y2={y}
                  stroke={color}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                />
                <rect
                  x={padLeft + priceW + 4}
                  y={y - LayoutConfig.LAST_PRICE_LABEL_HEIGHT / 2}
                  width={LayoutConfig.LAST_PRICE_LABEL_WIDTH}
                  height={LayoutConfig.LAST_PRICE_LABEL_HEIGHT}
                  fill={isUp 
                    ? (theme === "light" ? "#e6fff0" : "#002211") 
                    : (theme === "light" ? "#ffe6ee" : "#2d0011")}
                  stroke={color}
                  rx={3}
                />
                <text
                  x={padLeft + priceW + 4 + LayoutConfig.LAST_PRICE_LABEL_WIDTH / 2}
                  y={y + LayoutConfig.LAST_PRICE_LABEL_FONT_SIZE / 3}
                  textAnchor="middle"
                  fill={color}
                  fontSize={LayoutConfig.LAST_PRICE_LABEL_FONT_SIZE}
                  fontWeight={600}
                >
                  {last.c.toFixed(decimals)}
                </text>
              </g>
            );
          })()}
        
        {/* Indicator labels with smart overlap avoidance */}
        {(() => {
          const labels: Array<{ y: number; value: number; color: string; bgColor: string; stroke: string }> = [];
          
          // Main price position
          const lastPrice = drawData[drawData.length - 1]?.c || 0;
          const priceY = 8 + (priceArea - ((lastPrice - min) / span) * priceArea);
          
          // EMA20
          if (showEMA20 && ema20.length > 0) {
            const lastEma = ema20[ema20.length - 1];
            if (lastEma !== null) {
              labels.push({
                y: 8 + (priceArea - ((lastEma - min) / span) * priceArea),
                value: lastEma,
                color: "#ff9500",
                bgColor: theme === "light" ? "#fff5e6" : "#2d2400",
                stroke: "#ff9500",
              });
            }
          }
          
          // Bollinger Bands Upper
          if (showBollingerBands && bollingerBands.upper.length > 0) {
            const lastUpper = bollingerBands.upper[bollingerBands.upper.length - 1];
            if (lastUpper !== null) {
              labels.push({
                y: 8 + (priceArea - ((lastUpper - min) / span) * priceArea),
                value: lastUpper,
                color: "rgba(135, 206, 235, 1)",
                bgColor: theme === "light" ? "#e6f7ff" : "#001a2d",
                stroke: "rgba(135, 206, 235, 0.8)",
              });
            }
          }
          
          // Bollinger Bands Lower
          if (showBollingerBands && bollingerBands.lower.length > 0) {
            const lastLower = bollingerBands.lower[bollingerBands.lower.length - 1];
            if (lastLower !== null) {
              labels.push({
                y: 8 + (priceArea - ((lastLower - min) / span) * priceArea),
                value: lastLower,
                color: "rgba(135, 206, 235, 1)",
                bgColor: theme === "light" ? "#e6f7ff" : "#001a2d",
                stroke: "rgba(135, 206, 235, 0.8)",
              });
            }
          }
          
          // Adjust positions to avoid overlaps
          const minGap = LayoutConfig.INDICATOR_LABEL_HEIGHT + 2;
          const adjustedLabels = labels.map((label) => {
            let adjustedY = label.y;
            
            // Check overlap with main price label
            if (Math.abs(adjustedY - priceY) < minGap) {
              // Move above or below based on which side has more space
              if (adjustedY < priceY) {
                // Label is above price, move it further up
                adjustedY = priceY - minGap;
              } else {
                // Label is below price, move it further down
                adjustedY = priceY + minGap;
              }
            }
            
            return { ...label, y: adjustedY };
          });
          
          // Sort by Y position and adjust for overlaps between indicators
          adjustedLabels.sort((a, b) => a.y - b.y);
          for (let i = 1; i < adjustedLabels.length; i++) {
            if (adjustedLabels[i].y - adjustedLabels[i - 1].y < minGap) {
              adjustedLabels[i].y = adjustedLabels[i - 1].y + minGap;
            }
          }
          
          return adjustedLabels.map((label, idx) => (
            <g key={`indicator-label-${idx}`}>
              <rect
                x={padLeft + priceW + 4}
                y={label.y - LayoutConfig.INDICATOR_LABEL_HEIGHT / 2}
                width={LayoutConfig.INDICATOR_LABEL_WIDTH}
                height={LayoutConfig.INDICATOR_LABEL_HEIGHT}
                fill={label.bgColor}
                stroke={label.stroke}
                rx={2}
              />
              <text
                x={padLeft + priceW + 4 + LayoutConfig.INDICATOR_LABEL_WIDTH / 2}
                y={label.y + LayoutConfig.INDICATOR_LABEL_FONT_SIZE / 3}
                textAnchor="middle"
                fill={label.color}
                fontSize={LayoutConfig.INDICATOR_LABEL_FONT_SIZE}
                fontWeight={600}
              >
                {label.value.toFixed(decimals)}
              </text>
            </g>
          ));
        })()}
        
        {timeTicks.map((t, i) => (
          <text
            key={"xlabel-" + i}
            x={t.x}
            y={h - 6}
            textAnchor="middle"
            fontSize={LayoutConfig.AXIS_X_FONT_SIZE}
            fill={theme === "light" ? "#000000" : "#ffffff"}
          >
            {t.label}
          </text>
        ))}
      </svg>
      {hoverPoint && (() => {
        const hoverX = xForIdx(hover!);
        const hoverXPercent = ((hoverX - padLeft) / priceW) * 100;
        
        // Simple boundary check: if near edges, adjust positioning
        // Near right edge (> 85%) - anchor to right of hover point
        // Near left edge (< 15%) - anchor to left of hover point
        // Otherwise center on hover point
        
        let leftPos: string | undefined;
        let rightPos: string | undefined;
        let transform: string;
        
        if (hoverXPercent > 85) {
          // Near right edge - tooltip opens to the left
          leftPos = `${hoverXPercent}%`;
          transform = "translateX(-100%)";
        } else if (hoverXPercent < 15) {
          // Near left edge - tooltip opens to the right
          leftPos = `${hoverXPercent}%`;
          transform = "translateX(0)";
        } else {
          // Center on hover point (default)
          leftPos = `${hoverXPercent}%`;
          transform = "translateX(-50%)";
        }
        
        return (
          <div
            style={{
              position: "absolute",
              left: leftPos,
              right: rightPos,
              top: 8,
              background: theme === "light" ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.78)",
              padding: "6px 8px",
              borderRadius: 4,
              pointerEvents: "none",
              border: theme === "light" ? "1px solid #d0d7de" : "1px solid #30363d",
              whiteSpace: "nowrap",
              backdropFilter: "blur(2px)",
              color: theme === "light" ? "#24292f" : "#e6edf3",
              transform,
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.7 }}>
              {new Date(hoverPoint.t).toLocaleString()}
            </div>
            <div style={{ fontWeight: 600 }}>{hoverPoint.c.toFixed(2)}</div>
          </div>
        );
      })()}
    </div>
  );
}
