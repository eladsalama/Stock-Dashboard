import { api, Portfolio, Position } from "@lib/api";
import HomeClient from "./home-client";

export default async function Home() {
  let initial: Portfolio[] = [];
  try {
    initial = await api.listPortfolios();
  } catch (e) {
    console.error("[home] listPortfolios failed (continuing with empty)", (e as Error)?.message);
  }

  if (initial.length === 1) {
    try {
      const p = initial[0];
      const detail = await api.getPortfolioWithPositions(p.id);
      const mod = await import("../components/dashboard/DashboardClient");
      const DashboardClient: React.ComponentType<{
        portfolio: Portfolio & { positions: Position[] };
      }> = mod.default;
      return <DashboardClient portfolio={detail.portfolio} />;
    } catch (e) {
      console.error("[home] prefetch single portfolio dashboard failed, falling back to list", e);
    }
  }

  return <HomeClient initial={initial} />;
}
