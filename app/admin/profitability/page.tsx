import { requireRole } from "@/lib/auth/session";
import { getDashboardSummary, getProductPerformance } from "@/lib/dashboard/queries";
import { ProfitabilityClient } from "./profitability-client";

export const dynamic = "force-dynamic";

export default async function ProfitabilityPage() {
  await requireRole(["super_admin", "admin", "manager"]);

  const [summary, products] = await Promise.all([
    getDashboardSummary({ days: 30 }),
    getProductPerformance({ days: 30 }),
  ]);

  return <ProfitabilityClient summary={summary} products={products} />;
}
