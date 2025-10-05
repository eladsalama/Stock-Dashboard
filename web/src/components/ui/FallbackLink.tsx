"use client";
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface FallbackLinkProps extends React.PropsWithChildren<object> {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  prefetch?: boolean;
}

// A resilient Link that force-navigates if the App Router push stalls.
export default function FallbackLink({ href, children, className, style, title, prefetch = true }: FallbackLinkProps) {
  const router = useRouter();
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={className}
      style={style}
      title={title}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // allow new tab etc.
        e.preventDefault();
        let soft = true;
        try { router.push(href); } catch { soft = false; }
        const startPath = window.location.pathname;
        setTimeout(() => {
          if (soft && window.location.pathname === startPath) {
            console.warn('[FallbackLink] forcing hard nav', { href });
            window.location.assign(href);
          }
        }, 180);
      }}
    >{children}</Link>
  );
}
