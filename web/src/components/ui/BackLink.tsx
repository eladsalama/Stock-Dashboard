"use client";
import React from "react";
import { useRouter } from "next/navigation";

interface BackLinkProps {
  fallbackHref?: string;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function BackLink({
  fallbackHref = "/",
  label = "← Back",
  className,
  style,
}: BackLinkProps) {
  const router = useRouter();
  function goBack(e: React.MouseEvent) {
    e.preventDefault();
    const from = window.location.pathname + window.location.search;
    let navigated = false;
    try {
      if (window.history.length > 1) {
        window.addEventListener("popstate", function handler() {
          navigated = true;
          window.removeEventListener("popstate", handler);
        });
        window.history.back();
      }
    } catch {}
    // Fallback after 180ms if URL unchanged
    setTimeout(() => {
      if (!navigated && window.location.pathname + window.location.search === from) {
        try {
          router.push(fallbackHref);
        } catch {
          window.location.assign(fallbackHref);
        }
      }
    }, 180);
  }
  return (
    <a
      href={fallbackHref}
      onClick={goBack}
      className={className}
      style={{
        textDecoration: "none",
        color: "var(--color-accent)",
        fontSize: 12,
        cursor: "pointer",
        ...(style || {}),
      }}
    >
      {label}
    </a>
  );
}
