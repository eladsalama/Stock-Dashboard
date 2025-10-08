export function timeAgo(ts?: string | Date | null): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  const diff = Date.now() - d.getTime();
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1_000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
