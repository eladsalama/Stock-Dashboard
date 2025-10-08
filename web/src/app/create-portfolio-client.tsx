"use client";
import React, { useState } from "react";
import { useAuth } from "@components/auth-context/AuthContext";
import { api, Portfolio } from "@lib/api";
import { useToast } from "@components/ui/toast";

interface Props {
  onCreated?: (p: Portfolio) => void;
}

export default function CreatePortfolio({ onCreated }: Props) {
  const { token } = useAuth();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { push } = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const p = await api.createPortfolio(name.trim());
      push({ type: "success", title: "Portfolio created", message: p.name });
      if (onCreated) onCreated(p);
      setName("");
    } catch (e) {
      if (e instanceof Error) setError(e.message);
      else setError("Failed");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div style={{ marginBottom: 16, fontSize: 12, opacity: 0.7 }}>
        Sign in to create portfolios.
      </div>
    );
  }
  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New portfolio name"
        style={{
          flex: 1,
          padding: "6px 8px",
          background: "#010409",
          color: "#e6edf3",
          border: "1px solid #30363d",
          borderRadius: 4,
        }}
      />
      <button
        type="submit"
        disabled={loading}
        style={{
          padding: "6px 14px",
          background: "var(--color-success)",
          border: "1px solid var(--color-success)",
          color: "#fff",
          borderRadius: 4,
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Creating..." : "Create"}
      </button>
      {error && <span style={{ fontSize: 12, color: "#ff6b6b" }}>{error}</span>}
    </form>
  );
}
