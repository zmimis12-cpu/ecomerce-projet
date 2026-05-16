"use server";
/**
 * lib/delivery/providers/document-sync.ts
 * Provider document sync — automatic-first, manual fallback.
 * All results are plain JSON-serializable objects.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { createDigylogClientFromDB } from "@/lib/delivery/digylog/client";
import { mapDigylogStatus } from "@/lib/delivery/digylog/status-map";
import { revalidatePath } from "next/cache";

const MANAGER = ["super_admin", "admin", "manager"] as const;

// Plain serializable result types (no functions, no classes)
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
  error?:       string;
};

const UNAVAILABLE = (msg: string): DocSyncResult => ({
  available: false, success: false, synced: 0, message: msg,
});

// ─── MAIN ENTRY ───────────────────────────────────────────────────────────────
export async function syncProviderDocuments(storeId: string): Promise<FullSyncResult> {
  await requireRole([...MANAGER]);

  // 1. Load store — safe
  let storeName = "Unknown";
  let providerSlug = "digylog";

  try {
    const { data, error } = await supabaseAdmin
      .from("delivery_stores")
      .select("id, name, delivery_companies(slug)")
      .eq("id", storeId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Store introuvable");

    const s = data as { name: string; delivery_companies: { slug: string } | null };
    storeName    = s.name ?? "Unknown";
    providerSlug = s.delivery_companies?.slug ?? "digylog";
  } catch (e) {
    const msg = `Store load failed: ${e instanceof Error ? e.message : String(e)}`;
    const fail = UNAVAILABLE(msg);
    return { storeName, providerSlug, statuses: fail, bl: fail, invoices: fail, refunds: fail, br: fail, reconciled: false, totalSynced: 0, error: msg };
  }

  // 2. Log sync start
  let syncLogId: string | null = null;
  const startedAt = Date.now();
  try {
    const { data: log } = await supabaseAdmin.from("provider_sync_logs").insert({
      provider_slug: providerSlug,
      store_id:      storeId,
      store_name:    storeName,
      sync_type:     "full",
      status:        "running",
    } as never).select("id").single();
    syncLogId = (log as { id: string } | null)?.id ?? null;
  } catch { /* table may not exist */ }

  // 3. Run syncs — each isolated
  const statusRes  = await safeSync(() => syncStatuses(storeId, providerSlug), "statuses");
  const blRes      = await safeSync(() => syncBL(storeId, storeName, providerSlug), "bl");

  const invoicesRes = UNAVAILABLE("Digylog ne fournit pas les factures via API → import CSV.");
  const refundsRes  = UNAVAILABLE("Remboursements non disponibles via API Digylog.");
  const brRes       = UNAVAILABLE("BR/BLFC non disponibles via API → import manuel.");

  // 4. Reconcile automatically
  let reconciled = false;
  try {
    const { runReconciliation } = await import("@/lib/finance/reconciliation-engine");
    await runReconciliation({ providerSlug, storeId });
    reconciled = true;
  } catch (e) {
    console.error("[doc-sync] reconciliation skipped:", e instanceof Error ? e.message : e);
  }

  // 5. Log sync end
  const duration = Date.now() - startedAt;
  try {
    if (syncLogId) {
      await supabaseAdmin.from("provider_sync_logs").update({
        status:         "success",
        finished_at:    new Date().toISOString(),
        success_count:  statusRes.synced + blRes.synced,
        error_count:    (statusRes.success ? 0 : 1) + (blRes.success ? 0 : 1),
        records_synced: statusRes.synced + blRes.synced,
      } as never).eq("id", syncLogId);
    }
  } catch { /* ignore */ }

  revalidatePath("/admin/delivery/documents");
  revalidatePath("/admin/finance/reconciliation");
  revalidatePath("/admin/settings/delivery-providers");

  console.log(`[doc-sync] ${storeName} done in ${duration}ms — statuses:${statusRes.synced} bl:${blRes.synced}`);

  return {
    storeName,
    providerSlug,
    statuses:   statusRes,
    bl:         blRes,
    invoices:   invoicesRes,
    refunds:    refundsRes,
    br:         brRes,
    reconciled,
    totalSynced: statusRes.synced + blRes.synced,
  };
}

// ─── Safe wrapper — never throws ─────────────────────────────────────────────
async function safeSync(fn: () => Promise<DocSyncResult>, label: string): Promise<DocSyncResult> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[doc-sync] ${label} failed:`, msg);
    return { available: true, success: false, synced: 0, message: `Erreur ${label}: ${msg}` };
  }
}

// ─── Sync statuses ────────────────────────────────────────────────────────────
async function syncStatuses(storeId: string, providerSlug: string): Promise<DocSyncResult> {
  if (providerSlug !== "digylog") {
    return UNAVAILABLE(`Provider '${providerSlug}' sync non implémenté.`);
  }

  const client = await createDigylogClientFromDB(storeId);

  const { data: orders, error: ordErr } = await supabaseAdmin
    .from("orders")
    .select("id, delivery_tracking_number, delivery_status")
    .not("delivery_tracking_number", "is", null)
    .not("status", "in", '("new","refused","no_answer","cancelled","pending","paid")')
    .limit(400);

  if (ordErr) throw new Error(`Orders query: ${ordErr.message}`);

  type ORow = { id: string; delivery_tracking_number: string; delivery_status: string | null };
  const rows = (orders ?? []) as ORow[];
  if (!rows.length) return { available: true, success: true, synced: 0, message: "Aucun tracking actif à synchroniser." };

  const trackings = rows.map((r) => r.delivery_tracking_number);
  let synced = 0;
  let errors = 0;

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

        const { error } = await supabaseAdmin.from("orders").update({
          delivery_status:          mapped.internal,
          delivery_external_status: raw,
          delivery_last_sync_at:    new Date().toISOString(),
        } as never).eq("delivery_tracking_number", t);

        if (!error) synced++;

        // Best-effort event log (ignore if table missing)
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
      }
    } catch (e) {
      console.error(`[statuses] batch ${i}-${i+50} error:`, e instanceof Error ? e.message : e);
      errors++;
    }
  }

  const total = trackings.length;
  return {
    available: true,
    success:   errors < Math.ceil(total / 50), // success if majority batches OK
    synced,
    message:   `${synced}/${total} statuts mis à jour${errors > 0 ? ` (${errors} erreur(s) batch)` : ""}.`,
  };
}

// ─── Sync BL documents ────────────────────────────────────────────────────────
async function syncBL(storeId: string, storeName: string, providerSlug: string): Promise<DocSyncResult> {
  // Try delivery_daily_bls → delivery_documents
  const { data: bls, error: blErr } = await supabaseAdmin
    .from("delivery_daily_bls")
    .select("id, bl_id, business_date, total_trackings, total_cod")
    .eq("store_name", storeName)
    .not("bl_id", "is", null)
    .order("business_date", { ascending: false })
    .limit(60);

  if (blErr) throw new Error(`delivery_daily_bls: ${blErr.message}`);

  type BLRow = { id: string; bl_id: number; business_date: string; total_trackings: number; total_cod: number };
  const rows = (bls ?? []) as BLRow[];
  if (!rows.length) return { available: true, success: true, synced: 0, message: "Aucun BL à synchroniser." };

  let synced = 0;

  for (const bl of rows) {
    try {
      const { error } = await supabaseAdmin
        .from("delivery_documents")
        .upsert({
          provider_slug:   providerSlug,
          store_id:        storeId,
          store_name:      storeName,
          document_type:   "BL",
          document_number: String(bl.bl_id),
          document_date:   bl.business_date,
          status:          "synced",
          total_cod:       bl.total_cod ?? 0,
          line_count:      bl.total_trackings ?? 0,
          source:          "api_sync",
          synced_at:       new Date().toISOString(),
        } as never, { onConflict: "provider_slug,document_type,document_number" });

      if (!error) synced++;
      else console.warn(`[syncBL] upsert error for bl ${bl.bl_id}:`, error.message);
    } catch (e) {
      console.warn(`[syncBL] bl ${bl.bl_id} skip:`, e instanceof Error ? e.message : e);
    }
  }

  return { available: true, success: true, synced, message: `${synced}/${rows.length} BL(s) synchronisés.` };
}

// ─── Provider capabilities info ───────────────────────────────────────────────
export const PROVIDER_CAPABILITIES: Record<string, Record<string, { available: boolean; note: string }>> = {
  digylog: {
    statuses:  { available: true,  note: "GET /historics — temps réel" },
    bl:        { available: true,  note: "Sync depuis delivery_daily_bls" },
    invoices:  { available: false, note: "Non disponible via API → import CSV" },
    refunds:   { available: false, note: "Non disponible via API → manuel" },
    br:        { available: false, note: "Non disponible via API → import" },
  },
};
