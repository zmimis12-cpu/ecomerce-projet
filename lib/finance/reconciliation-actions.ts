"use server";
import { requireRole } from "@/lib/auth/session";
import { runReconciliation, resolveIssue } from "@/lib/finance/reconciliation-engine";
import { revalidatePath } from "next/cache";

const MANAGER = ["super_admin", "admin", "manager", "finance"] as const;

export async function triggerReconciliation(params?: {
  providerSlug?: string;
  dateFrom?:     string;
  dateTo?:       string;
}) {
  await requireRole([...MANAGER]);
  return runReconciliation({
    providerSlug: params?.providerSlug ?? "digylog",
    dateFrom:     params?.dateFrom,
    dateTo:       params?.dateTo,
  });
}

export async function markResolved(issueId: string, note: string) {
  const session = await requireRole([...MANAGER]);
  await resolveIssue(issueId, note, session.authId);
  revalidatePath("/admin/finance/reconciliation");
}
