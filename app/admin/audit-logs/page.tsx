import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getAuditLogs } from "@/lib/audit/audit-logger";
import { AuditLogsClient } from "@/components/audit/audit-logs-client";

export const metadata: Metadata = { title: "Audit Logs" };
export const dynamic = "force-dynamic";

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireRole(["super_admin", "admin"]);
  const sp = await searchParams;

  const { logs, total } = await getAuditLogs({
    actionType:   sp.action   || undefined,
    entityType:   sp.entity   || undefined,
    sourceModule: sp.module   || undefined,
    from:         sp.from     || undefined,
    to:           sp.to       || undefined,
    search:       sp.q        || undefined,
    limit:        50,
    offset:       Number(sp.page ?? 0) * 50,
  });

  return <AuditLogsClient logs={logs} total={total} />;
}
