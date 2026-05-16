"use server";
/**
 * lib/finance/return-verification.ts
 *
 * Return verification engine.
 * Links provider "returned" status to physical warehouse scan.
 * Feeds into reconciliation automatically.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

const MANAGER = ["super_admin", "admin", "manager"] as const;

export type ReturnCondition = "good" | "damaged" | "missing_quantity" | "wrong_product" | "unknown";
export type ReconciliationStatus = "pending" | "verified_ok" | "discrepancy" | "lost";

// ─── Called from Scanner when a returned parcel is scanned ───────────────────
export async function recordReturnScan(params: {
  trackingNumber:   string;
  condition:        ReturnCondition;
  receivedQuantity?: number;
  notes?:           string;
}): Promise<{ success: boolean; status: ReconciliationStatus; message: string }> {
  const session = await requireRole(["super_admin", "admin", "manager", "warehouse"]);

  const { trackingNumber, condition, receivedQuantity, notes } = params;

  // Find matching order
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, status, delivery_status, delivery_tracking_number")
    .eq("delivery_tracking_number", trackingNumber)
    .maybeSingle();

  const o = order as { id: string; order_number: string; status: string; delivery_status: string | null } | null;

  // Get expected quantity from order_items
  let expectedQty = 1;
  if (o) {
    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("quantity")
      .eq("order_id", o.id);
    expectedQty = ((items ?? []) as { quantity: number }[]).reduce((s, i) => s + (i.quantity ?? 1), 0);
  }

  const received = receivedQuantity ?? expectedQty;
  const qtyMatch = received >= expectedQty;
  const conditionOk = condition === "good";

  // Determine reconciliation status
  let reconStatus: ReconciliationStatus = "verified_ok";
  let discrepancyNote = "";

  if (condition === "lost" as ReturnCondition || !o) {
    reconStatus = "lost";
    discrepancyNote = "Colis introuvable ou non associé à une commande.";
  } else if (!conditionOk || !qtyMatch) {
    reconStatus = "discrepancy";
    const issues: string[] = [];
    if (condition === "damaged")         issues.push("Colis endommagé");
    if (condition === "missing_quantity") issues.push(`Quantité reçue: ${received}/${expectedQty}`);
    if (condition === "wrong_product")    issues.push("Mauvais produit");
    discrepancyNote = issues.join("; ");
  }

  // Upsert return verification record
  await supabaseAdmin.from("return_verifications").upsert({
    tracking_number:          trackingNumber,
    order_id:                 o?.id ?? null,
    provider_slug:            "digylog",
    scanned_at:               new Date().toISOString(),
    scanned_by:               session.authId,
    condition,
    received_quantity:        received,
    expected_quantity:        expectedQty,
    reconciliation_status:    reconStatus,
    discrepancy_note:         discrepancyNote || notes || null,
    refund_eligible:          reconStatus === "verified_ok" || reconStatus === "discrepancy",
    updated_at:               new Date().toISOString(),
  } as never, { onConflict: "tracking_number,provider_slug" });

  // Update order status if not already returned
  if (o) {
    await supabaseAdmin.from("orders").update({
      status:          "returned",
      delivery_status: "returned",
    } as never).eq("id", o.id);

    // Auto-create reconciliation issue if discrepancy
    if (reconStatus === "discrepancy" || reconStatus === "lost") {
      await supabaseAdmin.from("reconciliation_issues").upsert({
        order_id:     o.id,
        tracking:     trackingNumber,
        order_number: o.order_number,
        provider_slug: "digylog",
        issue_type:   reconStatus === "lost" ? "missing_return" : "damaged_return",
        severity:     reconStatus === "lost" ? "error" : "warning",
        description:  discrepancyNote || "Anomalie détectée lors du scan retour.",
        is_resolved:  false,
      } as never, { onConflict: "tracking,issue_type", ignoreDuplicates: false });
    }
  }

  revalidatePath("/admin/finance/reconciliation");
  revalidatePath("/admin/delivery/returns");

  return {
    success: true,
    status:  reconStatus,
    message: reconStatus === "verified_ok"
      ? `✓ Retour validé — ${trackingNumber}`
      : `⚠ Anomalie détectée — ${discrepancyNote}`,
  };
}

// ─── Find returns declared by provider but not yet scanned ───────────────────
export async function findUnscannedReturns(providerSlug = "digylog"): Promise<{
  tracking: string;
  orderNumber: string;
  city: string;
  daysSinceReturn: number;
}[]> {
  // Orders marked returned by provider
  const { data: returned } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, delivery_tracking_number, customer_city, updated_at")
    .in("status", ["returned"])
    .not("delivery_tracking_number", "is", null)
    .order("updated_at", { ascending: false })
    .limit(200);

  type ORow = { id: string; order_number: string; delivery_tracking_number: string; customer_city: string; updated_at: string };
  const returnedOrders = (returned ?? []) as ORow[];
  if (!returnedOrders.length) return [];

  // Get already scanned
  const { data: scanned } = await supabaseAdmin
    .from("return_verifications")
    .select("tracking_number")
    .eq("provider_slug", providerSlug)
    .not("scanned_at", "is", null)
    .in("tracking_number", returnedOrders.map((o) => o.delivery_tracking_number));

  const scannedSet = new Set(((scanned ?? []) as { tracking_number: string }[]).map((s) => s.tracking_number));

  const now = Date.now();
  return returnedOrders
    .filter((o) => !scannedSet.has(o.delivery_tracking_number))
    .map((o) => ({
      tracking:        o.delivery_tracking_number,
      orderNumber:     o.order_number,
      city:            o.customer_city,
      daysSinceReturn: Math.floor((now - new Date(o.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
    }))
    .filter((r) => r.daysSinceReturn >= 1); // only if at least 1 day old
}

// ─── Get return verification stats ───────────────────────────────────────────
export async function getReturnStats(providerSlug?: string) {
  let q = supabaseAdmin
    .from("return_verifications")
    .select("reconciliation_status, condition, refund_eligible");

  if (providerSlug) q = q.eq("provider_slug", providerSlug);
  const { data } = await q;
  type R = { reconciliation_status: string; condition: string; refund_eligible: boolean };
  const rows = (data ?? []) as R[];

  return {
    total:        rows.length,
    verified:     rows.filter((r) => r.reconciliation_status === "verified_ok").length,
    discrepancies: rows.filter((r) => r.reconciliation_status === "discrepancy").length,
    lost:         rows.filter((r) => r.reconciliation_status === "lost").length,
    pending:      rows.filter((r) => r.reconciliation_status === "pending").length,
    refundEligible: rows.filter((r) => r.refund_eligible).length,
  };
}
