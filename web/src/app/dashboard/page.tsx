import { api, Portfolio, Position } from '@lib/api';

export default async function DashboardPage() {
  const portfolios = await api.listPortfolios();
  if (!portfolios.length) return <div style={{ padding:20 }}>No portfolios yet.</div>;
  const p = portfolios[0];
  const detail = await api.getPortfolioWithPositions(p.id);
  const mod = await import('../../components/dashboard/DashboardClient');
  const DashboardClient: React.ComponentType<{ portfolio: Portfolio & { positions: Position[] } }> = mod.default;
  return <DashboardClient portfolio={detail.portfolio} />;
}