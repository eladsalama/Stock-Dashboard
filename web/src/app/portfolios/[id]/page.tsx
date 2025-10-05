import { api, Position, IngestRun } from '@lib/api';
import Link from 'next/link';
import PortfolioClient from './portfolio-client';

interface Props { params: { id: string } }

async function load(id: string) {
  try {
    const detail = await api.getPortfolioWithPositions(id);
    const ingests = await api.listIngests(id);
    return { positions: detail.portfolio.positions as Position[], ingests: ingests as IngestRun[] };
  } catch {
    return { positions: [] as Position[], ingests: [] as IngestRun[] };
  }
}

export default async function PortfolioPage({ params }: Props) {
  const { positions, ingests } = await load(params.id);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
      <Link href="/" style={{ color:'var(--color-accent)', textDecoration:'none' }}>← Back</Link>
      <PortfolioClient id={params.id} initialPositions={positions} initialIngests={ingests} />
    </div>
  );
}
