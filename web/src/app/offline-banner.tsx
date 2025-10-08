"use client";
import React, { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function check() {
      try {
        const res = await fetch(
          process.env.NEXT_PUBLIC_API_BASE
            ? `${process.env.NEXT_PUBLIC_API_BASE}/healthz`
            : "http://localhost:3000/healthz",
          { cache: "no-store" },
        );
        setOnline(res.ok);
      } catch {
        setOnline(false);
      }
      timer = setTimeout(check, 8000);
    }
    check();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (online) return null;
  return (
    <div
      style={{
        background: "#3d1d1d",
        border: "1px solid #f85149",
        color: "#f85149",
        padding: "6px 10px",
        borderRadius: 4,
        margin: "0 0 12px 0",
        fontSize: 13,
      }}
    >
      Backend unreachable — start API server on port 3000.
    </div>
  );
}
