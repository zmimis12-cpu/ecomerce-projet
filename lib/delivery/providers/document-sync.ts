/**
 * lib/delivery/providers/document-sync.ts
 *
 * Automatic provider document sync.
 * Architecture: automatic-first, manual fallback only when API missing.
 *
 * Digylog API availability:
 *   ✅ syncStatuses()   — GET /historics
 *   ✅ syncBL()         — GET /bl/:id/pdf (PDF only, no line data via API)
 *   ❌ syncInvoices()   — API missing → manual CSV fallback
 *   ❌ syncRefunds()    — API missing → manual fallback
 *   ❌ syncBR/BLFC/Ramassage — API missing → manual import
 */

"use server";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createDigylogClientFromDB } from "@/lib/delivery/digylog/client";
import { mapDigylogStatus } from "@/lib/delivery/digylog/status-map";
import { runReconciliation } from "@/lib/finance/reconciliation-engine";
import { revalidatePath } from "next/cache";

const MANAGER = ["super_admin", "admin", "manager"] as const;

export type DocSyncResult = {
  available: boolean;
  success:   boolean;
  synced:    number;
  message:   string;
};

export type FullSyncResult = {
  storeName:    string;
  providerSlug: string;
  statuses:     DocSyncResult;
  bl:           DocSyncResult;
  invoices:     DocSyncResult;
  refunds:      DocSyncResult;
  br:           DocSyncResult;
  reconciled:   boolean;
  totalSynced:  number;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY — called from store card
// ─────────────────────────────────────────────────────────────────────────────
export async function syncProviderDocuments(storeId: string): Promise<FullSyncResult> {
  await requireRole([...MANAGER]);

  const { data: store } = await supabaseAdmin
    .from("delivery_stores")
    .select("id, name, delivery_companies(slug)")
    .eq("id", storeId)
    .maybeSingle();

  type Store = { id: string; name: string; delivery_companies: { slug: string } | null };
  const s = store as Store | null;

  if (!s) {
    const fail: DocSyncResult = { available: false, success: false, synced: 0, message: "Store introuvable" };
    return { storeName: "", providerSlug: "", statuses: fail, bl: fail, invoices: fail, refunds: fail, br: fail, reconciled: false, totalSynced: 0 };
  }

  const providerSlug = s.delivery_companies?.slug ?? "digylog";

  switch (providerSlug) {
    case "digylog":
      return syncDigylog(storeId, s.name);
    default:
      return notImplemented(s.name, providerSlug);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DIGYLOG SYNC
// ─────────────────────────────────────────────────────────────────────────────
async function syncDigylog(storeId: string, storeName: string): Promise<FullSyncResult> {

  // Run all available syncs in parallel
  const [statusRes, blRes] = await Promise.all([
    syncDigylogStatuses(storeId),
    syncDigylogBL(storeId, storeName),
  ]);

  // Manual-only fallback info
  const invoicesRes: DocSyncResult = {
    available: false, success: false, synced: 0,
    message: "Digylog ne fournit pas les factures via API. Importez le CSV manuellement.",
  };
  const refundsRes: DocSyncResult = {
    available: false, success: false, synced: 0,
    message: "Remboursements non disponibles via API Digylog. Vérification manuelle requise.",
  };
  const brRes: DocSyncResult = {
    available: false, success: false, synced: 0,
    message: "BR/BLFC non disponibles via API. Importez le document manuellement.",
  };

  // After sync → reconcile automatically
  let reconciled = false;
  try {
    await runReconciliation({ providerSlug: "digylog", storeId });
    reconciled = true;
  } catch (e) {
    console.error("[doc-sync] reconciliation error:", e);
  }

  revalidatePath("/admin/delivery/documents");
  revalidatePath("/admin/finance/reconciliation");

  const totalSynced = statusRes.synced + blRes.synced;

  return {
    storeName,
    providerSlug: "digylog",
    statuses:   statusRes,
    bl:         blRes,
    invoices:   invoicesRes,
    refunds:    refundsRes,
    br:         brRes,
    reconciled,
    totalSynced,
  };
}

// ─── Sync statuses via /historics ─────────────────────────────────────────────
async function syncDigylogStatuses(storeId: string): Promise<DocSyncResult> {
  try {
    const client = await createDigylogClientFromDB(storeId);

    // Active orders needing status update
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id, delivery_tracking_number, delivery_status")
      .not("delivery_tracking_number", "is", null)
      .not("status", "in", '("new","refused","no_answer","cancelled","pending","paid")')
      .limit(400);

    type ORow = { id: string; delivery_tracking_number: string; delivery_status: string | null };
    const rows = (orders ?? []) as ORow[];
    if (!rows.length) return { available: true, success: true, synced: 0, message: "Aucun tracking actif." };

    const trackings = rows.map((r) => r.delivery_tracking_number);
    let synced = 0;

    for (let i = 0; i < trackings.length; i += 50) {
      const batch = trackings.slice(i, i + 50);
      try {
        const historics = await client.getHistorics(batch) as Record<string, { "new value"?: string; date?: string }[]>;

        for (const t of batch) {
          const events = historics[t] ?? [];
          if (!events.length) continue;
          const last = events[events.length - 1];
          const raw  = last["new value"] ?? "";
          if (!raw) continue;

          const mapped = mapDigylogStatus(null, raw);
          if (!mapped) continue;

          await supabaseAdmin.from("orders").update({
            delivery_status:          mapped.internal,
            delivery_external_status: raw,
            delivery_last_sync_at:    new Date().toISOString(),
          } as never).eq("delivery_tracking_number", t);

          // Save status event
          const order = rows.find((r) => r.delivery_tracking_number === t);
          if (order) {
            await supabaseAdmin.from("delivery_status_events").insert({
              order_id:    order.id,
              tracking:    t,
              status:      mapped.internal,
              raw_status:  raw,
              occurred_at: last.date ?? new Date().toISOString(),
              source:      "api_sync",
            } as never).then(() => {}, () => {});
          }
          synced++;
        }
      } catch (e) {
        console.error("[statuses] batch error:", e);
      }
    }

    return { available: true, success: true, synced, message: `${synced}/${trackings.length} statuts mis à jour.` };
  } catch (e) {
    return { available: true, success: false, synced: 0, message: `Erreur: ${String(e)}` };
  }
}

// ─── Sync BL documents into generic delivery_documents ───────────────────────
async function syncDigylogBL(storeId: string, storeName: string): Promise<DocSyncResult> {
  try {
    // Get daily BLs with bl_id
    const { data: bls } = await supabaseAdmin
      .from("delivery_daily_bls")
      .select("id, bl_id, business_date, total_trackings, total_cod")
      .eq("store_name", storeName)
      .not("bl_id", "is", null)
      .order("business_date", { ascending: false })
      .limit(60);

    type BLRow = { id: string; bl_id: number; business_date: string; total_trackings: number; total_cod: number };
    const rows = (bls ?? []) as BLRow[];
    if (!rows.length) return { available: true, success: true, synced: 0, message: "Aucun BL à synchroniser." };

    let synced = 0;

    for (const bl of rows) {
      const { error } = await supabaseAdmin
        .from("delivery_documents")
        .upsert({
          provider_slug:   "digylog",
          store_id:        storeId,
          store_name:      storeName,
          document_type:   "BL",
          document_number: String(bl.bl_id),
          document_date:   bl.business_date,
          status:          "synced",
          total_cod:       bl.total_cod,
          line_count:      bl.total_trackings,
          source:          "api_sync",
          synced_at:       new Date().toISOString(),
        } as never, { onConflict: "provider_slug,document_type,document_number" });

      if (!error) synced++;
    }

    // Also fetch lines for each BL from orders
    for (const bl of rows.slice(0, 10)) { // limit to recent 10
      await syncBLLines(bl.bl_id, String(bl.bl_id), bl.business_date);
    }

    return { available: true, success: true, synced, message: `${synced} BL(s) synchronisés dans delivery_documents.` };
  } catch (e) {
    return { available: true, success: false, synced: 0, message: `Erreur BL: ${String(e)}` };
  }
}

// ─── Populate BL lines from orders ──────────────────────────────────────────
async function syncBLLines(blId: number, docNumber: string, blDate: string): Promise<void> {
  // Get the delivery_documents row
  const { data: doc } = await supabaseAdmin
    .from("delivery_documents")
    .select("id")
    .eq("document_type", "BL")
    .eq("document_number", docNumber)
    .maybeSingle();

  const docId = (doc as { id: string } | null)?.id;
  if (!docId) return;

  // Get orders sent on BL date
  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, delivery_tracking_number, customer_city, total_amount_mad, delivery_cost_real_mad, delivery_status, bl_id")
    .eq("bl_id", blId)
    .not("delivery_tracking_number", "is", null);

  type ORow = { id: string; order_number: string; delivery_tracking_number: string; customer_city: string; total_amount_mad: number; delivery_cost_real_mad: number | null; delivery_status: string | null };
  const orderRows = (orders ?? []) as ORow[];
  if (!orderRows.length) return;

  // Upsert lines
  const lines = orderRows.map((o) => ({
    document_id:     docId,
    tracking_number: o.delivery_tracking_number,
    order_id:        o.id,
    order_number:    o.order_number,
    city:            o.customer_city,
    cod_amount:      o.total_amount_mad,
    delivery_fee:    o.delivery_cost_real_mad,
    provider_status: o.delivery_status,
    line_type:       "delivered",
  }));

  await supabaseAdmin.from("delivery_document_lines")
    .upsert(lines as never, { onConflict: "document_id,tracking_number", ignoreDuplicates: true });
}

function notImplemented(storeName: string, providerSlug: string): FullSyncResult {
  const na: DocSyncResult = { available: false, success: false, synced: 0, message: `Provider '${providerSlug}' non implémenté.` };
  return { storeName, providerSlug, statuses: na, bl: na, invoices: na, refunds: na, br: na, reconciled: false, totalSynced: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// WHAT DIGYLOG API SUPPORTS — for UI display
// ─────────────────────────────────────────────────────────────────────────────
export const PROVIDER_CAPABILITIES: Record<string, Record<string, { available: boolean; note: string }>> = {
  digylog: {
    statuses:  { available: true,  note: "GET /historics — temps réel" },
    bl:        { available: true,  note: "GET /bl/:id/pdf — PDF + données" },
    invoices:  { available: false, note: "Non disponible via API → import CSV" },
    refunds:   { available: false, note: "Non disponible via API → manuel" },
    br:        { available: false, note: "Non disponible via API → import" },
    blfc:      { available: false, note: "Non disponible via API → import" },
    ramassage: { available: false, note: "Non disponible via API → import" },
  },
  ozone: {
    statuses:  { available: false, note: "À implémenter" },
    bl:        { available: false, note: "À implémenter" },
    invoices:  { available: false, note: "À implémenter" },
    refunds:   { available: false, note: "À implémenter" },
    br:        { available: false, note: "À implémenter" },
    blfc:      { available: false, note: "À implémenter" },
    ramassage: { available: false, note: "À implémenter" },
  },
};
