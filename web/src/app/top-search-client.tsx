"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@lib/api";
import { useAuth } from "../components/auth-context/AuthContext";

// Lightweight symbol search bar with optional quick suggestions.
export default function TopSearchClient() {
  const { theme, user } = useAuth();
  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState<
    Array<{ symbol: string; shortname?: string; longname?: string; exch?: string }>
  >([]);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSuggest([]);
      setSelectedIndex(-1);
      return;
    }
    let active = true;
    const current = term;
    const controller = new AbortController();
    const run = async () => {
      try {
        const res = await api.search(current.toUpperCase());
        if (!active) return;
        setSuggest(res.items || []);
        setOpen(true);
        setSelectedIndex(-1);
      } catch {
        if (active) {
          setSuggest([]);
          setSelectedIndex(-1);
        }
      }
    };
    run();
    return () => {
      active = false;
      controller.abort();
    };
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  function submit(symbol?: string) {
    const target = (symbol || q).trim().toUpperCase();
    if (!target) return;

    // Check if symbol is in watchlist
    let inWatchlist = false;
    try {
      const storageKey = `watchlist.symbols.v1.${user?.email || "anon"}`;
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          inWatchlist = arr.some(
            (item) => typeof item === "string" && item.trim().toUpperCase() === target,
          );
        }
      }
    } catch {
      // If error checking watchlist, just proceed without the parameter
    }

    // Navigate with or without inWatchlist parameter
    const url = `/symbol/${encodeURIComponent(target)}${inWatchlist ? "?inWatchlist=true" : ""}`;
    router.push(url);
    setOpen(false);
  }

  const navBtnStyle: React.CSSProperties = {
    background: theme === "light" ? "#f6f8fa" : "#161b22",
    border: theme === "light" ? "1px solid #d0d7de" : "1px solid #30363d",
    color: theme === "light" ? "#656d76" : "#9aa0a6",
    fontSize: 11,
    padding: "4px 6px",
    borderRadius: 6,
    cursor: "pointer",
    lineHeight: 1,
    width: 30,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div
      ref={boxRef}
      style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, marginLeft: 40 }}
    >
      <button type="button" onClick={() => history.back()} style={navBtnStyle} title="Back">
        ◀
      </button>
      <button type="button" onClick={() => history.forward()} style={navBtnStyle} title="Forward">
        ▶
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{ display: "flex", alignItems: "center", gap: 0, position: "relative" }}
      >
        <div style={{ position: "relative" }}>
          <img 
            src="/search-icon.svg" 
            alt="Search"
            style={{
              position: "absolute",
              left: 10,
              top: 4,
              width: 20,
              height: 20,
              pointerEvents: "none",
              filter: "brightness(0) saturate(100%) invert(58%) sepia(96%) saturate(1286%) hue-rotate(188deg) brightness(103%) contrast(101%)",
            }}
          />
          <input
            aria-label="Search symbol"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((prev) => 
                  prev < suggest.length - 1 ? prev + 1 : prev
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
              } else if (e.key === "Escape") {
                setOpen(false);
                setSelectedIndex(-1);
              } else if (e.key === "Enter" && selectedIndex >= 0) {
                e.preventDefault();
                submit(suggest[selectedIndex].symbol);
              }
            }}
            placeholder="Search symbol or company"
            style={{
              background: theme === "light" ? "#ffffff" : "#161b22",
              border: theme === "light" ? "1px solid #d0d7de" : "1px solid #30363d",
              borderRadius: 6,
              padding: "4px 14px 4px 35px",
              fontSize: 12,
              color: theme === "light" ? "#24292f" : "#e6edf3",
              width: 285,
              height: 19,
              outline: "none",
            }}
          />
        </div>
        {open && suggest.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 4,
              background: theme === "light" ? "#ffffff" : "#161b22",
              border: theme === "light" ? "1px solid #d0d7de" : "1px solid #30363d",
              borderRadius: 8,
              padding: 6,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              width: 320,
              zIndex: 50,
              boxShadow:
                theme === "light" ? "0 4px 12px rgba(0,0,0,0.15)" : "0 4px 12px rgba(0,0,0,0.4)",
            }}
          >
          {suggest.map((s, idx) => (
            <button
              key={s.symbol}
              onClick={() => submit(s.symbol)}
              onMouseEnter={() => setSelectedIndex(idx)}
              style={{
                background: selectedIndex === idx 
                  ? (theme === "light" ? "#f6f8fa" : "#21262d")
                  : "transparent",
                border: "none",
                textAlign: "left",
                padding: "6px 6px",
                fontSize: 12,
                cursor: "pointer",
                color: theme === "light" ? "#24292f" : "#e6edf3",
                borderRadius: 6,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
              onMouseDown={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  submit(s.symbol);
                }
              }}
            >
              <span style={{ fontWeight: 600, letterSpacing: 0.5 }}>{s.symbol}</span>
              <span style={{ fontSize: 10, opacity: 0.55 }}>{s.longname || s.shortname || ""}</span>
            </button>
          ))}
          <div style={{ fontSize: 9, opacity: 0.45, padding: "2px 4px" }}>
            ↑↓ to navigate • Enter to open • Esc to close
          </div>
        </div>
        )}
      </form>
    </div>
  );
}
