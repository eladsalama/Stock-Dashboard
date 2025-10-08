"use client";
import React from "react";

export default function SidebarHeaderClient() {
  function onAdd() {
    try {
      window.dispatchEvent(new CustomEvent("sidebar:toggle-create"));
    } catch {}
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ flex: 1 }}>Portfolios</span>
      <button
        className="mini-btn"
        title="Add Portfolio"
        onClick={onAdd}
        style={{ lineHeight: 1 }}
        type="button"
      >
        ＋
      </button>
    </div>
  );
}
