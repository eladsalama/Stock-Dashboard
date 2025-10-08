"use client";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface SymbolLinkProps {
  symbol: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

// Unified symbol navigation with resilient fallback: tries client router push; if it doesn't fire (edge hydration/navigation issues),
// performs a hard navigation after a short delay.
export function SymbolLink({ symbol, children, className, style }: SymbolLinkProps) {
  const router = useRouter();
  const lower = symbol.toLowerCase();
  const href = `/symbol/${encodeURIComponent(lower)}`;
  return (
    <Link
      href={href}
      prefetch={true}
      className={className}
      style={style}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // allow default new tab / middle click
        e.preventDefault();
        try {
          router.push(href);
          // Fallback: ensure navigation actually occurs (in case router is in a bad state)
          setTimeout(() => {
            if (!window.location.pathname.startsWith(`/symbol/`)) {
              window.location.href = href;
            }
          }, 120);
        } catch {
          window.location.href = href;
        }
      }}
    >
      {children ?? symbol}
    </Link>
  );
}

export default SymbolLink;
