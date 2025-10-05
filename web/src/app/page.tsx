import { api, Portfolio } from '@lib/api';
import HomeClient from './home-client';

async function load() {
  try {
    const portfolios = await api.listPortfolios();
    return portfolios;
  } catch {
    return [] as Portfolio[];
  }
}

export default async function Home() {
  const initial = await load();
  if (initial.length === 1) {
    const p = initial[0];
    const detail = await api.getPortfolioWithPositions(p.id);
  const mod = await import('../components/dashboard/DashboardClient');
  const DashboardClient: React.ComponentType<{ portfolio: Portfolio & { positions: any[] } }> = mod.default;
  return <DashboardClient portfolio={detail.portfolio} />;
  }
  return <HomeClient initial={initial} />;
}
