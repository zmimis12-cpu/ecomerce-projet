"use server";
/**
 * lib/delivery/digylog/document-service.ts
 *
 * Generic Digylog document system — Phase 1 (manual import).
 * API-ready: same functions work whether data comes from CSV or future Digylog API.
 *
 * Services:
 *   importDigylogDocument()     — import doc + lines, match to orders
 *   reconcileDigylogDocument()  — compare lines vs our orders, detect mismatches
 *   syncDigylogStatuses()       — manual status sync using historics endpoint
 *   matchDigylogLinesToOrders() — reusable matcher, called by import + reconcile
 *   parseDocumentCsv()          — parse CSV/pasted table into raw lines
 */
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { createDigylogClientFromDB } from "@/lib/delivery/digylog/client";
import { mapDigylogStatus } from "@/lib/delivery/digylog/status-map";
import { normalizeCity, getExpectedDeliveryCost } from "@/lib/delivery/reconciliation-utils";
import { parseDocumentCsv, type RawDocumentLine } from "@/lib/delivery/digylog/document-utils";


const MANAGER = ["super_admin", "admin", "manager", "finance"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type DigylogDocType =
  | "BL" | "BR" | "RAMASSAGE" | "BLFC" | "BRFC"
  | "PAYMENT_INVOICE" | "REFUND" | "OTHER";

// RawDocumentLine imported from document-utils

export interface ImportDocumentParams {
  documentType:   DigylogDocType;
  documentNumber: string;
  documentDate?:  string;           // YYYY-MM-DD
  lines:          RawDocumentLine[];
  notes?:         string;
  source?:        "manual_import" | "api_sync" | "webhook";
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Match lines to orders — reusable
// ─────────────────────────────────────────────────────────────────────────────
export async function matchDigylogLinesToOrders(
  lines: RawDocumentLine[]
): Promise<{
  line:      RawDocumentLine;
  orderId:   string | null;
  orderNum:  string | null;
  orderCity: string | null;
  orderCod:  number | null;
  matched:   boolean;
}[]> {
  const trackings = lines
    .map((l) => l.tracking_number?.trim().toUpperCase())
    .filter(Boolean) as string[];

  if (!trackings.length) return lines.map((l) => ({ line: l, orderId: null, orderNum: null, orderCity: null, orderCod: null, matched: false }));

  const { data } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, delivery_tracking_number, customer_city, total_amount_mad")
    .in("delivery_tracking_number", trackings);

  type ORow = { id: string; order_number: string; delivery_tracking_number: string; customer_city: string; total_amount_mad: number };
  const orderMap = new Map<string, ORow>();
  for (const o of (data ?? []) as ORow[]) {
    orderMap.set(o.delivery_tracking_number.toUpperCase(), o);
  }

  return lines.map((l) => {
    const key   = l.tracking_number?.trim().toUpperCase() ?? "";
    const order = orderMap.get(key) ?? null;
    return {
      line:      l,
      orderId:   order?.id ?? null,
      orderNum:  order?.order_number ?? null,
      orderCity: order?.customer_city ?? null,
      orderCod:  order?.total_amount_mad ?? null,
      matched:   !!order,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Import document — works for CSV, API payload, or any source
// ─────────────────────────────────────────────────────────────────────────────
export async function importDigylogDocument(params: ImportDocumentParams): Promise<{
  success:    boolean;
  documentId?: string;
  imported?:  number;
  matched?:   number;
  error?:     string;
}> {
  const session = await requireRole([...MANAGER]);
  const { documentType, documentNumber, documentDate, lines, notes, source = "manual_import" } = params;

  if (!lines.length) return { success: false, error: "Aucune ligne à importer." };

  // Upsert document (idempotent)
  const { data: existingDoc } = await supabaseAdmin
    .from("digylog_documents")
    .select("id")
    .eq("document_number", documentNumber)
    .eq("document_type", documentType)
    .maybeSingle();

  let documentId: string;

  // Compute totals
  const totalCod     = lines.reduce((s, l) => s + (l.cod_amount ?? 0), 0);
  const totalFees    = lines.reduce((s, l) => s + (l.delivery_fee ?? 0) + (l.return_fee ?? 0), 0);
  const totalPayout  = lines.reduce((s, l) => s + (l.payout_amount ?? 0), 0);

  if (existingDoc) {
    documentId = (existingDoc as { id: string }).id;
    await supabaseAdmin.from("digylog_document_lines").delete().eq("document_id", documentId);
    await supabaseAdmin.from("digylog_documents").update({
      document_date:    documentDate ?? null,
      total_lines:      lines.length,
      total_cod_mad:    totalCod,
      total_fees_mad:   totalFees,
      total_payout_mad: totalPayout,
      status:           "imported",
      notes:            notes ?? null,
      synced_at:        new Date().toISOString(),
    } as never).eq("id", documentId);
  } else {
    const { data: created, error } = await supabaseAdmin
      .from("digylog_documents")
      .insert({
        document_type:    documentType,
        document_number:  documentNumber,
        document_date:    documentDate ?? null,
        status:           "imported",
        total_lines:      lines.length,
        total_cod_mad:    totalCod,
        total_fees_mad:   totalFees,
        total_payout_mad: totalPayout,
        source,
        notes:            notes ?? null,
        imported_by:      session.authId,
        synced_at:        new Date().toISOString(),
      } as never)
      .select("id").single();

    if (error || !created) return { success: false, error: error?.message ?? "Erreur création document." };
    documentId = (created as { id: string }).id;
  }

  // Match lines to orders
  const matched = await matchDigylogLinesToOrders(lines);
  const matchedCount = matched.filter((m) => m.matched).length;

  // Insert lines in batches of 100
  const lineRows = matched.map((m, i) => ({
    document_id:      documentId,
    line_number:      i + 1,
    tracking_number:  m.line.tracking_number?.trim().toUpperCase() ?? null,
    order_id:         m.orderId,
    cod_amount_mad:   m.line.cod_amount ?? 0,
    delivery_fee_mad: m.line.delivery_fee ?? 0,
    return_fee_mad:   m.line.return_fee ?? 0,
    payout_amount_mad:m.line.payout_amount ?? 0,
    city:             m.line.city ?? null,
    status:           m.line.status ?? null,
    matched:          m.matched,
    match_status:     m.matched ? "matched" : "unmatched",
    raw_line_payload: m.line.raw_line_payload ?? {},
  }));

  for (let i = 0; i < lineRows.length; i += 100) {
    await supabaseAdmin.from("digylog_document_lines").insert(lineRows.slice(i, i + 100) as never);
  }

  // Update matched/unmatched counts
  await supabaseAdmin.from("digylog_documents").update({
    matched_lines:   matchedCount,
    unmatched_lines: lines.length - matchedCount,
  } as never).eq("id", documentId);

  // If BR — also sync to digylog_return_batches for scanner validation
  if (documentType === "BR") {
    const trackings = matched.filter((m) => m.matched || m.line.tracking_number)
      .map((m) => m.line.tracking_number?.trim().toUpperCase())
      .filter(Boolean) as string[];
    await supabaseAdmin.from("digylog_return_batches").upsert({
      br_number:        documentNumber,
      tracking_numbers: trackings,
      imported_by:      session.authId,
      status:           "active",
      notes:            notes ?? null,
    } as never, { onConflict: "br_number" });
  }

  revalidatePath("/admin/digylog/documents");
  return { success: true, documentId, imported: lines.length, matched: matchedCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Reconcile document — detect all mismatches
// ─────────────────────────────────────────────────────────────────────────────
export async function reconcileDigylogDocument(documentId: string): Promise<{
  success:        boolean;
  matched?:       number;
  mismatched?:    number;
  feeOvercharge?: number;
  codMismatch?:   number;
  missing?:       number;
  totalDiff?:     number;
  error?:         string;
}> {
  await requireRole([...MANAGER]);

  const { data: doc } = await supabaseAdmin
    .from("digylog_documents").select("id,document_type,document_number")
    .eq("id", documentId).maybeSingle();
  if (!doc) return { success: false, error: "Document introuvable." };

  const { data: linesData } = await supabaseAdmin
    .from("digylog_document_lines")
    .select("*, orders(customer_city,total_amount_mad,status)")
    .eq("document_id", documentId);

  type Line = {
    id: string; tracking_number: string; order_id: string | null;
    cod_amount_mad: number; delivery_fee_mad: number; payout_amount_mad: number;
    orders: { customer_city: string; total_amount_mad: number; status: string } | null;
  };
  const lines = (linesData ?? []) as Line[];

  let matched = 0, mismatched = 0, missing = 0, feeOvercharge = 0, codMismatch = 0;
  let totalExpPayout = 0, totalActPayout = 0;

  for (const line of lines) {
    if (!line.order_id || !line.orders) { missing++; continue; }

    const city         = line.orders.customer_city ?? "";
    const expectedFee  = getExpectedDeliveryCost(city);
    const digylogFee   = line.delivery_fee_mad ?? 0;
    const codSystem    = line.orders.total_amount_mad ?? 0;
    const codDigylog   = line.cod_amount_mad ?? 0;
    const actPayout    = line.payout_amount_mad ?? 0;
    const expPayout    = codSystem - expectedFee;
    const feeDiff      = digylogFee - expectedFee;
    const codDiff      = Math.abs(codSystem - codDigylog);

    const reasons: string[] = [];
    if (feeDiff > 0.5)   { reasons.push(`Surcharge frais ${feeDiff.toFixed(2)} MAD`); feeOvercharge += feeDiff; }
    if (codDiff > 0.5)   { reasons.push(`COD système ${codSystem} ≠ Digylog ${codDigylog}`); codMismatch++; }

    totalExpPayout += expPayout;
    totalActPayout += actPayout;

    const isOk = reasons.length === 0 && Math.abs(actPayout - expPayout) < 1;
    if (isOk) { matched++; } else { mismatched++; }

    await supabaseAdmin.from("digylog_document_lines").update({
      matched:          !!line.order_id,
      match_status:     isOk ? "matched" : "mismatch",
      mismatch_reasons: reasons.length ? reasons : null,
    } as never).eq("id", line.id);
  }

  const totalDiff = totalActPayout - totalExpPayout;
  const finalStatus = mismatched + missing + feeOvercharge > 0 ? "disputed" : "reconciled";
  await supabaseAdmin.from("digylog_documents").update({
    status:          finalStatus,
    matched_lines:   matched,
    unmatched_lines: missing,
  } as never).eq("id", documentId);

  revalidatePath(`/admin/digylog/documents/${documentId}`);
  revalidatePath("/admin/digylog/documents");

  return { success: true, matched, mismatched, feeOvercharge, codMismatch, missing, totalDiff };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Sync Digylog statuses — manual trigger
// ─────────────────────────────────────────────────────────────────────────────
export async function syncDigylogStatuses(): Promise<{
  success:    boolean;
  checked?:   number;
  updated?:   number;
  unchanged?: number;
  failed?:    number;
  syncId?:    string;
  error?:     string;
}> {
  const session = await requireRole([...MANAGER]);

  // Get all active orders with tracking
  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, delivery_tracking_number, delivery_status, status")
    .not("delivery_tracking_number", "is", null)
    .in("status", ["sent_to_delivery", "in_transit", "confirmed"])
    .limit(200);

  type ORow = { id: string; order_number: string; delivery_tracking_number: string; delivery_status: string | null; status: string };
  const rows = (orders ?? []) as ORow[];

  if (!rows.length) return { success: true, checked: 0, updated: 0, unchanged: 0, failed: 0 };

  // Create sync log
  const { data: syncLog } = await supabaseAdmin.from("digylog_status_syncs").insert({
    triggered_by:    session.authId,
    source:          "manual",
    total_checked:   rows.length,
  } as never).select("id").single();
  const syncId = (syncLog as { id: string } | null)?.id;

  const client = await createDigylogClientFromDB();
  const trackings = rows.map((r) => r.delivery_tracking_number);

  // Fetch historics in batches of 50
  let updated = 0, unchanged = 0, failed = 0;
  const details: Record<string, unknown>[] = [];

  for (let i = 0; i < trackings.length; i += 50) {
    const batch    = trackings.slice(i, i + 50);
    const historics = await client.getHistorics(batch);

    for (const order of rows.filter((r) => batch.includes(r.delivery_tracking_number))) {
      const t       = order.delivery_tracking_number;
      const history = historics[t];

      if (!history || !Array.isArray(history) || !history.length) {
        failed++;
        continue;
      }

      // Get latest status
      const latest = history[history.length - 1] as unknown as Record<string, unknown>;
      const idStatus = Number(latest.idStatus ?? latest.id_status ?? 0);
      const extStatus = String(latest.status ?? latest.libelle ?? "");

      if (!idStatus) { failed++; continue; }

      const mapped = mapDigylogStatus(idStatus, extStatus);
      const oldStatus = order.delivery_status ?? order.status;

      console.log("DIGYLOG STATUS SYNC CHECK", {
        tracking:          t,
        oldStatus,
        newStatus:         extStatus,
        normalizedStatus:  mapped.internal,
        source:            "manual_sync",
      });

      if (mapped.internal === oldStatus) { unchanged++; continue; }

      // Update order
      const orderUpdate: Record<string, unknown> = {
        delivery_status:            mapped.internal,
        shipment_status:            mapped.internal,
        shipment_status_updated_at: new Date().toISOString(),
        status:                     mapped.orderStatus,
        last_webhook_payload:       latest,
      };
      if (mapped.isPaid)      { orderUpdate.is_paid = true; orderUpdate.paid_at = latest.updatedAt ?? new Date().toISOString(); }
      if (mapped.isDelivered && !mapped.isPaid) orderUpdate.delivered_at = latest.updatedAt ?? new Date().toISOString();
      if (mapped.isReturned)  orderUpdate.returned_at = latest.updatedAt ?? new Date().toISOString();

      await supabaseAdmin.from("orders").update(orderUpdate as never).eq("id", order.id);

      // Insert shipment event
      await supabaseAdmin.from("delivery_status_events").insert({
        order_id:           order.id,
        tracking_number:    t,
        external_status:    extStatus,
        external_status_id: idStatus,
        internal_status:    mapped.internal,
        normalized_status:  mapped.internal,
        event_time:         String(latest.updatedAt ?? new Date().toISOString()),
        raw_payload:        latest,
        event_hash:         `manual_sync_${t}_${idStatus}_${Date.now()}`,
      } as never).then(() => {}, () => {});

      updated++;
      details.push({ tracking: t, oldStatus, newStatus: mapped.internal });
    }
  }

  // Update sync log
  if (syncId) {
    await supabaseAdmin.from("digylog_status_syncs").update({
      total_updated:   updated,
      total_unchanged: unchanged,
      total_failed:    failed,
      details:         details as never,
      finished_at:     new Date().toISOString(),
    } as never).eq("id", syncId);
  }

  revalidatePath("/admin/digylog/documents");
  revalidatePath("/admin/delivery");

  return { success: true, checked: rows.length, updated, unchanged, failed, syncId };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Parse CSV/pasted table into RawDocumentLine[]
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 6. Get documents list
// ─────────────────────────────────────────────────────────────────────────────
export async function getDigylogDocuments(filters?: { type?: DigylogDocType; status?: string }) {
  await requireRole([...MANAGER]);
  let q = supabaseAdmin
    .from("digylog_documents")
    .select("id,document_type,document_number,document_date,status,total_lines,matched_lines,unmatched_lines,total_cod_mad,total_payout_mad,source,created_at")
    .order("created_at", { ascending: false });

  if (filters?.type)   q = q.eq("document_type", filters.type);
  if (filters?.status) q = q.eq("status", filters.status);

  const { data } = await q.limit(100);
  return (data ?? []) as {
    id: string; document_type: string; document_number: string; document_date: string | null;
    status: string; total_lines: number; matched_lines: number; unmatched_lines: number;
    total_cod_mad: number; total_payout_mad: number; source: string; created_at: string;
  }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Get document detail with lines
// ─────────────────────────────────────────────────────────────────────────────
export async function getDigylogDocumentDetail(documentId: string) {
  await requireRole([...MANAGER]);

  const { data: doc } = await supabaseAdmin.from("digylog_documents").select("*").eq("id", documentId).single();
  if (!doc) return null;

  const { data: lines } = await supabaseAdmin
    .from("digylog_document_lines")
    .select("*, orders(order_number,customer_name,customer_city,total_amount_mad,status)")
    .eq("document_id", documentId)
    .order("line_number");

  return { doc: doc as Record<string, unknown>, lines: (lines ?? []) as Record<string, unknown>[] };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Scan tracking against BR/RAMASSAGE document
// ─────────────────────────────────────────────────────────────────────────────
export async function scanDocumentLine(
  documentId: string,
  trackingNumber: string
): Promise<{ ok: boolean; status: "scanned" | "unexpected" | "duplicate" | "error"; msg: string }> {
  const session = await requireRole([...MANAGER]);
  const t = trackingNumber.trim().toUpperCase();

  // Find the line in this document
  const { data: line } = await supabaseAdmin
    .from("digylog_document_lines")
    .select("id, tracking_number, scan_status")
    .eq("document_id", documentId)
    .eq("tracking_number", t)
    .maybeSingle();

  const l = line as { id: string; tracking_number: string; scan_status: string } | null;

  if (!l) {
    // Mark as unexpected scan
    await supabaseAdmin.from("digylog_document_lines").insert({
      document_id:     documentId,
      tracking_number: t,
      matched:         false,
      match_status:    "unmatched",
      scan_status:     "unexpected",
      scanned_at:      new Date().toISOString(),
      scanned_by:      session.authId,
    } as never);
    return { ok: false, status: "unexpected", msg: `🚫 ${t} — Absent du document. Colis inattendu!` };
  }

  if (l.scan_status === "scanned") {
    return { ok: false, status: "duplicate", msg: `⚠ ${t} — Déjà scanné.` };
  }

  await supabaseAdmin.from("digylog_document_lines").update({
    scan_status: "scanned",
    scanned_at:  new Date().toISOString(),
    scanned_by:  session.authId,
  } as never).eq("id", l.id);

  // Update document status to scanning
  await supabaseAdmin.from("digylog_documents")
    .update({ status: "scanning" } as never)
    .eq("id", documentId)
    .eq("status", "imported");

  return { ok: true, status: "scanned", msg: `✓ ${t} — Scanné avec succès.` };
}
