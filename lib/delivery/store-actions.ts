"use server";
export type { DeliveryStoreRow, StoreFormData } from "./store-actions-types";
import type { DeliveryStoreRow, StoreFormData } from "./store-actions-types";
/**
 * lib/delivery/store-actions.ts
 * CRUD actions for delivery stores (admin only).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

const ADMIN_ROLES = ["super_admin", "admin"] as const;

// StoreFormData now in store-actions-types.ts

// ─── List all stores with company info ────────────────────────────────────────
export async function getDeliveryStores(): Promise<DeliveryStoreRow[]> {
  await requireRole([...ADMIN_ROLES]);
  try {
    const { data, error } = await supabaseAdmin
      .from("delivery_stores")
      .select(`
        id, name, slug, is_active, is_default,
        delivery_fee_mad, google_sheet_id, google_sheet_name,
        api_base_url, metadata, created_at,
        delivery_companies(id, slug, name)
      `)
      .order("name");
    if (error) {
      console.error("[getDeliveryStores] error:", error.message);
      return [];
    }
    return (data ?? []) as DeliveryStoreRow[];
  } catch (e) {
    console.error("[getDeliveryStores] table missing:", e);
    return [];
  }
}

// DeliveryStoreRow now in store-actions-types.ts

// ─── Get single store (with token masked for display) ─────────────────────────
export async function getDeliveryStore(id: string) {
  await requireRole([...ADMIN_ROLES]);
  const { data } = await supabaseAdmin
    .from("delivery_stores")
    .select("*, delivery_companies(id, slug, name)")
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  // Mask token for display
  const raw = data as Record<string, unknown>;
  const token = raw.api_token as string | null;
  return {
    ...raw,
    api_token_masked: token ? `${token.slice(0, 6)}${"•".repeat(Math.min(token.length - 6, 20))}` : null,
    has_token: !!token,
  } as DeliveryStoreRow & { api_token_masked: string | null; has_token: boolean };
}

// ─── Create store ─────────────────────────────────────────────────────────────
export async function createDeliveryStore(data: StoreFormData): Promise<{ success: boolean; id?: string; error?: string }> {
  await requireRole([...ADMIN_ROLES]);

  // Generate slug if empty
  const slug = data.slug.trim() || data.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  let inserted: { id: string } | null = null;
  try {
  const { data: ins, error } = await supabaseAdmin
    .from("delivery_stores")
    .insert({
      company_id:        data.companyId,
      name:              data.name.trim(),
      slug,
      api_token:         data.apiToken?.trim() || null,
      api_base_url:      data.apiBaseUrl?.trim() || null,
      webhook_secret:    data.webhookSecret?.trim() || null,
      google_sheet_id:   data.googleSheetId?.trim() || null,
      google_sheet_name: data.googleSheetName?.trim() || null,
      delivery_fee_mad:  data.deliveryFeeMad ?? 25,
      is_active:         data.isActive,
      is_default:        data.isDefault,
      metadata: {
        client_name:    data.clientName?.trim() || null,
        client_phone:   data.clientPhone?.trim() || null,
        fulfillment_fee: data.fulfillmentFee ?? 0,
      },
    } as never)
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  inserted = ins as { id: string };
  } catch (e) {
    return { success: false, error: String(e) };
  }
  if (!inserted) return { success: false, error: "Insertion échouée." };

  // If set as default, unset others
  if (data.isDefault) {
    await supabaseAdmin.from("delivery_stores")
      .update({ is_default: false } as never)
      .neq("id", inserted.id);
  }

  revalidatePath("/admin/settings/delivery-providers");
  return { success: true, id: inserted.id };
}

// ─── Update store ─────────────────────────────────────────────────────────────
export async function updateDeliveryStore(
  id: string,
  data: Partial<StoreFormData> & { clearToken?: boolean }
): Promise<{ success: boolean; error?: string }> {
  await requireRole([...ADMIN_ROLES]);

  const update: Record<string, unknown> = {};
  if (data.name)            update.name              = data.name.trim();
  if (data.apiBaseUrl       !== undefined) update.api_base_url      = data.apiBaseUrl?.trim() || null;
  if (data.webhookSecret    !== undefined) update.webhook_secret     = data.webhookSecret?.trim() || null;
  if (data.googleSheetId    !== undefined) update.google_sheet_id    = data.googleSheetId?.trim() || null;
  if (data.googleSheetName  !== undefined) update.google_sheet_name  = data.googleSheetName?.trim() || null;
  if (data.deliveryFeeMad   !== undefined) update.delivery_fee_mad   = data.deliveryFeeMad;
  if (data.isActive         !== undefined) update.is_active          = data.isActive;
  if (data.isDefault        !== undefined) update.is_default         = data.isDefault;
  if (data.clearToken)                     update.api_token          = null;
  // Only update token if new value provided
  if (data.apiToken?.trim()) update.api_token = data.apiToken.trim();

  // Update metadata
  if (data.clientName !== undefined || data.clientPhone !== undefined || data.fulfillmentFee !== undefined) {
    const { data: existing } = await supabaseAdmin.from("delivery_stores").select("metadata").eq("id", id).single();
    const meta = (existing as { metadata: Record<string, unknown> | null } | null)?.metadata ?? {};
    if (data.clientName    !== undefined) meta.client_name     = data.clientName?.trim() || null;
    if (data.clientPhone   !== undefined) meta.client_phone    = data.clientPhone?.trim() || null;
    if (data.fulfillmentFee !== undefined) meta.fulfillment_fee = data.fulfillmentFee;
    update.metadata = meta;
  }

  const { error } = await supabaseAdmin.from("delivery_stores").update(update as never).eq("id", id);
  if (error) return { success: false, error: error.message };

  if (data.isDefault) {
    await supabaseAdmin.from("delivery_stores").update({ is_default: false } as never).neq("id", id);
  }

  revalidatePath("/admin/settings/delivery-providers");
  return { success: true };
}

// ─── Test connection ──────────────────────────────────────────────────────────
export async function testStoreConnection(id: string): Promise<{ success: boolean; message: string }> {
  await requireRole([...ADMIN_ROLES]);

  const { data: store } = await supabaseAdmin
    .from("delivery_stores")
    .select("api_token, api_base_url, delivery_companies(slug)")
    .eq("id", id)
    .single();

  const s = store as { api_token: string | null; api_base_url: string | null; delivery_companies: { slug: string } | null } | null;
  if (!s) return { success: false, message: "Store introuvable." };

  const companySlug = s.delivery_companies?.slug ?? "digylog";
  const token = s.api_token || process.env.DIGYLOG_TOKEN;

  if (!token) return { success: false, message: "Aucun token API configuré." };

  if (companySlug === "digylog") {
    try {
      const baseUrl = s.api_base_url ?? process.env.DIGYLOG_BASE_URL ?? "https://seller.digylog.com/api";
      const res = await fetch(`${baseUrl}/orders?page=1&limit=1`, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok || res.status === 404) {
        return { success: true, message: `✓ Connexion Digylog réussie (${res.status})` };
      }
      return { success: false, message: `Erreur HTTP ${res.status}` };
    } catch (e) {
      return { success: false, message: `Connexion échouée: ${e instanceof Error ? e.message : "Timeout"}` };
    }
  }

  return { success: false, message: `Provider '${companySlug}' — test non implémenté.` };
}

// ─── Real sync pipeline — reads store sheet + sends to provider ───────────────
export async function syncStore(storeId: string): Promise<{
  success: boolean;
  sent: number;
  skipped: number;
  failed: number;
  error?: string;
}> {
  await requireRole(["super_admin", "admin", "manager"]);

  // Load store config
  const { data: store } = await supabaseAdmin
    .from("delivery_stores")
    .select("id, name, google_sheet_id, google_sheet_name, delivery_companies(slug)")
    .eq("id", storeId)
    .eq("is_active", true)
    .maybeSingle();

  const s = store as {
    id: string; name: string;
    google_sheet_id: string | null;
    google_sheet_name: string | null;
    delivery_companies: { slug: string } | null;
  } | null;

  if (!s) return { success: false, sent: 0, skipped: 0, failed: 0, error: "Store introuvable." };
  if (!s.google_sheet_id) return { success: false, sent: 0, skipped: 0, failed: 0, error: "Sheet non configuré pour ce store." };

  // Delegate to existing sync pipeline
  const { syncSheetToDigylog } = await import("./sheet-sync/actions");
  const result = await syncSheetToDigylog(s.google_sheet_id);

  // Log sync in store metadata
  await supabaseAdmin.from("delivery_stores").update({
    metadata: { last_sync_at: new Date().toISOString(), last_sync_sent: result.sent },
  } as never).eq("id", storeId);

  return {
    success: result.success,
    sent:    result.sent,
    skipped: result.skipped,
    failed:  result.failed,
    error:   result.error,
  };
}
