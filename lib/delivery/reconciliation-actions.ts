"use server";
/**
 * lib/delivery/reconciliation-actions.ts
 * Digylog payment reconciliation — BL, BR, BLFC, BRFC, Factures de paiement.
 *
 * Flow:
 * 1. Admin imports a Digylog invoice (JSON rows parsed from their CSV/portal export).
 * 2. Each row is matched against our orders by tracking_number.
 * 3. Reconcile: compare COD, delivery fee, payout.
 * 4. Detect mismatches: fee overcharge, missing tracking, COD mismatch, etc.
 *
 * Delivery fee rule:
 *   Casablanca → expected cost = 20 MAD
 *   Other cities → expected cost = 35 MAD
 *   Client always pays 35 MAD (never changes).
 *   deliveryMargin = 35 - expectedCost  (+15 for Casa, 0 for others).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { normalizeCity, getExpectedDeliveryCost, DigylogInvoiceRow } from "@/lib/delivery/reconciliation-utils";

const MANAGER = ["super_admin", "admin", "manager", "finance"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
// DigylogInvoiceRow imported from reconciliation-utils

export interface ImportInvoiceParams {
  invoiceNumber:  string;
  invoiceDate:    string;   // YYYY-MM-DD
  documentType:   "BL" | "BR" | "BLFC" | "BRFC" | "FACTURE";
  rows:           DigylogInvoiceRow[];
  totalAmount?:   number;
}

export type ReconciliationStatus =
  | "OK"
  | "MISMATCH"
  | "MISSING"
  | "DUPLICATE"
  | "UNPAID"
  | "FEE_OVERCHARGE"
  | "COD_MISMATCH"
  | "EXTRA";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Import invoice rows into DB
// ─────────────────────────────────────────────────────────────────────────────
export async function importDigylogInvoice(params: ImportInvoiceParams): Promise<{
  success: boolean;
  invoiceId?: string;
  imported?: number;
  markedPaid?: number;
  error?: string;
}> {
  await requireRole([...MANAGER]);
  const { invoiceNumber, invoiceDate, documentType, rows, totalAmount } = params;

  if (!rows.length) return { success: false, error: "Aucune ligne à importer." };

  // Get Digylog company id
  const { data: dcData } = await supabaseAdmin
    .from("delivery_companies").select("id").eq("slug", "digylog").maybeSingle();
  const companyId = (dcData as { id: string } | null)?.id ?? null;

  // Calculate total if not provided
  const total = totalAmount ?? rows.reduce((s, r) => s + (r.amount_paid ?? 0), 0);

  // Upsert invoice (idempotent by invoice_number)
  const { data: existing } = await supabaseAdmin
    .from("delivery_invoices")
    .select("id")
    .eq("invoice_number", invoiceNumber)
    .maybeSingle();

  let invoiceId: string;

  if (existing) {
    invoiceId = (existing as { id: string }).id;
    // Delete old items to re-import fresh
    await supabaseAdmin.from("delivery_invoice_items").delete().eq("invoice_id", invoiceId);
    await supabaseAdmin.from("delivery_invoices").update({
      invoice_date:     invoiceDate,
      total_amount_mad: total,
      status:           "imported",
      raw_payload:      { documentType, rowCount: rows.length } as never,
    } as never).eq("id", invoiceId);
  } else {
    const { data: created, error } = await supabaseAdmin
      .from("delivery_invoices")
      .insert({
        delivery_company_id: companyId,
        invoice_number:      invoiceNumber,
        invoice_date:        invoiceDate,
        total_amount_mad:    total,
        paid_amount_mad:     0,
        status:              "imported",
        raw_payload:         { documentType, rowCount: rows.length } as never,
      } as never)
      .select("id").single();

    if (error || !created) {
      return { success: false, error: error?.message ?? "Erreur création facture." };
    }
    invoiceId = (created as { id: string }).id;
  }

  // Detect duplicate trackings in this import
  const seenTrackings = new Map<string, number>();
  for (const row of rows) {
    seenTrackings.set(row.tracking_number, (seenTrackings.get(row.tracking_number) ?? 0) + 1);
  }

  // Match each row to our orders
  const trackings = [...new Set(rows.map((r) => r.tracking_number))];
  const { data: ordersData } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, delivery_tracking_number, total_amount_mad, customer_city, status")
    .in("delivery_tracking_number", trackings);

  type ORow = {
    id: string; order_number: string; delivery_tracking_number: string;
    total_amount_mad: number; customer_city: string; status: string;
  };
  const orderMap = new Map<string, ORow>();
  for (const o of (ordersData ?? []) as ORow[]) {
    orderMap.set(o.delivery_tracking_number.toUpperCase(), o);
  }

  // Build invoice items
  const items = rows.map((row) => {
    const trackingKey = row.tracking_number.toUpperCase();
    const order = orderMap.get(trackingKey);
    const isDuplicate = (seenTrackings.get(row.tracking_number) ?? 1) > 1;

    return {
      invoice_id:      invoiceId,
      order_id:        order?.id ?? null,
      tracking_number: row.tracking_number,
      cod_amount_mad:  row.cod_amount,
      delivery_fee_mad:row.delivery_fee,
      return_fee_mad:  row.return_fee ?? 0,
      amount_paid_mad: row.amount_paid,
      invoice_status:  row.invoice_status,
      matched_status:  isDuplicate ? "mismatched" : order ? "pending" : "pending",
      mismatch_reason: isDuplicate ? "Tracking en double dans la facture" : null,
      raw_payload:     { bl: row.bl_number, orderNum: row.order_number, city: row.city } as never,
    };
  });

  // Insert in batches of 50
  for (let i = 0; i < items.length; i += 50) {
    await supabaseAdmin.from("delivery_invoice_items").insert(items.slice(i, i + 50) as never);
  }

  // ── Auto-mark orders as paid when Cash Status = "Versés" ──
  // ATTENTION: "en cours de versement" contient aussi la sous-chaîne "vers" —
  // il faut exclure explicitement ce statut (pas encore réellement transféré).
  const paidDate = params.invoiceDate ?? new Date().toISOString().slice(0, 10);
  let markedPaid = 0;
  for (const row of rows) {
    const status = (row.invoice_status ?? "").toLowerCase();
    const isReallyPaid = status.includes("vers") && !status.includes("en cours");
    if (!isReallyPaid) continue; // only "Versés" — pas "En cours de versement"

    const trackingKey = row.tracking_number.toUpperCase();
    const order = orderMap.get(trackingKey);
    if (!order) continue;

    await supabaseAdmin.from("orders").update({
      is_paid:        true,
      paid_at:        new Date(paidDate).toISOString(),
      payment_status: "paid",
      status:         "paid",
    } as never).eq("id", order.id);
    markedPaid++;
  }

  revalidatePath("/admin/delivery/invoices");
  revalidatePath("/admin");
  return { success: true, invoiceId, imported: items.length, markedPaid };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Reconcile invoice — compare each row vs our orders
// ─────────────────────────────────────────────────────────────────────────────
export async function reconcileInvoice(invoiceId: string): Promise<{
  success: boolean;
  matched?: number;
  missing?: number;
  extra?: number;
  feeOvercharge?: number;
  codMismatch?: number;
  diff?: number;
  error?: string;
}> {
  await requireRole([...MANAGER]);

  // Load invoice items
  const { data: itemsData } = await supabaseAdmin
    .from("delivery_invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId);

  type Item = {
    id: string; tracking_number: string; order_id: string | null;
    cod_amount_mad: number; delivery_fee_mad: number; return_fee_mad: number;
    amount_paid_mad: number; invoice_status: string; raw_payload: Record<string, unknown>;
  };
  const items = (itemsData ?? []) as Item[];
  if (!items.length) return { success: false, error: "Aucune ligne dans cette facture." };

  // Load matching orders
  const trackings = items.map((i) => i.tracking_number);
  const { data: ordersData } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, delivery_tracking_number, total_amount_mad, customer_city, status, cogs_total")
    .in("delivery_tracking_number", trackings);

  type ORow = {
    id: string; order_number: string; delivery_tracking_number: string;
    total_amount_mad: number; customer_city: string; status: string; cogs_total: number;
  };
  const orderMap = new Map<string, ORow>();
  for (const o of (ordersData ?? []) as ORow[]) {
    orderMap.set(o.delivery_tracking_number.toUpperCase(), o);
  }

  let matched = 0, missing = 0, extra = 0, feeOvercharge = 0, codMismatch = 0;
  let totalExpectedPayout = 0, totalActualPayout = 0;

  // Seen trackings to detect duplicates
  const seenInInvoice = new Map<string, number>();
  for (const item of items) {
    const k = item.tracking_number.toUpperCase();
    seenInInvoice.set(k, (seenInInvoice.get(k) ?? 0) + 1);
  }

  for (const item of items) {
    const trackingKey = item.tracking_number.toUpperCase();
    const order = orderMap.get(trackingKey);
    const city = order?.customer_city ?? (item.raw_payload?.city as string | undefined) ?? "";
    const normalizedCity = normalizeCity(city);
    const expectedDeliveryCost = getExpectedDeliveryCost(city);
    const digylogFee = item.delivery_fee_mad ?? 0;
    const feeDiff = digylogFee - expectedDeliveryCost;
    const isDuplicate = (seenInInvoice.get(trackingKey) ?? 1) > 1;

    let status: ReconciliationStatus = "MISSING";
    let mismatchReason: string | null = null;

    if (isDuplicate) {
      status = "DUPLICATE";
      mismatchReason = `Tracking en double dans la facture`;
    } else if (!order) {
      // Tracking in Digylog invoice but not in our system
      status = "EXTRA";
      extra++;
      mismatchReason = "Tracking présent chez Digylog mais absent de notre système";
    } else {
      const codSystem  = order.total_amount_mad;
      const codDigylog = item.cod_amount_mad;
      const codDiff    = Math.abs(codSystem - codDigylog);

      // Expected payout = COD - delivery cost
      const expectedPayout = codSystem - expectedDeliveryCost;
      // Actual payout from invoice
      const actualPayout   = item.amount_paid_mad;
      const payoutDiff     = actualPayout - expectedPayout;

      totalExpectedPayout += expectedPayout;
      totalActualPayout   += actualPayout;

      const reasons: string[] = [];

      if (codDiff > 0.5) {
        codMismatch++;
        reasons.push(`COD système ${codSystem} ≠ Digylog ${codDigylog} (écart ${codDiff.toFixed(2)} MAD)`);
      }

      if (feeDiff > 0.5) {
        feeOvercharge++;
        reasons.push(`Frais surcharge ${feeDiff.toFixed(2)} MAD (attendu ${expectedDeliveryCost} MAD, facturé ${digylogFee} MAD)`);
        status = "FEE_OVERCHARGE";
      } else if (feeDiff < -0.5) {
        reasons.push(`Frais sous-facturés ${Math.abs(feeDiff).toFixed(2)} MAD`);
      }

      if (reasons.length === 0 && Math.abs(payoutDiff) < 1) {
        status = "OK";
        matched++;
      } else if (status !== "FEE_OVERCHARGE") {
        status = reasons.some((r) => r.includes("COD")) ? "COD_MISMATCH" : "MISMATCH";
        missing++;
      }

      mismatchReason = reasons.join(" | ") || null;

      console.log("DIGYLOG RECONCILIATION DEBUG", {
        tracking:            item.tracking_number,
        city,
        normalizedCity,
        codSystem,
        codDigylog,
        expectedDeliveryCost,
        digylogFee,
        feeDifference:       feeDiff,
        expectedPayout,
        actualPayout,
        payoutDiff,
        status,
      });
    }

    // Update item
    await supabaseAdmin.from("delivery_invoice_items").update({
      order_id:       order?.id ?? null,
      matched_status: status === "OK" ? "matched" : status === "EXTRA" ? "pending" : "mismatched",
      mismatch_reason: mismatchReason,
    } as never).eq("id", item.id);
  }

  const totalDiff = totalActualPayout - totalExpectedPayout;

  // Save reconciliation log
  await supabaseAdmin.from("delivery_reconciliation_logs").insert({
    invoice_id:          invoiceId,
    total_orders:        items.length,
    matched_orders:      matched,
    missing_orders:      missing + extra,
    amount_expected_mad: totalExpectedPayout,
    amount_paid_mad:     totalActualPayout,
    difference_mad:      totalDiff,
    status:              missing + extra + feeOvercharge + codMismatch === 0 ? "ok" : "discrepancy",
    details:             { extra, feeOvercharge, codMismatch } as never,
  } as never);

  // Update invoice status
  const invoiceStatus = missing + extra + feeOvercharge + codMismatch === 0 ? "reconciled" : "disputed";
  await supabaseAdmin.from("delivery_invoices").update({
    status: invoiceStatus,
    paid_amount_mad: totalActualPayout,
  } as never).eq("id", invoiceId);

  revalidatePath(`/admin/delivery/invoices/${invoiceId}`);
  revalidatePath("/admin/delivery/invoices");

  return {
    success:      true,
    matched,
    missing,
    extra,
    feeOvercharge,
    codMismatch,
    diff:         totalDiff,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Get reconciliation dashboard data for a date range
// ─────────────────────────────────────────────────────────────────────────────
export async function getReconciliationDashboard(params: {
  from: string; to: string;
}): Promise<{
  invoices: {
    id: string; invoice_number: string; invoice_date: string;
    document_type: string; total_orders: number;
    total_cod: number; total_expected_fees: number; total_digylog_fees: number;
    total_expected_payout: number; total_actual_payout: number;
    total_difference: number; fee_overcharge: number;
    matched: number; mismatched: number; status: string;
  }[];
  summary: {
    totalInvoices: number; totalOrders: number;
    totalCod: number; totalExpectedPayout: number;
    totalActualPayout: number; totalDiff: number;
    totalFeeOvercharge: number;
  };
}> {
  await requireRole([...MANAGER]);

  const { data: invoicesData } = await supabaseAdmin
    .from("delivery_invoices")
    .select(`
      id, invoice_number, invoice_date, status, total_amount_mad, paid_amount_mad,
      raw_payload,
      delivery_invoice_items (
        id, cod_amount_mad, delivery_fee_mad, amount_paid_mad,
        matched_status, mismatch_reason, raw_payload,
        orders ( customer_city, total_amount_mad )
      ),
      delivery_reconciliation_logs (
        matched_orders, missing_orders, difference_mad, details
      )
    `)
    .gte("invoice_date", params.from)
    .lte("invoice_date", params.to)
    .order("invoice_date", { ascending: false });

  type InvItem = {
    id: string; cod_amount_mad: number; delivery_fee_mad: number;
    amount_paid_mad: number; matched_status: string; mismatch_reason: string | null;
    raw_payload: Record<string, unknown>;
    orders: { customer_city: string; total_amount_mad: number } | null;
  };
  type RecoLog = { matched_orders: number; missing_orders: number; difference_mad: number; details: Record<string, number> };
  type InvRow = {
    id: string; invoice_number: string; invoice_date: string; status: string;
    total_amount_mad: number; paid_amount_mad: number; raw_payload: Record<string, unknown>;
    delivery_invoice_items: InvItem[];
    delivery_reconciliation_logs: RecoLog[];
  };

  const invoices = (invoicesData ?? []) as InvRow[];
  const result = [];

  let sumOrders = 0, sumCod = 0, sumExpPayout = 0, sumActPayout = 0, sumDiff = 0, sumFeeOvercharge = 0;

  for (const inv of invoices) {
    const items = inv.delivery_invoice_items ?? [];
    const reco  = inv.delivery_reconciliation_logs?.[0];

    let totalCod = 0, totalExpFees = 0, totalDigFees = 0, totalExpPayout = 0, totalActPayout = 0, feeOvercharge = 0;
    let matched = 0, mismatched = 0;

    for (const item of items) {
      const city = item.orders?.customer_city ?? (item.raw_payload?.city as string | undefined) ?? "";
      const expectedFee = getExpectedDeliveryCost(city);
      const digylogFee  = item.delivery_fee_mad ?? 0;
      const cod         = item.cod_amount_mad ?? 0;
      const actPayout   = item.amount_paid_mad ?? 0;
      const expPayout   = cod - expectedFee;

      totalCod        += cod;
      totalExpFees    += expectedFee;
      totalDigFees    += digylogFee;
      totalExpPayout  += expPayout;
      totalActPayout  += actPayout;

      if (digylogFee > expectedFee + 0.5) feeOvercharge += digylogFee - expectedFee;
      if (item.matched_status === "matched") matched++;
      else if (item.matched_status === "mismatched") mismatched++;
    }

    const diff = totalActPayout - totalExpPayout;

    result.push({
      id:                    inv.id,
      invoice_number:        inv.invoice_number,
      invoice_date:          inv.invoice_date,
      document_type:         (inv.raw_payload?.documentType as string) ?? "FACTURE",
      total_orders:          items.length,
      total_cod:             totalCod,
      total_expected_fees:   totalExpFees,
      total_digylog_fees:    totalDigFees,
      total_expected_payout: totalExpPayout,
      total_actual_payout:   totalActPayout,
      total_difference:      diff,
      fee_overcharge:        feeOvercharge,
      matched,
      mismatched,
      status:                inv.status,
    });

    sumOrders       += items.length;
    sumCod          += totalCod;
    sumExpPayout    += totalExpPayout;
    sumActPayout    += totalActPayout;
    sumDiff         += diff;
    sumFeeOvercharge += feeOvercharge;
  }

  return {
    invoices: result,
    summary: {
      totalInvoices:        invoices.length,
      totalOrders:          sumOrders,
      totalCod:             sumCod,
      totalExpectedPayout:  sumExpPayout,
      totalActualPayout:    sumActPayout,
      totalDiff:            sumDiff,
      totalFeeOvercharge:   sumFeeOvercharge,
    },
  };
}
