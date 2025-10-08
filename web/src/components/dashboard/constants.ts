// Shared range constants & types
export const RANGES = ["1d", "1w", "1m", "1y", "5y"] as const;
export type RangeKey = (typeof RANGES)[number];
