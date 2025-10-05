import { api, Position, IngestRun } from '@lib/api';
import BackLink from '@components/ui/BackLink';
import PortfolioClient from './portfolio-client';
import ErrorBoundary from '@components/ErrorBoundary';

interface Props { params: { id: string } }

async function load(id: string) {
  try {
    const detail = await api.getPortfolioWithPositions(id);
    const ingests = await api.listIngests(id);
    return { positions: detail.portfolio.positions as Position[], ingests: ingests as IngestRun[], name: detail.portfolio.name, baseCcy: detail.portfolio.baseCcy };
  } catch {
    return { positions: [] as Position[], ingests: [] as IngestRun[], name: 'Portfolio', baseCcy: 'USD' };
  }
}

export default async function PortfolioPage({ params }: Props) {
  const { positions, ingests, name, baseCcy } = await load(params.id);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
      <BackLink />
      <ErrorBoundary label={`portfolio:${params.id}`}>
        <PortfolioClient id={params.id} initialPositions={positions} initialIngests={ingests} initialName={name} baseCcy={baseCcy} />
      </ErrorBoundary>
    </div>
  );
}
