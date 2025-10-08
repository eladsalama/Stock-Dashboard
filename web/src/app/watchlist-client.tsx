"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@components/auth-context/AuthContext";
import { useRouter } from "next/navigation";
import { api } from "@lib/api";

interface WLQuote {
  price?: number;
  previousClose?: number;
  longName?: string;
  asOf?: string;
  error?: string;
}

// Extend window interface for watchlist functions
declare global {
  interface Window {
    watchlistAdd?: (symbol: string) => void;
    watchlistRemove?: (symbol: string) => void;
  }
}

const STORAGE_KEY_BASE = "watchlist.symbols.v1";

export default function WatchlistClient() {
  const { token, user } = useAuth();
  const router = useRouter();
  const storageKey = React.useMemo(
    () => (token ? `${STORAGE_KEY_BASE}.${user?.email || "anon"}` : `${STORAGE_KEY_BASE}.anon`),
    [token, user?.email],
  );
  const [symbols, setSymbols] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      if (!token) return []; // never show cached when logged out
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return [];
  });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [quotes, setQuotes] = useState<Record<string, WLQuote>>({});
  const [loading, setLoading] = useState(false);
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Load from localStorage
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    if (!token) {
      setSymbols([]);
      return;
    }
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        setSymbols(JSON.parse(raw));
      } catch {}
    }
  }, [storageKey, token]);

  // Persist
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    if (!token) return; // don't persist unauth symbols
    localStorage.setItem(storageKey, JSON.stringify(symbols));
    // Dispatch event to notify other components (like DashboardClient star button)
    window.dispatchEvent(new Event("watchlist:add-remove"));
  }, [symbols, storageKey, token]);

  // Poll quotes
  useEffect(() => {
    if (!symbols.length) {
      setQuotes({});
      setLastAt(null);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let mounted = true;

    async function load() {
      if (!mounted || !symbols.length) return;
      setLoading(true);
      try {
        const q = await api.batchQuotes(symbols);
        if (mounted) {
          setQuotes(q);
          setLastAt(new Date());
        }
      } catch (e) {
        console.warn("Watchlist quotes fetch failed:", e);
        if (mounted) {
          // mark each symbol with error so UI doesn't crash spam
          setQuotes((s) =>
            symbols.reduce(
              (acc, sym) => {
                acc[sym] = { ...(s[sym] || {}), error: "fetch" };
                return acc;
              },
              {} as Record<string, WLQuote>,
            ),
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
          // Schedule next update
          timer = setTimeout(load, 15000);
        }
      }
    }

    // Initial load
    load();

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [symbols]);

  const commitDraft = useCallback(() => {
    const sym = draft.trim().toUpperCase();
    if (sym && !symbols.includes(sym)) {
      setSymbols((s) => [...s, sym]);
      // Immediately show the new symbol with loading state
      setQuotes((q) => ({ ...q, [sym]: { price: undefined, error: undefined } }));
    }
    setDraft("");
    setAdding(false);
  }, [draft, symbols]);

  // SIMPLE functions for star button to call directly
  const addToWatchlist = useCallback(
    (symbol: string) => {
      const sym = symbol.trim().toUpperCase();
      if (sym && !symbols.includes(sym)) {
        setSymbols((s) => [...s, sym]);
        setQuotes((q) => ({ ...q, [sym]: { price: undefined, error: undefined } }));
      }
    },
    [symbols],
  );

  const removeFromWatchlist = useCallback((symbol: string) => {
    const sym = symbol.trim().toUpperCase();
    setSymbols((s) => s.filter((item) => item.toUpperCase() !== sym));
    setQuotes((q) => {
      const newQ = { ...q };
      delete newQ[sym];
      return newQ;
    });
  }, []);

  // Expose functions globally for star button
  useEffect(() => {
    window.watchlistAdd = addToWatchlist;
    window.watchlistRemove = removeFromWatchlist;
    return () => {
      delete window.watchlistAdd;
      delete window.watchlistRemove;
    };
  }, [addToWatchlist, removeFromWatchlist]);

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", symbols[index]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newSymbols = [...symbols];
    const draggedSymbol = newSymbols[draggedIndex];

    // Remove from old position
    newSymbols.splice(draggedIndex, 1);

    // Insert at new position
    newSymbols.splice(dropIndex, 0, draggedSymbol);

    setSymbols(newSymbols);
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };
  function cancelDraft() {
    setDraft("");
    setAdding(false);
  }
  // remove symbol feature will be reintroduced later (context menu); currently omitted

  useEffect(() => {
    function onAdd() {
      if (!token) return;
      setAdding(true);
      setTimeout(() => {
        const el = document.getElementById("watchlist-new-input");
        el?.focus();
      }, 30);
    }
    window.addEventListener("watchlist:add", onAdd as EventListener);

    // NO EVENT LISTENER - causes infinite loops. Star button will call functions directly.

    return () => {
      window.removeEventListener("watchlist:add", onAdd as EventListener);
    };
  }, [token]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Header with plus icon */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
          fontWeight: 600,
          padding: "2px 2px 4px 2px",
        }}
      >
        <span style={{ letterSpacing: 0.4 }}>Watchlist</span>
        <button
          className="mini-btn"
          title="Add symbol"
          onClick={() => {
            if (!adding) {
              setAdding(true);
              setTimeout(() => {
                const el = document.getElementById("watchlist-new-input");
                el?.focus();
              }, 20);
            }
          }}
          style={{ lineHeight: 1, fontSize: 14 }}
        >
          ＋
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {symbols.map((sym, index) => {
          const q = quotes[sym] || {};
          const price = q.price;
          const prev = q.previousClose;
          const delta = price != null && prev != null ? price - prev : undefined;
          const cls = delta != null ? (delta >= 0 ? "pl-pos" : "pl-neg") : "";
          const isDragging = draggedIndex === index;
          return (
            <div
              key={sym}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              style={{
                position: "relative",
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                padding: "6px 8px",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                background: "var(--color-bg-elevated)",
                opacity: isDragging ? 0.5 : 1,
                cursor: isDragging ? "grabbing" : "grab",
                transition: "opacity 0.2s ease",
              }}
              onMouseEnter={(e) => {
                const btn = e.currentTarget.querySelector<HTMLButtonElement>(".wl-x");
                if (btn) btn.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget.querySelector<HTMLButtonElement>(".wl-x");
                if (btn) btn.style.opacity = "0";
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <button
                  onClick={() => router.push(`/symbol/${sym}?inWatchlist=true`)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontWeight: 600,
                    textDecoration: "none",
                    color: "var(--color-fg)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "inherit",
                  }}
                >
                  {sym}
                </button>
                <span
                  style={{
                    fontSize: 10,
                    opacity: 0.65,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 140,
                  }}
                >
                  {q.longName || "—"}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ fontSize: 12 }}>
                  {price != null ? price.toFixed(2) : q.error ? "Err" : "…"}
                </span>
                <span style={{ fontSize: 11 }} className={cls}>
                  {delta != null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}` : " "}
                </span>
              </div>
              <button
                className="mini-btn wl-x"
                onClick={() => setSymbols((s) => s.filter((x) => x !== sym))}
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  fontSize: 10,
                  padding: "2px 4px",
                  opacity: 0,
                  transition: "opacity 0.15s",
                  color: "#f85149",
                }}
                title="Remove"
              >
                ✕
              </button>
            </div>
          );
        })}
        {adding && (
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "6px 8px",
              border: "1px dashed var(--color-border)",
              borderRadius: 6,
            }}
          >
            <input
              id="watchlist-new-input"
              placeholder="SYM"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitDraft();
                else if (e.key === "Escape") cancelDraft();
              }}
              onBlur={commitDraft}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--color-fg)",
                fontSize: 12,
              }}
            />
            <button className="mini-btn" onClick={cancelDraft} style={{ color: "#f85149" }}>
              ✕
            </button>
          </div>
        )}
        {!symbols.length && !adding && (
          <div style={{ fontSize: 11, opacity: 0.6, padding: "4px 2px" }}>No symbols</div>
        )}
      </div>
      <div style={{ fontSize: 9, opacity: 0.5, paddingTop: 4 }}>
        {loading ? "Quotes…" : lastAt ? `Updated ${lastAt.toLocaleTimeString()}` : " "}
      </div>
    </div>
  );
}
