"use client";
import React from "react";
import Link from "next/link";
import { Portfolio } from "@lib/api";
import CreatePortfolio from "./create-portfolio-client";
import { useAuth } from "@components/auth-context/AuthContext";
import { api } from "@lib/api";
import { useToast } from "@components/ui/toast";

function OfflineBanner() {
  if (typeof navigator === "undefined") return null;
  const [online, setOnline] = React.useState(true);
  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (online) return null;
  return (
    <div
      style={{
        background: "#582",
        padding: "4px 8px",
        fontSize: 12,
        borderRadius: 4,
        marginBottom: 8,
      }}
    >
      Offline - cached data
    </div>
  );
}

function timeAgo(ts?: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

export default function HomeClient({ initial }: { initial: Portfolio[] }) {
  const { token } = useAuth();
  const [portfolios, setPortfolios] = React.useState(initial);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const { push } = useToast();

  function startEdit(p: Portfolio) {
    setEditing(p.id);
    setEditName(p.name);
  }

  async function commitEdit(id: string) {
    const name = editName.trim();
    if (!name) {
      setEditing(null);
      return;
    }
    try {
      const updated = await api.renamePortfolio(id, name);
      setPortfolios((ps) => ps.map((p) => (p.id === id ? { ...p, name: updated.name } : p)));
      push({ type: "success", title: "Renamed", message: name });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Rename failed";
      push({ type: "error", title: "Rename failed", message: msg });
    } finally {
      setEditing(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this portfolio? This cannot be undone.")) return;
    const prev = portfolios;
    setPortfolios((ps) => ps.filter((p) => p.id !== id));
    try {
      await api.deletePortfolio(id);
      push({ type: "success", title: "Deleted", message: "Portfolio removed" });
    } catch (e) {
      setPortfolios(prev); // rollback
      const msg = e instanceof Error ? e.message : "Delete failed";
      push({ type: "error", title: "Delete failed", message: msg });
    }
  }
  return (
    <div style={{ display: "grid", gap: 32 }}>
      <section>
        <h2 style={{ marginTop: 0 }}>Portfolios</h2>
        <OfflineBanner />
        <CreatePortfolio onCreated={(p) => setPortfolios((prev) => [...prev, p])} />
        {portfolios.length === 0 && <p style={{ opacity: 0.7 }}>No portfolios yet.</p>}
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {portfolios.map((p) => {
            const ingestLabel = timeAgo(p.lastIngestAt);
            const isEdit = editing === p.id;
            return (
              <li
                key={p.id}
                style={{
                  padding: "8px 0",
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto auto",
                  gap: 12,
                  alignItems: "center",
                  borderBottom: "1px solid #161b22",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {!isEdit && <Link href={`/portfolios/${p.id}`}>{p.name}</Link>}
                  {isEdit && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        commitEdit(p.id);
                      }}
                      style={{ display: "flex", gap: 4 }}
                    >
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => commitEdit(p.id)}
                        style={{
                          padding: "2px 4px",
                          fontSize: 13,
                          background: "var(--color-bg-elevated)",
                          color: "var(--color-fg)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 4,
                        }}
                      />
                    </form>
                  )}
                  <span style={{ fontSize: 11, opacity: 0.6 }}>Base: {p.baseCcy}</span>
                </div>
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  {p.lastIngestStatus ?? "no ingests"}
                </span>
                <span style={{ fontSize: 11, opacity: 0.5 }}>{ingestLabel}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {token && !isEdit && (
                    <button onClick={() => startEdit(p)} style={iconBtnStyle}>
                      Rename
                    </button>
                  )}
                  {token && (
                    <button
                      onClick={() => remove(p.id)}
                      style={{ ...iconBtnStyle, color: "#f85149" }}
                    >
                      Del
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #30363d",
  color: "#7d8590",
  fontSize: 11,
  padding: "2px 6px",
  borderRadius: 4,
  cursor: "pointer",
};
