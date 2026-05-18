"use server";
/**
 * lib/delivery/providers/document-sync.ts
 * Provider document sync — NEVER throws to client.
 * All errors are caught and returned as structured DocSyncResult.
 */

// All heavy imports are lazy — prevents supabaseAdmin from loading in client bundle
// These are resolved at runtime inside server functions only

const MANAGER = ["super_admin", "admin", "manager"] as const;

export type { DocSyncResult, FullSyncResult } from "./document-sync-types";
import type { DocSyncResult, FullSyncResult } from "./document-sync-types";

// ─── MAIN ENTRY — never throws ────────────────────────────────────────────────
export async function syncProviderDocuments(storeId: string): Promise<FullSyncResult> {
  // All logic wrapped — nothing escapes to client as unhandled exception
  try {
    return await _syncProviderDocuments(storeId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("STORE SYNC FAILED", { storeId, step: "top-level", error: msg });
    const fail: DocSyncResult = { available: false, success: false, synced: 0, message: msg };
    return {
      storeName: "", providerSlug: "unknown",
      statuses: fail, bl: fail, invoices: fail, refunds: fail, br: fail,
      reconciled: false, totalSynced: 0, fatalError: msg,
    };
  }
}

async function _syncProviderDocuments(storeId: string): Promise<FullSyncResult> {
  const { requireRole } = await import("@/lib/auth/session");
  await requireRole([...MANAGER]);

  // Load store
  let storeName    = "";
  let providerSlug = "digylog";

  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const { data: storeData, error: storeErr } = await supabaseAdmin
    .from("delivery_stores")
    .select("id, name, delivery_companies(slug)")
    .eq("id", storeId)
    .maybeSingle();

  if (storeErr) {
    console.error("STORE SYNC FAILED", { storeId, step: "load_store", error: storeErr.message });
    const fail: DocSyncResult = { available: false, success: false, synced: 0, message: `Store load error: ${storeErr.message}` };
    return { storeName: "", providerSlug: "", statuses: fail, bl: fail, invoices: fail, refunds: fail, br: fail, reconciled: false, totalSynced: 0 };
  }

  if (storeData) {
    const s = storeData as { name: string; delivery_companies: { slug: string } | null };
    storeName    = s.name ?? "";
    providerSlug = s.delivery_companies?.slug ?? "digylog";
  }

  const startedAt = Date.now();

  // Log start — best effort
  let syncLogId: string | null = null;
  try {
    const { supabaseAdmin: sa } = await import("@/lib/supabase/admin");
    const { data: log } = await sa.from("provider_sync_logs").insert({
      provider_slug: providerSlug, store_id: storeId, store_name: storeName,
      sync_type: "full", status: "running",
    } as never).select("id").single();
    syncLogId = (log as { id: string } | null)?.id ?? null;
  } catch { /* table may not exist yet */ }

  // Run each step independently
  const statusRes = await safeStep("syncStatuses", () => syncStatuses(storeId, providerSlug));
  const blRes     = await safeStep("syncBL",       () => syncBL(storeId, storeName, providerSlug));

  const invoicesRes: DocSyncResult = { available: false, success: false, synced: 0, message: "Factures non disponibles via API Digylog → import CSV." };
  const refundsRes:  DocSyncResult = { available: false, success: false, synced: 0, message: "Remboursements non disponibles via API." };
  const brRes:       DocSyncResult = { available: false, success: false, synced: 0, message: "BR/BLFC non disponibles via API → import manuel." };

  // Reconcile — best effort
  let reconciled = false;
  try {
    const { runReconciliation } = await import("@/lib/finance/reconciliation-engine");
    await runReconciliation({ providerSlug, storeId });
    reconciled = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("STORE SYNC FAILED", { storeId, step: "reconciliation", error: msg });
  }

  // Log end — best effort
  try {
    if (syncLogId) {
      const { supabaseAdmin: sa2 } = await import("@/lib/supabase/admin");
      await sa2.from("provider_sync_logs").update({
        status: "success", finished_at: new Date().toISOString(),
        success_count: statusRes.synced + blRes.synced,
        error_count: (statusRes.success ? 0 : 1) + (blRes.success ? 0 : 1),
        records_synced: statusRes.synced + blRes.synced,
      } as never).eq("id", syncLogId);
    }
  } catch { /* ignore */ }

  // Revalidate — only non-store pages to avoid re-render crash
  try { const { revalidatePath } = await import("next/cache"); revalidatePath("/admin/delivery/documents"); revalidatePath("/admin/finance/reconciliation"); } catch { /* ignore */ }
  // NOT revalidating delivery-providers — causes Server Component re-render crash

  const duration = Date.now() - startedAt;
  console.log(`[doc-sync] ${storeName} (${providerSlug}) done in ${duration}ms — statuses:${statusRes.synced} bl:${blRes.synced} reconciled:${reconciled}`);

  return {
    storeName, providerSlug,
    statuses: statusRes, bl: blRes, invoices: invoicesRes, refunds: refundsRes, br: brRes,
    reconciled, totalSynced: statusRes.synced + blRes.synced,
  };
}

// ─── Safe step wrapper ────────────────────────────────────────────────────────
async function safeStep(stepName: string, fn: () => Promise<DocSyncResult>): Promise<DocSyncResult> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("STORE SYNC FAILED", { step: stepName, error: msg });
    return { available: true, success: false, synced: 0, message: `${stepName} error: ${msg}` };
  }
}

// ─── Sync statuses ────────────────────────────────────────────────────────────
async function syncStatuses(storeId: string, providerSlug: string): Promise<DocSyncResult> {
  if (providerSlug !== "digylog") {
    return { available: false, success: false, synced: 0, message: `Provider '${providerSlug}' non implémenté.` };
  }

  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const { createDigylogClientFromDB } = await import("@/lib/delivery/digylog/client");
  const { mapDigylogStatus } = await import("@/lib/delivery/digylog/status-map");
  const client = await createDigylogClientFromDB(storeId);

  const { data: orders, error: ordErr } = await supabaseAdmin
    .from("orders")
    .select("id, delivery_tracking_number")
    .not("delivery_tracking_number", "is", null)
    .not("status", "in", '("new","refused","no_answer","cancelled","pending","paid")')
    .limit(400);

  if (ordErr) throw new Error(`orders query: ${ordErr.message}`);

  type ORow = { id: string; delivery_tracking_number: string };
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
          delivery_status: mapped.internal,
          delivery_external_status: raw,
          delivery_last_sync_at: new Date().toISOString(),
        } as never).eq("delivery_tracking_number", t);

        synced++;
      }
    } catch (e) {
      console.error(`[syncStatuses] batch error:`, e instanceof Error ? e.message : e);
    }
  }

  return { available: true, success: true, synced, message: `${synced}/${trackings.length} statuts mis à jour.` };
}

// ─── Sync BL ──────────────────────────────────────────────────────────────────
async function syncBL(storeId: string, storeName: string, providerSlug: string): Promise<DocSyncResult> {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
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
  if (!rows.length) return { available: true, success: true, synced: 0, message: "Aucun BL trouvé pour ce store." };

  let synced = 0;

  for (const bl of rows) {
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
    else console.warn(`[syncBL] bl ${bl.bl_id} upsert:`, error.message);
  }

  return { available: true, success: true, synced, message: `${synced}/${rows.length} BL(s) synchronisés.` };
}

export const PROVIDER_CAPABILITIES: Record<string, Record<string, { available: boolean; note: string }>> = {
  digylog: {
    statuses: { available: true,  note: "GET /historics" },
    bl:       { available: true,  note: "Depuis delivery_daily_bls" },
    invoices: { available: false, note: "Import CSV uniquement" },
    refunds:  { available: false, note: "Manuel uniquement" },
    br:       { available: false, note: "Import manuel" },
  },
};
