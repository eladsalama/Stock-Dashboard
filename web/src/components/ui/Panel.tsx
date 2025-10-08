"use client";
import React from "react";

interface PanelProps {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}

export function Panel({ title, actions, children, style, bodyStyle }: PanelProps) {
  return (
    <div className="panel" style={style}>
      {(title || actions) && (
        <div className="panel-header">
          <span>{title}</span>
          <div style={{ display: "flex", gap: 6 }}>{actions}</div>
        </div>
      )}
      <div className="panel-body" style={bodyStyle}>
        {children}
      </div>
    </div>
  );
}
