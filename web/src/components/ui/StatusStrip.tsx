"use client";
import React, { useEffect, useState } from "react";
import { useAuth } from "@components/auth-context/AuthContext";

export default function StatusStrip() {
  const { token } = useAuth();
  const [latency, setLatency] = useState<number | null>(null);
  const [lastPing, setLastPing] = useState<Date | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function ping() {
      const start = performance.now();
      try {
        const headers: HeadersInit = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        await fetch(
          (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000") + "/v1/portfolios",
          {
            method: "HEAD",
            headers,
          },
        );
      } catch {
        // fallback: attempt GET but ignore body
        try {
          const headers: HeadersInit = {};
          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }
          await fetch(
            (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000") + "/v1/portfolios",
            { headers },
          );
        } catch {}
      } finally {
        const ms = performance.now() - start;
        setLatency(ms);
        setLastPing(new Date());
        // Reduce polling frequency to save memory
        timer = setTimeout(ping, 60000); // Changed from 15s to 60s
      }
    }

    // Only ping if we have a token (user is logged in)
    if (token) {
      ping();
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [token]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 240,
        right: 0,
        height: 22,
        background: "var(--color-bg-elevated)",
        borderTop: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: 18,
        fontSize: 11,
        zIndex: 4000,
      }}
    >
      <span style={{ opacity: 0.7 }}>Latency: {latency ? `${latency.toFixed(0)}ms` : "…"}</span>
      <span style={{ opacity: 0.5 }}>
        Last ping: {lastPing ? lastPing.toLocaleTimeString() : "—"}
      </span>
      <span style={{ marginLeft: "auto", opacity: 0.4 }}>Desktop Mode</span>
    </div>
  );
}
