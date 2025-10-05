import type { Portfolio, Position } from '../../lib/api';

export interface DashboardClientProps { portfolio: Portfolio & { positions: Position[] } }
declare const DashboardClient: React.ComponentType<DashboardClientProps>;
export default DashboardClient;