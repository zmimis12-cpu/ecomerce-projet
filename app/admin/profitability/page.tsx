import { requireRole } from "@/lib/auth/session";
import { getDashboardSummary, getProductPerformance } from "@/lib/dashboard/queries";
import { ProfitabilityClient } from "./profitability-client";

export const dynamic = "force-dynamic";

export default async function ProfitabilityPage() {
  await requireRole(["super_admin", "admin", "manager"]);

  const to   = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const filter = { from, to };

  const [summary, products] = await Promise.all([
    getDashboardSummary(filter),
    getProductPerformance(filter),
  ]);

  return <ProfitabilityClient summary={summary} products={products} />;
}
