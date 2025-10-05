import { api } from '@lib/api';

export default async function DashboardPage() {
  const portfolios = await api.listPortfolios();
  if (!portfolios.length) return <div style={{ padding:20 }}>No portfolios yet.</div>;
  const p = portfolios[0];
  const detail = await api.getPortfolioWithPositions(p.id);
  const DashboardClient = (await import('../../components/dashboard/DashboardClient')).default as any;
  return <DashboardClient portfolio={detail.portfolio as any} />;
}