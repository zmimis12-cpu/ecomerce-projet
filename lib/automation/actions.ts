"use server";
/**
 * lib/automation/actions.ts
 * Server Actions for the Automation module.
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { syncOrderToGoogleSheets, retryFailedSyncs } from "./sync-engine";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SheetType } from "./google-sheets";

const MANAGER_ROLES = ["super_admin", "admin", "manager"] as const;

// ─── Manual sync trigger ───────────────────────────────────────────────────────
export async function triggerOrderSync(orderId: string, sheetType: SheetType) {
  await requireRole([...MANAGER_ROLES]);
  const result = await syncOrderToGoogleSheets(orderId, sheetType);
  revalidatePath("/admin/automation");
  revalidatePath(`/admin/orders/${orderId}`);
  return result;
}

// ─── Retry all failed ─────────────────────────────────────────────────────────
export async function retryAllFailed() {
  await requireRole([...MANAGER_ROLES]);
  const result = await retryFailedSyncs();
  revalidatePath("/admin/automation");
  return result;
}

// ─── Clear old logs ────────────────────────────────────────────────────────────
export async function clearOldLogs(daysOld = 30) {
  await requireRole(["super_admin", "admin"]);
  const cutoff = new Date(Date.now() - daysOld * 86400_000).toISOString();

  const { error: e1 } = await supabaseAdmin
    .from("google_sheet_sync_logs")
    .delete()
    .lt("created_at", cutoff)
    .eq("status", "success");

  const { error: e2 } = await supabaseAdmin
    .from("webhook_logs")
    .delete()
    .lt("created_at", cutoff)
    .eq("status", "success");

  revalidatePath("/admin/automation");
  return { success: !e1 && !e2 };
}
