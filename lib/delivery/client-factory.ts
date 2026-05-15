/**
 * lib/delivery/client-factory.ts
 *
 * Universal delivery client factory.
 * Given a store_id (or null for default), returns the correct client
 * for that store's provider (Digylog, Ozone, etc.)
 *
 * This is the SINGLE entry point — replaces all hardcoded createDigylogClientFromDB() calls.
 *
 * Usage:
 *   const client = await getDeliveryClient(storeId);
 *   await client.createOrder(...)
 *   await client.getDailyBL(date)
 *
 * Adding a new provider:
 *   1. Create lib/delivery/providers/<name>.ts
 *   2. Add case in resolveClient() below
 *   3. No other changes needed
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { DigylogClient } from "./digylog/client";

// ─── Universal interface ───────────────────────────────────────────────────────
export interface DeliveryClient {
  /** Provider slug: 'digylog' | 'ozone' | ... */
  providerSlug:  string;
  storeId:       string | null;
  storeName:     string;

  // Core methods — all providers must implement
  createOrder(payload: CreateOrderPayload): Promise<CreateOrderResult>;
  getLabels(trackings: string[]): Promise<LabelResult>;
  sendOrders(trackings: string[]): Promise<SendOrdersResult>;
  getDailyBL(date: string): Promise<BLResult>;
  syncStatuses(trackings: string[]): Promise<StatusSyncResult[]>;
  testConnection(): Promise<{ ok: boolean; message: string }>;

  // Digylog-specific methods (optional — throw if not supported)
  hasToken(): boolean;
  createOrders(params: Record<string, unknown>): Promise<Record<string, unknown>>;
  downloadLabels(params: Record<string, unknown>): Promise<{ ok: boolean; data?: string; blob?: Blob; error?: string }>;
  downloadBlPdf(blId: number): Promise<{ ok: boolean; data?: string; blob?: Blob; error?: string }>;
}

export type CreateOrderPayload = {
  orderNumber:     string;
  customerName:    string;
  customerPhone:   string;
  customerAddress: string;
  customerCity:    string;
  codAmount:       number;
  productName?:    string;
  quantity?:       number;
  notes?:          string;
  storeReference?: string;
};

export type CreateOrderResult = { success: boolean; trackingNumber?: string; error?: string };
export type LabelResult       = { success: boolean; blobBase64?: string; error?: string };
export type SendOrdersResult  = { success: boolean; ok?: boolean; blId?: number; bl?: number; error?: string };
export type BLResult          = { success: boolean; blobBase64?: string; blId?: number; error?: string };
export type StatusSyncResult  = { tracking: string; status: string; rawStatus: string; updated: boolean };

// ─── Store config from DB ──────────────────────────────────────────────────────
type StoreConfig = {
  id:           string;
  name:         string;
  slug:         string;
  api_token:    string | null;
  api_base_url: string | null;
  metadata:     Record<string, unknown> | null;
  delivery_companies: { slug: string; name: string } | null;
};

async function loadStoreConfig(storeId?: string | null): Promise<StoreConfig> {
  if (storeId) {
    const { data } = await supabaseAdmin
      .from("delivery_stores")
      .select("id, name, slug, api_token, api_base_url, metadata, delivery_companies(slug, name)")
      .eq("id", storeId)
      .eq("is_active", true)
      .maybeSingle();
    if (data) return data as StoreConfig;
  }

  // Fall back to default store
  const { data: def } = await supabaseAdmin
    .from("delivery_stores")
    .select("id, name, slug, api_token, api_base_url, metadata, delivery_companies(slug, name)")
    .eq("is_active", true)
    .eq("is_default", true)
    .maybeSingle();

  if (def) return def as StoreConfig;

  // Absolute fallback — env-based Digylog
  return {
    id:           "env",
    name:         "Digylog (env)",
    slug:         "default",
    api_token:    process.env.DIGYLOG_TOKEN ?? null,
    api_base_url: process.env.DIGYLOG_BASE_URL ?? null,
    metadata:     null,
    delivery_companies: { slug: "digylog", name: "Digylog" },
  };
}

// ─── Digylog adapter wrapper ───────────────────────────────────────────────────
class DigylogDeliveryClient implements DeliveryClient {
  providerSlug = "digylog";
  storeId:    string | null;
  storeName:  string;
  private raw: DigylogClient;

  constructor(store: StoreConfig) {
    this.storeId   = store.id === "env" ? null : store.id;
    this.storeName = store.name;

    const token   = (store.api_token ?? process.env.DIGYLOG_TOKEN ?? "").trim();
    const baseUrl = (store.api_base_url ?? process.env.DIGYLOG_BASE_URL ?? "https://api.digylog.com/api/v2/seller").trim();
    const referer = (store.metadata?.referer as string | undefined) ?? process.env.DIGYLOG_REFERER ?? "https://apiseller.digylog.com";

    this.raw = new DigylogClient(token, baseUrl, referer);
  }

  async createOrder(_p: CreateOrderPayload): Promise<CreateOrderResult> {
    // Use unifiedSendToDigylog for full order creation with proper field mapping
    return { success: false, error: "Use unifiedSendToDigylog() for order creation." };
  }

  async getLabels(trackings: string[]): Promise<LabelResult> {
    const r = await this.raw.downloadLabels({ orders: trackings, format: 3 });
    if (!r.ok) return { success: false, error: r.error };
    const buf = r.blob ? await r.blob.arrayBuffer() : null;
    return { success: true, blobBase64: buf ? Buffer.from(buf).toString("base64") : undefined };
  }

  async sendOrders(trackings: string[]): Promise<SendOrdersResult> {
    const r = await this.raw.sendOrders(trackings);
    if (!r.ok) return { success: false, ok: false, error: r.error };
    return { success: true, ok: true, blId: r.bl, bl: r.bl };
  }

  async getDailyBL(_date: string): Promise<BLResult> {
    // getDailyBL uses daily-bl-actions — this is a placeholder
    return { success: false, error: "Use daily-bl-actions for BL download." };
  }

  async syncStatuses(trackings: string[]): Promise<StatusSyncResult[]> {
    const historics = await this.raw.getHistorics(trackings) as Record<string, { "new value"?: string }[]>;
    return trackings.map((t) => {
      const events = (historics as Record<string, { "new value"?: string }[]>)[t] ?? [];
      const last = events[events.length - 1];
      const status = last?.["new value"] ?? "";
      return { tracking: t, status, rawStatus: JSON.stringify(last ?? {}), updated: !!status };
    });
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return this.raw.testConnection();
  }

  // Digylog-specific passthrough methods
  hasToken(): boolean { return !!this.raw; }
  async createOrders(p: Record<string, unknown>) { return this.raw.createOrders(p as never); }
  async downloadLabels(p: Record<string, unknown>) { return this.raw.downloadLabels(p as never); }
  async downloadBlPdf(blId: number) { return this.raw.downloadBlPdf(blId); }
  async fetchHistorics(trackings: string[]) { return this.raw.getHistorics(trackings); }
  async getHistorics(trackings: string[]) { return this.raw.getHistorics(trackings); }
  async downloadBL(_date: string) { return { ok: false, error: "Use daily-bl-actions" }; }
}

// ─── MAIN FACTORY — the single entry point ────────────────────────────────────
export async function getDeliveryClient(storeId?: string | null): Promise<DeliveryClient> {
  const store = await loadStoreConfig(storeId);
  const providerSlug = store.delivery_companies?.slug ?? "digylog";

  switch (providerSlug) {
    case "digylog":
      return new DigylogDeliveryClient(store);
    // case "ozone":
    //   return new OzoneDeliveryClient(store);
    default:
      // Unknown provider — fallback to Digylog with a warning
      console.warn(`[client-factory] Unknown provider '${providerSlug}', falling back to Digylog`);
      return new DigylogDeliveryClient(store);
  }
}

/**
 * Convenience — get client for an order (looks up order.delivery_store_id).
 */
export async function getClientForOrder(orderId: string): Promise<DeliveryClient> {
  const { data } = await supabaseAdmin
    .from("orders")
    .select("delivery_store_id")
    .eq("id", orderId)
    .maybeSingle();

  const storeId = (data as { delivery_store_id: string | null } | null)?.delivery_store_id;
  return getDeliveryClient(storeId);
}
