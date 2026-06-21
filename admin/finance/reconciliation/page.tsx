import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getReconciliationIssues, getSummary } from "@/lib/finance/reconciliation-engine";
import { ReconciliationClient } from "@/components/finance/reconciliation-client";

export const metadata: Metadata = { title: "Réconciliation Transporteur" };
export const dynamic = "force-dynamic";

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireRole(["super_admin", "admin", "manager", "finance"]);
  const sp = await searchParams;

  const [{ issues, total }, summary] = await Promise.all([
    getReconciliationIssues({
      providerSlug: sp.provider  || undefined,
      issueType:    sp.type      || undefined,
      isResolved:   sp.resolved === "true" ? true : sp.resolved === "false" ? false : false,
      dateFrom:     sp.from      || undefined,
      dateTo:       sp.to        || undefined,
      search:       sp.q         || undefined,
      limit:        50,
      offset:       Number(sp.page ?? 0) * 50,
    }),
    getSummary(sp.provider || undefined),
  ]);

  return (
    <ReconciliationClient
      issues={issues}
      total={total}
      summary={summary}
    />
  );
}
