/**
 * lib/finance/reconciliation-engine.ts
 *
 * Automatic reconciliation engine.
 * Compares internal order data vs provider API data.
 * Provider-agnostic — Digylog is just one adapter.
 *
 * Flow:
 *   runReconciliation(provider, storeId?)
 *     → syncStatuses()     — pull live tracking statuses from provider API
 *     → syncInvoices()     — pull payout invoices from provider API
 *     → compareOrders()    — detect discrepancies
 *     → saveIssues()       — write to reconciliation_issues
 *     → return summary
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createDigylogClientFromDB } from "@/lib/delivery/digylog/client";
import { mapDigylogStatus } from "@/lib/delivery/digylog/status-map";
import { getShippingFeeSync, isKnownCasablanca } from "@/lib/finance/fee-rules";

// ─── Fee rules — use dynamic engine ──────────────────────────────────────────
function isCasablanca(city: string): boolean { return isKnownCasablanca(city); }
function expectedProviderFee(city: string): number { return getShippingFeeSync(city).shippingFee; }

// ─── Issue types ──────────────────────────────────────────────────────────────
type IssueType =
  | "delivered_not_paid"
  | "paid_but_not_delivered"
  | "casa_overcharged"
  | "shipping_fee_mismatch"
  | "missing_return"
  | "unknown_return"
  | "missing_refund"
  | "unknown_refund"
  | "damaged_return"
  | "quantity_mismatch"
  | "invoice_total_mismatch";

type Severity = "info" | "warning" | "error";

interface ReconciliationIssue {
  orderId?:      string;
  tracking?:     string;
  orderNumber?:  string;
  city?:         string;
  providerSlug:  string;
  storeName?:    string;
  invoiceRef?:   string;
  codAmount?:    number;
  expectedFee?:  number;
  actualFee?:    number;
  expectedNet?:  number;
  actualPaid?:   number;
  issueType:     IssueType;
  severity:      Severity;
  description:   string;
}

// ─── Main reconciliation runner ───────────────────────────────────────────────
export async function runReconciliation(params: {
  providerSlug: string;
  storeId?:     string;
  dateFrom?:    string;
  dateTo?:      string;
}): Promise<{
  success:        boolean;
  synced:         number;
  issuesFound:    number;
  issuesByType:   Record<string, number>;
  error?:         string;
}> {
  const { providerSlug, storeId, dateFrom, dateTo } = params;

  // Log sync start
  const { data: syncLog } = await supabaseAdmin.from("provider_sync_logs").insert({
    provider_slug: providerSlug,
    sync_type:     "full",
    status:        "running",
  } as never).select("id").single();
  const syncLogId = (syncLog as { id: string } | null)?.id;

  try {
    let synced = 0;
    const issues: ReconciliationIssue[] = [];

    if (providerSlug === "digylog") {
      const result = await reconcileDigylog({ storeId, dateFrom, dateTo });
      synced = result.synced;
      issues.push(...result.issues);
    } else {
      // Future providers
      console.log(`[reconcile] Provider '${providerSlug}' not yet implemented`);
    }

    // Save issues (deduplicate by tracking + issue_type)
    const saved = await saveIssues(issues, providerSlug);

    const issuesByType: Record<string, number> = {};
    for (const i of issues) {
      issuesByType[i.issueType] = (issuesByType[i.issueType] ?? 0) + 1;
    }

    // Update sync log
    if (syncLogId) {
      await supabaseAdmin.from("provider_sync_logs").update({
        finished_at:   new Date().toISOString(),
        records_synced: synced,
        issues_found:  saved,
        status:        "success",
      } as never).eq("id", syncLogId);
    }

    return { success: true, synced, issuesFound: saved, issuesByType };

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (syncLogId) {
      await supabaseAdmin.from("provider_sync_logs").update({
        finished_at: new Date().toISOString(), status: "error", error_message: msg,
      } as never).eq("id", syncLogId);
    }
    return { success: false, synced: 0, issuesFound: 0, issuesByType: {}, error: msg };
  }
}

// ─── Digylog reconciliation ───────────────────────────────────────────────────
async function reconcileDigylog(params: {
  storeId?:  string;
  dateFrom?: string;
  dateTo?:   string;
}): Promise<{ synced: number; issues: ReconciliationIssue[] }> {
  const { dateFrom, dateTo } = params;
  const issues: ReconciliationIssue[] = [];
  let synced = 0;

  // Get orders in delivery pipeline
  let q = supabaseAdmin
    .from("orders")
    .select("id, order_number, customer_city, total_amount_mad, delivery_tracking_number, status, delivery_status, delivery_cost_real_mad, is_paid, real_profit_mad")
    .not("status", "in", '("new","refused","no_answer","cancelled","pending")')
    .not("delivery_tracking_number", "is", null);

  if (dateFrom) q = q.gte("sent_to_delivery_at", dateFrom);
  if (dateTo)   q = q.lte("sent_to_delivery_at", dateTo + "T23:59:59");

  const { data: orders } = await q.limit(500);
  type ORow = {
    id: string; order_number: string; customer_city: string;
    total_amount_mad: number; delivery_tracking_number: string;
    status: string; delivery_status: string | null;
    delivery_cost_real_mad: number | null; is_paid: boolean;
  };
  const orderRows = (orders ?? []) as ORow[];

  // Step 1 — Sync statuses from Digylog API
  const client = await createDigylogClientFromDB();
  const trackings = orderRows.map((o) => o.delivery_tracking_number).filter(Boolean);

  if (trackings.length > 0) {
    // Batch sync in groups of 50
    for (let i = 0; i < trackings.length; i += 50) {
      const batch = trackings.slice(i, i + 50);
      try {
        const historics = await client.getHistorics(batch);
        for (const tracking of batch) {
          const events = (historics as Record<string, { "new value"?: string }[]>)[tracking] ?? [];
          if (events.length > 0) {
            const lastEvent = events[events.length - 1];
            const rawStatus = lastEvent["new value"] ?? "";
            if (rawStatus) {
              const mapped = mapDigylogStatus(null, rawStatus);
              if (mapped) {
                await supabaseAdmin.from("orders")
                  .update({ delivery_status: mapped.internal, delivery_external_status: rawStatus } as never)
                  .eq("delivery_tracking_number", tracking);
                synced++;
              }
            }
          }
        }
      } catch (e) {
        console.error("[reconcile] getHistorics error:", e);
      }
    }
  }

  // Step 2 — Detect issues per order
  for (const order of orderRows) {
    const city    = order.customer_city ?? "";
    const expFee  = expectedProviderFee(city);
    const actFee  = order.delivery_cost_real_mad ?? 35;
    const cod     = order.total_amount_mad ?? 0;
    const expNet  = cod - expFee;

    // Issue: Casablanca overcharged
    if (isCasablanca(city) && actFee > 25) {
      issues.push({
        orderId:     order.id,
        tracking:    order.delivery_tracking_number,
        orderNumber: order.order_number,
        city,
        providerSlug: "digylog",
        codAmount:   cod,
        expectedFee: expFee,
        actualFee:   actFee,
        expectedNet: expNet,
        issueType:   "casa_overcharged",
        severity:    "warning",
        description: `Casablanca: frais attendus 25 MAD, facturés ${actFee} MAD. Écart: ${actFee - 25} MAD.`,
      });
    }

    // Issue: shipping fee mismatch (non-Casa)
    if (!isCasablanca(city) && actFee !== 35 && actFee > 0) {
      issues.push({
        orderId:     order.id,
        tracking:    order.delivery_tracking_number,
        orderNumber: order.order_number,
        city,
        providerSlug: "digylog",
        codAmount:   cod,
        expectedFee: expFee,
        actualFee:   actFee,
        issueType:   "shipping_fee_mismatch",
        severity:    "warning",
        description: `Frais livraison incorrects: attendus ${expFee} MAD, facturés ${actFee} MAD.`,
      });
    }

    // Issue: delivered but not paid
    const deliveryStatus = order.delivery_status ?? order.status;
    if (["delivered", "paid"].includes(deliveryStatus) && !order.is_paid) {
      issues.push({
        orderId:     order.id,
        tracking:    order.delivery_tracking_number,
        orderNumber: order.order_number,
        city,
        providerSlug: "digylog",
        codAmount:   cod,
        expectedNet: expNet,
        issueType:   "delivered_not_paid",
        severity:    "error",
        description: `Commande livrée mais non payée dans notre système.`,
      });
    }
  }

  return { synced, issues };
}

// ─── Save issues — deduplicate ────────────────────────────────────────────────
async function saveIssues(issues: ReconciliationIssue[], providerSlug: string): Promise<number> {
  if (!issues.length) return 0;

  // Get existing unresolved issues to avoid duplicates
  const trackings = issues.map((i) => i.tracking).filter(Boolean) as string[];
  const { data: existing } = await supabaseAdmin
    .from("reconciliation_issues")
    .select("tracking, issue_type")
    .eq("provider_slug", providerSlug)
    .eq("is_resolved", false)
    .in("tracking", trackings);

  const existingSet = new Set(
    ((existing ?? []) as { tracking: string; issue_type: string }[])
      .map((e) => `${e.tracking}:${e.issue_type}`)
  );

  const toInsert = issues.filter((i) => {
    const key = `${i.tracking ?? ""}:${i.issueType}`;
    return !existingSet.has(key);
  });

  if (!toInsert.length) return 0;

  await supabaseAdmin.from("reconciliation_issues").insert(
    toInsert.map((i) => ({
      order_id:     i.orderId ?? null,
      tracking:     i.tracking ?? null,
      order_number: i.orderNumber ?? null,
      city:         i.city ?? null,
      provider_slug: i.providerSlug,
      store_name:   i.storeName ?? null,
      invoice_ref:  i.invoiceRef ?? null,
      cod_amount:   i.codAmount ?? null,
      expected_fee: i.expectedFee ?? null,
      actual_fee:   i.actualFee ?? null,
      expected_net: i.expectedNet ?? null,
      actual_paid:  i.actualPaid ?? null,
      issue_type:   i.issueType,
      severity:     i.severity,
      description:  i.description,
    })) as never
  );

  return toInsert.length;
}

// ─── Query reconciliation issues for UI ──────────────────────────────────────
export async function getReconciliationIssues(filters?: {
  providerSlug?: string;
  issueType?:    string;
  isResolved?:   boolean;
  dateFrom?:     string;
  dateTo?:       string;
  search?:       string;
  limit?:        number;
  offset?:       number;
}) {
  let q = supabaseAdmin
    .from("reconciliation_issues")
    .select("*", { count: "exact" })
    .order("detected_at", { ascending: false });

  if (filters?.providerSlug) q = q.eq("provider_slug", filters.providerSlug);
  if (filters?.issueType)    q = q.eq("issue_type", filters.issueType);
  if (filters?.isResolved !== undefined) q = q.eq("is_resolved", filters.isResolved);
  if (filters?.dateFrom)     q = q.gte("detected_at", filters.dateFrom);
  if (filters?.dateTo)       q = q.lte("detected_at", filters.dateTo + "T23:59:59");
  if (filters?.search)       q = q.or(`tracking.ilike.%${filters.search}%,order_number.ilike.%${filters.search}%`);

  q = q.range(filters?.offset ?? 0, (filters?.offset ?? 0) + (filters?.limit ?? 50) - 1);

  const { data, count } = await q;
  return { issues: (data ?? []) as ReconciliationRow[], total: count ?? 0 };
}

export async function resolveIssue(issueId: string, note: string, userId: string) {
  await supabaseAdmin.from("reconciliation_issues").update({
    is_resolved:    true,
    resolved_at:    new Date().toISOString(),
    resolved_by:    userId,
    resolution_note: note,
  } as never).eq("id", issueId);
}

export async function getSummary(providerSlug?: string) {
  let q = supabaseAdmin
    .from("reconciliation_issues")
    .select("issue_type, severity, difference, cod_amount, expected_fee, actual_fee")
    .eq("is_resolved", false);
  if (providerSlug) q = q.eq("provider_slug", providerSlug);

  const { data } = await q;
  type R = { issue_type: string; severity: string; difference: number | null; cod_amount: number | null; expected_fee: number | null; actual_fee: number | null };
  const rows = (data ?? []) as R[];

  const totalDiff       = rows.reduce((s, r) => s + (r.difference ?? 0), 0);
  const overcharged     = rows.filter((r) => r.issue_type === "casa_overcharged").length;
  const missingPayments = rows.filter((r) => r.issue_type === "delivered_not_paid").length;
  const missingReturns  = rows.filter((r) => r.issue_type === "missing_return").length;
  const errors          = rows.filter((r) => r.severity === "error").length;
  const warnings        = rows.filter((r) => r.severity === "warning").length;

  return { total: rows.length, totalDiff, overcharged, missingPayments, missingReturns, errors, warnings };
}

export type ReconciliationRow = {
  id: string;
  order_id: string | null;
  tracking: string | null;
  order_number: string | null;
  city: string | null;
  provider_slug: string;
  store_name: string | null;
  cod_amount: number | null;
  expected_fee: number | null;
  actual_fee: number | null;
  expected_net: number | null;
  actual_paid: number | null;
  difference: number | null;
  issue_type: string;
  severity: string;
  description: string | null;
  is_resolved: boolean;
  detected_at: string;
};
