/**
 * lib/delivery/digylog/client.ts — Digylog API v2.4 — server-side ONLY.
 *
 * Auth: Authorization: Bearer <TOKEN>  (capital B per OAuth2 standard)
 * Required: Referer: https://apiseller.digylog.com
 */
import type {
  DigylogNetwork, DigylogFC, DigylogStore, DigylogCity, DigylogStatus,
  DigylogCreateOrdersBody, DigylogCreatedOrder, DigylogSendResponse,
  DigylogOrderInfo, DigylogOrderRef, DigylogHistorics,
  DigylogDeliveryCost, DigylogPickupArea, DigylogWebhookPayload,
} from "./types";

export class DigylogClient {
  private readonly token:   string;
  private readonly baseUrl: string;
  private readonly referer: string;

  constructor(
    token:   string,
    baseUrl: string = "https://api.digylog.com/api/v2/seller",
    referer: string = "https://apiseller.digylog.com"
  ) {
    this.token   = token.trim();
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.referer = referer;
  }

  hasToken(): boolean { return this.token.length > 0; }

  // ── Core request ───────────────────────────────────────────────────────────
  async request<T>(
    method: string,
    path:   string,
    body?:  unknown,
    returnBlob = false
  ): Promise<{ ok: boolean; data?: T; blob?: Blob; error?: string; status?: number; rawText?: string }> {
    if (!this.hasToken()) {
      return { ok: false, error: "Token Digylog manquant. Configurez-le dans Paramètres → Transporteur." };
    }

    let rawText = "";
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Referer":       this.referer,
          "Content-Type":  "application/json",
          "Accept":        returnBlob ? "application/pdf" : "application/json",
        },
        body:  body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });

      if (!res.ok) {
        rawText = await res.text().catch(() => "");
        // Try to parse JSON error from Digylog
        let errMsg = `HTTP ${res.status}`;
        try {
          const errJson = JSON.parse(rawText) as Record<string, unknown>;
          errMsg = String(errJson.message ?? errJson.error ?? errJson.error_description ?? rawText).slice(0, 300);
        } catch { errMsg = rawText.slice(0, 300) || errMsg; }
        console.error(`❌ DIGYLOG ERROR [${method} ${path}] HTTP ${res.status}:`, errMsg);
        return { ok: false, error: errMsg, status: res.status, rawText };
      }

      if (returnBlob) {
        const blob = await res.blob();
        return { ok: true, blob };
      }

      rawText = await res.text();
      let data: T;
      try {
        data = JSON.parse(rawText) as T;
      } catch {
        return { ok: false, error: `Réponse non-JSON de Digylog: ${rawText.slice(0, 200)}`, rawText };
      }
      return { ok: true, data, status: res.status, rawText };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur réseau";
      console.error(`❌ DIGYLOG ERROR [${method} ${path}]:`, msg);
      return { ok: false, error: msg };
    }
  }

  // ── Reference data ─────────────────────────────────────────────────────────
  async getNetworks(): Promise<DigylogNetwork[]> {
    const r = await this.request<DigylogNetwork[]>("GET", "/networks");
    return r.ok ? (r.data ?? []) : [];
  }
  async getFulfillmentCenters(): Promise<DigylogFC[]> {
    const r = await this.request<DigylogFC[]>("GET", "/fc");
    return r.ok ? (r.data ?? []) : [];
  }
  async getStores(): Promise<DigylogStore[]> {
    const r = await this.request<DigylogStore[]>("GET", "/stores");
    return r.ok ? (r.data ?? []) : [];
  }
  async getCities(hub?: number): Promise<DigylogCity[]> {
    const qs = hub ? `?hub=${hub}` : "";
    const r  = await this.request<DigylogCity[]>("GET", `/cities${qs}`);
    return r.ok ? (r.data ?? []) : [];
  }
  async getStatuses(): Promise<DigylogStatus[]> {
    const r = await this.request<DigylogStatus[]>("GET", "/statuses");
    return r.ok ? (r.data ?? []) : [];
  }
  async getDeliveryCost(network: number, city: number): Promise<DigylogDeliveryCost | null> {
    const r = await this.request<DigylogDeliveryCost>("GET", `/deliverycost?network=${network}&city=${city}`);
    return r.ok ? (r.data ?? null) : null;
  }
  async getPickupAreas(network: number): Promise<DigylogPickupArea[]> {
    const r = await this.request<DigylogPickupArea[]>("GET", `/pickup/areas?network=${network}`);
    return r.ok ? (r.data ?? []) : [];
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * POST /orders
   * Digylog returns various formats. This method normalises ALL of them
   * into { ok, orders: DigylogCreatedOrder[], rawResponse }.
   *
   * Observed response formats:
   *   - [ { num, tracking, bl? }, ... ]          (array — documented)
   *   - [ { num, traking, bl? }, ... ]            (typo in field name)
   *   - { data: [ {...} ] }                        (wrapped)
   *   - { orders: [ {...} ] }                      (wrapped)
   *   - { num, tracking }                          (single object)
   *   - { message: "...", errors: {...} }           (validation error — still 200)
   */
  async createOrders(body: DigylogCreateOrdersBody): Promise<{
    ok:           boolean;
    orders:       DigylogCreatedOrder[];
    error?:       string;
    rawResponse?: unknown;
  }> {
    console.log("📤 DIGYLOG PAYLOAD:", JSON.stringify(body, null, 2));

    const r = await this.request<unknown>("POST", "/orders", body);

    console.log("📥 DIGYLOG RESULT ok=%s status=%s rawText=%s",
      r.ok, r.status, (r.rawText ?? "").slice(0, 500));

    if (!r.ok) {
      return { ok: false, orders: [], error: r.error, rawResponse: r.rawText };
    }

    const raw = r.data;

    // ── Normalise an order item from any field name variant ─────────────────
    function fixTracking(item: Record<string, unknown>): DigylogCreatedOrder {
      return {
        ...item,
        tracking: String(item.tracking ?? item.traking ?? item.code ?? item.id ?? ""),
        bl:       item.bl !== undefined ? Number(item.bl) : undefined,
      } as DigylogCreatedOrder;
    }

    // ── Try every known format ────────────────────────────────────────────────
    let orders: DigylogCreatedOrder[] = [];

    if (Array.isArray(raw)) {
      // Check if the array items have isSuccess:false (Digylog validation errors)
      const errItems = (raw as Record<string, unknown>[]).filter(
        (item) => item.isSuccess === false || item.isSuccess === 0
      );
      if (errItems.length === raw.length) {
        // ALL items failed
        const msgs = errItems.map((item) => {
          const errs = Array.isArray(item.errors)
            ? (item.errors as string[]).join(" | ")
            : String(item.errors ?? item.message ?? "Erreur inconnue");
          return `[${String(item.num ?? "")}] ${errs}`;
        }).join(" | ");
        console.error("❌ DIGYLOG VALIDATION ERRORS:", msgs);
        return { ok: false, orders: [], error: msgs, rawResponse: raw };
      }
      // Some may have succeeded — take successful ones
      const successItems = (raw as Record<string, unknown>[]).filter(
        (item) => item.isSuccess !== false && item.isSuccess !== 0
      );
      orders = (successItems.length ? successItems : raw as Record<string, unknown>[]).map(fixTracking);
    } else if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;

      // Single validation error object
      if (obj.isSuccess === false || obj.isSuccess === 0) {
        const errs = Array.isArray(obj.errors)
          ? (obj.errors as string[]).join(" | ")
          : String(obj.errors ?? obj.message ?? "Erreur Digylog");
        console.error("❌ DIGYLOG VALIDATION ERROR:", errs);
        return { ok: false, orders: [], error: errs, rawResponse: raw };
      }

      if (obj.message || (obj.errors && !obj.tracking && !obj.traking)) {
        const errMsg = String(obj.message ?? JSON.stringify(obj.errors ?? obj));
        console.error("❌ DIGYLOG VALIDATION ERROR:", errMsg);
        return { ok: false, orders: [], error: `Digylog: ${errMsg}`, rawResponse: raw };
      }

      if (Array.isArray(obj.data)) {
        orders = (obj.data as Record<string, unknown>[]).map(fixTracking);
      } else if (Array.isArray(obj.orders)) {
        orders = (obj.orders as Record<string, unknown>[]).map(fixTracking);
      } else if (obj.tracking ?? obj.traking) {
        orders = [fixTracking(obj)];
      } else {
        console.error("❌ DIGYLOG CREATED WITHOUT TRACKING — unknown format:", JSON.stringify(raw));
        return {
          ok: false, orders: [],
          error: `Format de réponse Digylog inconnu: ${JSON.stringify(raw).slice(0, 300)}`,
          rawResponse: raw,
        };
      }
    }

    // Filter out items with no tracking
    const withTracking = orders.filter((o) => o.tracking && o.tracking.length > 0);
    if (!withTracking.length) {
      console.error("❌ DIGYLOG CREATED WITHOUT TRACKING — orders:", JSON.stringify(orders));
      return {
        ok: false, orders,
        error: `Digylog a créé ${orders.length} colis sans tracking. Réponse: ${JSON.stringify(orders).slice(0, 300)}`,
        rawResponse: raw,
      };
    }

    return { ok: true, orders: withTracking, rawResponse: raw };
  }

  /** PUT /orders/send — Send orders created with status=0. Returns { bl } */
  async sendOrders(trackings: string[]): Promise<{ ok: boolean; bl?: number; error?: string }> {
    const r = await this.request<DigylogSendResponse>("PUT", "/orders/send", { orders: trackings });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, bl: r.data?.bl };
  }

  /** GET /order/:tracking/infos */
  async getOrderInfos(tracking: string): Promise<DigylogOrderInfo | null> {
    const r = await this.request<DigylogOrderInfo>("GET", `/order/${tracking}/infos`);
    return r.ok ? (r.data ?? null) : null;
  }

  /** GET /order/:tracking/refs */
  async getOrderRefs(tracking: string): Promise<DigylogOrderRef[]> {
    const r = await this.request<DigylogOrderRef[]>("GET", `/order/${tracking}/refs`);
    return r.ok ? (r.data ?? []) : [];
  }

  /** GET /historics?trackings=S001,S002 */
  async getHistorics(trackings: string[]): Promise<DigylogHistorics> {
    const qs = `trackings=${trackings.join(",")}`;
    const r  = await this.request<DigylogHistorics>("GET", `/historics?${qs}`);
    return r.ok ? (r.data ?? {}) : {};
  }

  // ── Labels & BL ────────────────────────────────────────────────────────────

  /** POST /labels — format 3 = thermal 100×100 */
  async downloadLabels(params: {
    orders?: string[];
    bl?:     number;
    format?: 1 | 2 | 3 | 4 | 5;
  }): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
    const body: Record<string, unknown> = { format: params.format ?? 3 };
    if (params.bl     !== undefined) body.bl     = params.bl;
    if (params.orders !== undefined) body.orders = params.orders;
    const r = await this.request<never>("POST", "/labels", body, true);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, blob: r.blob };
  }

  /** GET /bl/:id/pdf — returns PDF blob */
  async downloadBlPdf(blId: number): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
    const r = await this.request<never>("GET", `/bl/${blId}/pdf`, undefined, true);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, blob: r.blob };
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  /** PUT /webhook */
  async registerWebhook(url: string): Promise<{ ok: boolean; error?: string }> {
    const r = await this.request<unknown>("PUT", "/webhook", { url });
    return { ok: r.ok, error: r.error };
  }

  /** PUT /order/:tracking/status — test webhook event */
  async testWebhookStatus(tracking: string, statusId: number, postponedTo?: string): Promise<{ ok: boolean; error?: string }> {
    const body: Record<string, unknown> = { status: statusId };
    if (postponedTo) body.postponedTo = postponedTo;
    const r = await this.request<unknown>("PUT", `/order/${tracking}/status`, body);
    return { ok: r.ok, error: r.error };
  }

  /** Ping — GET /networks */
  async testConnection(): Promise<{ ok: boolean; message: string; networks?: DigylogNetwork[] }> {
    const r = await this.request<DigylogNetwork[]>("GET", "/networks");
    if (!r.ok)        return { ok: false, message: r.error ?? "Échec de connexion" };
    const nets = r.data ?? [];
    if (!nets.length) return { ok: false, message: "Connexion OK mais aucun réseau disponible — vérifiez votre compte Digylog" };
    return { ok: true, message: `Connecté — ${nets.length} réseau(x)`, networks: nets };
  }
}

// ── Factories ──────────────────────────────────────────────────────────────────

export function createDigylogClient(tokenOverride?: string): DigylogClient {
  const token   = (tokenOverride ?? process.env.DIGYLOG_TOKEN ?? "").trim();
  const baseUrl = process.env.DIGYLOG_BASE_URL ?? "https://api.digylog.com/api/v2/seller";
  const referer = process.env.DIGYLOG_REFERER  ?? "https://apiseller.digylog.com";
  return new DigylogClient(token, baseUrl, referer);
}

/**
 * Server-side factory: reads config from delivery_stores (multi-store).
 * Falls back to digylog_settings → env for backward compatibility.
 * @param storeId — optional store UUID from delivery_stores table
 */
export async function createDigylogClientFromDB(storeId?: string | null): Promise<DigylogClient> {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");

  // 1. Try delivery_stores (new multi-store architecture)
  const storeQuery = storeId
    ? supabaseAdmin.from("delivery_stores").select("api_token, api_base_url, metadata").eq("id", storeId).eq("is_active", true).maybeSingle()
    : supabaseAdmin.from("delivery_stores").select("api_token, api_base_url, metadata").eq("is_active", true).eq("is_default", true).maybeSingle();

  const { data: storeData } = await storeQuery;
  const store = storeData as { api_token: string | null; api_base_url: string | null; metadata: Record<string, unknown> | null } | null;

  if (store?.api_token) {
    const token   = store.api_token.trim();
    const baseUrl = (store.api_base_url ?? process.env.DIGYLOG_BASE_URL ?? "https://api.digylog.com/api/v2/seller").trim();
    const referer = (store.metadata?.referer as string | undefined) ?? process.env.DIGYLOG_REFERER ?? "https://apiseller.digylog.com";
    return new DigylogClient(token, baseUrl, referer);
  }

  // 2. Fallback: digylog_settings table (legacy)
  const { data: legacy } = await supabaseAdmin
    .from("digylog_settings")
    .select("token, referer")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row       = legacy as { token?: string; referer?: string } | null;
  const dbToken   = (row?.token   ?? "").trim();
  const dbReferer = (row?.referer ?? "").trim();
  const token     = dbToken  || (process.env.DIGYLOG_TOKEN  ?? "").trim();
  const baseUrl   = process.env.DIGYLOG_BASE_URL ?? "https://api.digylog.com/api/v2/seller";
  const referer   = dbReferer || process.env.DIGYLOG_REFERER || "https://apiseller.digylog.com";
  return new DigylogClient(token, baseUrl, referer);
}

export type { DigylogWebhookPayload };
