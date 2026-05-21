"use server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import type { DeliveryStoreRow, StoreFormData, StoreSyncResult } from "./store-actions-types";

export type { DeliveryStoreRow, StoreFormData, StoreSyncResult } from "./store-actions-types";

const ADMIN = ["super_admin", "admin"] as const;

// ─── List stores ─────────────────────────────────────────────────────────────
export async function getDeliveryStores(): Promise<DeliveryStoreRow[]> {
  await requireRole([...ADMIN]);
  try {
    const { data } = await supabaseAdmin
      .from("delivery_stores")
      .select("id, name, slug, is_active, is_default, delivery_fee_mad, google_sheet_id, google_sheet_name, api_base_url, metadata, created_at, delivery_companies(id, slug, name)")
      .order("name");
    return (data ?? []) as DeliveryStoreRow[];
  } catch { return []; }
}

// ─── Create store ─────────────────────────────────────────────────────────────
export async function createDeliveryStore(
  data: StoreFormData
): Promise<{ success: boolean; id?: string; error?: string }> {
  await requireRole([...ADMIN]);
  try {
    const slug = data.slug.trim() || data.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const { data: row, error } = await supabaseAdmin
      .from("delivery_stores")
      .insert({
        company_id:        data.companyId,
        name:              data.name.trim(),
        slug,
        api_token:         data.apiToken?.trim() || null,
        api_base_url:      data.apiBaseUrl?.trim() || null,
        google_sheet_id:   data.googleSheetId?.trim() || null,
        google_sheet_name: data.googleSheetName?.trim() || null,
        delivery_fee_mad:  data.deliveryFeeMad ?? 25,
        is_active:         data.isActive,
        is_default:        data.isDefault,
        metadata:          { client_name: data.clientName?.trim() || null, fulfillment_fee: data.fulfillmentFee ?? 0 },
      } as never)
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    const id = (row as { id: string }).id;
    if (data.isDefault) {
      await supabaseAdmin.from("delivery_stores").update({ is_default: false } as never).neq("id", id);
    }
    return { success: true, id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Update store ─────────────────────────────────────────────────────────────
export async function updateDeliveryStore(
  id: string,
  data: Partial<StoreFormData> & { clearToken?: boolean }
): Promise<{ success: boolean; error?: string }> {
  await requireRole([...ADMIN]);
  try {
    const update: Record<string, unknown> = {};
    if (data.name)             update.name              = data.name.trim();
    if (data.apiBaseUrl    !== undefined) update.api_base_url    = data.apiBaseUrl?.trim() || null;
    if (data.googleSheetId !== undefined) update.google_sheet_id = data.googleSheetId?.trim() || null;
    if (data.googleSheetName !== undefined) update.google_sheet_name = data.googleSheetName?.trim() || null;
    if (data.deliveryFeeMad !== undefined) update.delivery_fee_mad = data.deliveryFeeMad;
    if (data.isActive       !== undefined) update.is_active = data.isActive;
    if (data.isDefault      !== undefined) update.is_default = data.isDefault;
    if (data.clearToken)   update.api_token = null;
    if (data.apiToken?.trim()) update.api_token = data.apiToken.trim();

    const { error } = await supabaseAdmin.from("delivery_stores").update(update as never).eq("id", id);
    if (error) return { success: false, error: error.message };
    if (data.isDefault) {
      await supabaseAdmin.from("delivery_stores").update({ is_default: false } as never).neq("id", id);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Test connection ──────────────────────────────────────────────────────────
export async function testStoreConnection(
  id: string
): Promise<{ success: boolean; message: string }> {
  await requireRole([...ADMIN]);
  try {
    const { data } = await supabaseAdmin
      .from("delivery_stores")
      .select("api_token, api_base_url, delivery_companies(slug)")
      .eq("id", id)
      .single();

    const s = data as { api_token: string | null; api_base_url: string | null; delivery_companies: { slug: string } | null } | null;
    if (!s) return { success: false, message: "Store introuvable." };

    const token = s.api_token || process.env.DIGYLOG_TOKEN;
    if (!token) return { success: false, message: "Aucun token API configuré." };

    const baseUrl = s.api_base_url ?? process.env.DIGYLOG_BASE_URL ?? "https://seller.digylog.com/api";
    const res = await fetch(`${baseUrl}/orders?page=1&limit=1`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    return res.ok || res.status === 404
      ? { success: true, message: `✓ Connexion réussie (HTTP ${res.status})` }
      : { success: false, message: `Erreur HTTP ${res.status}` };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Connexion échouée" };
  }
}

// ─── Sync store — uses existing proven sheet-sync pipeline ───────────────────
export async function syncStore(storeId: string): Promise<StoreSyncResult> {
  await requireRole([...ADMIN, "manager"]);
  try {
    const { data: store } = await supabaseAdmin
      .from("delivery_stores")
      .select("name, google_sheet_id")
      .eq("id", storeId)
      .eq("is_active", true)
      .maybeSingle();

    const s = store as { name: string; google_sheet_id: string | null } | null;
    if (!s) return { ok: false, message: "Store introuvable.", step: "load_store" };
    if (!s.google_sheet_id) return { ok: false, message: "Google Sheet non configuré pour ce store.", step: "check_sheet" };

    // Use proven existing sync pipeline
    const { syncSheetToDigylog } = await import("@/lib/delivery/sheet-sync/actions");
    const result = await syncSheetToDigylog(s.google_sheet_id);

    // Update last_sync in metadata
    await supabaseAdmin.from("delivery_stores").update({
      metadata: { last_sync_at: new Date().toISOString(), last_sync_sent: result.sent },
    } as never).eq("id", storeId);

    return {
      ok:      result.success,
      message: result.success
        ? `✓ ${result.sent} commandes envoyées · ${result.skipped} ignorées`
        : `Sync échoué: ${result.error ?? "erreur inconnue"}`,
      step:    "sheet_sync",
      sent:    result.sent,
      skipped: result.skipped,
      failed:  result.failed,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[syncStore] error:", msg);
    return { ok: false, message: "Sync échoué", step: "sheet_sync", error: msg };
  }
}
