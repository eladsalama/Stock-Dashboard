// Simple API helper for the dashboard UI
// Assumes backend fastify server reachable at NEXT_PUBLIC_API_BASE (e.g. http://localhost:3000)

// Resolve API base at runtime (client + server). Allow overriding via NEXT_PUBLIC_API_BASE.
// Fallback to relative fetch if same-origin (better for prod deployment behind a proxy) otherwise localhost.
let resolvedBase: string | null = null;
export function getBase() {
  if (resolvedBase) return resolvedBase;
  const envBase = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_BASE : undefined;
  if (envBase) {
    resolvedBase = envBase.replace(/\/$/, '');
    return resolvedBase;
  }
  // No env override: prefer localhost:3000 (Fastify) rather than window origin (Next.js on 3100)
  // This avoids accidentally calling the Next.js dev server and getting an HTML 404 page.
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (/3000$/.test(origin)) {
      resolvedBase = origin.replace(/\/$/, '');
      return resolvedBase;
    }
  }
  // Explicit fallback (dev) always port 3000
  resolvedBase = 'http://localhost:3000';
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.warn('[api] Using fallback API base http://localhost:3000. Set NEXT_PUBLIC_API_BASE to silence this.');
  }
  return resolvedBase;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = getBase();
  const url = `${base}${path}`;
  // Only set JSON content-type if we actually send a body and caller didn't override.
  const headers: Record<string,string> = { ...(init.headers as Record<string,string> | undefined) };
  if (init.body && !Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, { ...init, headers, cache: 'no-store' });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok) {
    const text = await res.text();
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.error('[api] request failed', { url, status: res.status, statusText: res.statusText, bodySnippet: text.slice(0, 180) });
      if (res.status === 404 && ct.includes('text/html')) {
        console.error('[api] Received HTML 404 (likely Next.js dev server). Ensure NEXT_PUBLIC_API_BASE points to Fastify backend (e.g. http://localhost:3000).');
      }
    }
    throw new Error(`API ${res.status} ${res.statusText}: ${ct.includes('text/html') ? 'Unexpected HTML response (is API base misconfigured?)' : text}`);
  }
  if (res.status === 204) return undefined as unknown as T; // No Content
  // Some endpoints (CSV export) return text/csv
  if (ct.includes('application/json')) {
    try {
      return (await res.json()) as T;
    } catch (e) {
      // Gracefully handle empty body with JSON header (rare) or parse error
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.warn('[api] JSON parse failed, returning undefined', { url });
      }
      return undefined as unknown as T;
    }
  }
  const textBody = await res.text();
  return textBody as unknown as T;
}

export interface Portfolio {
  id: string;
  name: string;
  baseCcy: string;
  createdAt: string;
  lastIngestAt?: string | null;
  lastIngestStatus?: string | null;
}

export interface Position {
  id: string;
  portfolioId: string;
  symbol: string;
  quantity: number; // quantity in decimal in DB, serialized as string -> rely on JSON decimal -> convert later if needed
  avgCost: number;  // backend field name is avgCost
  createdAt: string;
}

export interface IngestRun {
  id: string;
  objectKey: string;
  status: string; // pending | ok | error | partial
  rowsOk: number;
  rowsFailed: number;
  startedAt: string;
  finishedAt: string | null;
}

export const api = {
  async listPortfolios(): Promise<Portfolio[]> {
    const data = await request<{ portfolios: Portfolio[] }>('/v1/portfolios');
    return data.portfolios || [];
  },
  async createPortfolio(name: string): Promise<Portfolio> {
    const data = await request<{ portfolio: Portfolio }>('/v1/portfolios', { method: 'POST', body: JSON.stringify({ name }) });
    return data.portfolio;
  },
  async renamePortfolio(id: string, name: string): Promise<Portfolio> {
    const data = await request<{ portfolio: Portfolio }>(`/v1/portfolios/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
    return data.portfolio;
  },
  async deletePortfolio(id: string): Promise<void> {
    await request<void>(`/v1/portfolios/${id}`, { method: 'DELETE' });
  },
  async getPortfolioWithPositions(id: string): Promise<{ portfolio: Portfolio & { positions: Position[] } }> {
    return request<{ portfolio: Portfolio & { positions: Position[] } }>(`/v1/portfolios/${id}`);
  },
  async listIngests(portfolioId: string): Promise<IngestRun[]> {
    const data = await request<{ ingests: IngestRun[] }>(`/v1/portfolios/${portfolioId}/ingests`);
    return data.ingests || [];
  },
  async listPositions(portfolioId: string): Promise<Position[]> {
    const data = await request<{ positions: Position[] }>(`/v1/portfolios/${portfolioId}/positions`);
    return data.positions || [];
  },
  async presignTradesUpload(portfolioId: string, filename: string) {
    return request<{ bucket: string; key: string; url: string; expiresIn: number }>(`/v1/uploads/trades:presign`, {
      method: 'POST',
      body: JSON.stringify({ portfolioId, filename, contentType: 'text/csv' })
    });
  },
  async presignPositionsUpload(portfolioId: string, filename: string) {
    return request<{ bucket: string; key: string; url: string; expiresIn: number }>(`/v1/uploads/positions:presign`, {
      method: 'POST',
      body: JSON.stringify({ portfolioId, filename, contentType: 'text/csv' })
    });
  },
  async enqueueIngest(portfolioId: string, key: string) {
    return request<{ enqueued: boolean; runId?: string }>(`/v1/uploads/enqueue`, {
      method: 'POST',
      body: JSON.stringify({ portfolioId, key })
    });
  },
  async batchQuotes(symbols: string[]): Promise<Record<string, { price?: number; currency?: string; asOf?: string; error?: string; previousClose?: number; change?: number; changePercent?: number; longName?: string; cached?: boolean }>> {
    if (symbols.length === 0) return {};
    const param = symbols.join(',');
    const data = await request<{ quotes: Record<string, { price?: number; previousClose?: number; change?: number; changePercent?: number; asOf?: string; longName?: string; error?: string; cached?: boolean }> }>(`/v1/quotes?symbols=${encodeURIComponent(param)}`);
    return data.quotes;
  },
  async history(symbol: string, range: string) {
    return request<{ symbol: string; range: string; candles: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }> }>(`/v1/quotes/${encodeURIComponent(symbol)}/history?range=${encodeURIComponent(range)}`);
  },
  // --- Positions CRUD ---
  async createPosition(portfolioId: string, symbol: string, quantity: number, avgCost: number) {
    const data = await request<{ position: Position }>(`/v1/portfolios/${portfolioId}/positions`, {
      method: 'POST',
      body: JSON.stringify({ symbol, quantity, avgCost })
    });
    return data.position;
  },
  async updatePosition(positionId: string, patch: Partial<Pick<Position, 'quantity' | 'avgCost'>>) {
    const data = await request<{ position: Position }>(`/v1/positions/${positionId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    });
    return data.position;
  },
  async deletePosition(positionId: string) {
    await request<void>(`/v1/positions/${positionId}`, { method: 'DELETE' });
  },
  async exportPositionsCsv(portfolioId: string): Promise<string> {
    return request<string>(`/v1/portfolios/${portfolioId}/positions:csv`);
  },
  async importPositionsCsv(portfolioId: string, csv: string) {
    // Send raw CSV (text/csv)
    const base = getBase();
    const url = `${base}/v1/portfolios/${portfolioId}/positions:import`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: csv
    });
    if (!res.ok) throw new Error(`Import failed ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return { ok: true };
  }
};
