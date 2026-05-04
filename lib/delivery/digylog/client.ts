/**
 * lib/delivery/digylog/client.ts
 * Digylog API v2.4 client — server-side only.
 *
 * Auth: Authorization: bearer <TOKEN>
 * Required headers: Referer, Content-Type, Accept
 *
 * NEVER import this in client components.
 * Token comes from env DIGYLOG_TOKEN or DB.
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
    this.token   = token;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.referer = referer;
  }

  // ─── Core request ─────────────────────────────────────────────────────────
  async request<T>(
    method: string,
    path:   string,
    body?:  unknown,
    returnBlob = false
  ): Promise<{ ok: boolean; data?: T; blob?: Blob; error?: string; status?: number }> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "Authorization": `bearer ${this.token}`,
          "Referer":       this.referer,
          "Content-Type":  "application/json",
          "Accept":        returnBlob ? "application/pdf" : "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[digylog] ${method} ${path} → HTTP ${res.status}:`, text.slice(0, 300));
        return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}`, status: res.status };
      }

      if (returnBlob) {
        const blob = await res.blob();
        return { ok: true, blob };
      }

      const data = await res.json() as T;
      return { ok: true, data, status: res.status };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      console.error(`[digylog] ${method} ${path} →`, msg);
      return { ok: false, error: msg };
    }
  }

  // ─── Reference data ────────────────────────────────────────────────────────

  /** GET /networks */
  async getNetworks(): Promise<DigylogNetwork[]> {
    const r = await this.request<DigylogNetwork[]>("GET", "/networks");
    return r.ok ? (r.data ?? []) : [];
  }

  /** GET /fc */
  async getFulfillmentCenters(): Promise<DigylogFC[]> {
    const r = await this.request<DigylogFC[]>("GET", "/fc");
    return r.ok ? (r.data ?? []) : [];
  }

  /** GET /stores */
  async getStores(): Promise<DigylogStore[]> {
    const r = await this.request<DigylogStore[]>("GET", "/stores");
    return r.ok ? (r.data ?? []) : [];
  }

  /** GET /cities */
  async getCities(hub?: number): Promise<DigylogCity[]> {
    const qs = hub ? `?hub=${hub}` : "";
    const r  = await this.request<DigylogCity[]>("GET", `/cities${qs}`);
    return r.ok ? (r.data ?? []) : [];
  }

  /** GET /statuses */
  async getStatuses(): Promise<DigylogStatus[]> {
    const r = await this.request<DigylogStatus[]>("GET", "/statuses");
    return r.ok ? (r.data ?? []) : [];
  }

  /** GET /deliverycost */
  async getDeliveryCost(network: number, city: number): Promise<DigylogDeliveryCost | null> {
    const r = await this.request<DigylogDeliveryCost>("GET", `/deliverycost?network=${network}&city=${city}`);
    return r.ok ? (r.data ?? null) : null;
  }

  /** GET /pickup/areas */
  async getPickupAreas(network: number): Promise<DigylogPickupArea[]> {
    const r = await this.request<DigylogPickupArea[]>("GET", `/pickup/areas?network=${network}`);
    return r.ok ? (r.data ?? []) : [];
  }

  // ─── Orders ───────────────────────────────────────────────────────────────

  /**
   * POST /orders — Create one or more orders.
   * Returns array of { num, tracking, bl? }
   * status=1 means add + send immediately (returns bl).
   * status=0 means add only (must PUT /orders/send separately).
   */
  async createOrders(body: DigylogCreateOrdersBody): Promise<{
    ok: boolean;
    orders: DigylogCreatedOrder[];
    error?: string;
  }> {
    const r = await this.request<DigylogCreatedOrder[]>("POST", "/orders", body);
    if (!r.ok) return { ok: false, orders: [], error: r.error };
    return { ok: true, orders: r.data ?? [] };
  }

  /**
   * PUT /orders/send — Send orders that were created with status=0.
   * Returns { bl: number }
   */
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

  /**
   * GET /historics?trackings=S001,S002
   * Returns Record<tracking, HistoricEntry[]>
   */
  async getHistorics(trackings: string[]): Promise<DigylogHistorics> {
    const qs = `trackings=${trackings.join(",")}`;
    const r  = await this.request<DigylogHistorics>("GET", `/historics?${qs}`);
    return r.ok ? (r.data ?? {}) : {};
  }

  // ─── Labels & BL ──────────────────────────────────────────────────────────

  /**
   * POST /labels — Download PDF labels.
   * Provide either bl (BL id) or orders (array of trackings).
   * format: 1=A4x4, 2=A4x8, 3=thermal100x100, 4=thermal70x100, 5=thermal60x100
   */
  async downloadLabels(params: {
    orders?: string[];
    bl?: number;
    format?: 1 | 2 | 3 | 4 | 5;
  }): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
    const body: Record<string, unknown> = {};
    if (params.bl)     body.bl     = params.bl;
    if (params.orders) body.orders = params.orders;
    if (params.format) body.format = params.format;

    const r = await this.request<never>("POST", "/labels", body, true);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, blob: r.blob };
  }

  /**
   * GET /bl/:id/pdf — Download BL PDF.
   * Response is a Blob (PDF).
   */
  async downloadBlPdf(blId: number): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
    const r = await this.request<never>("GET", `/bl/${blId}/pdf`, undefined, true);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, blob: r.blob };
  }

  // ─── Webhook ──────────────────────────────────────────────────────────────

  /**
   * PUT /webhook — Register or update webhook URL.
   * Digylog will POST to this URL on status changes.
   */
  async registerWebhook(url: string): Promise<{ ok: boolean; error?: string }> {
    const r = await this.request<unknown>("PUT", "/webhook", { url });
    return { ok: r.ok, error: r.error };
  }

  /**
   * PUT /order/:tracking/status — Test webhook event (dev only).
   * Triggers a webhook call to registered URL.
   */
  async testWebhookStatus(
    tracking:    string,
    statusId:    number,
    postponedTo?: string
  ): Promise<{ ok: boolean; error?: string }> {
    const body: Record<string, unknown> = { status: statusId };
    if (postponedTo) body.postponedTo = postponedTo;
    const r = await this.request<unknown>("PUT", `/order/${tracking}/status`, body);
    return { ok: r.ok, error: r.error };
  }

  // ─── Test connection ──────────────────────────────────────────────────────

  /** Ping Digylog by fetching networks — fast sanity check */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const networks = await this.getNetworks();
    if (networks.length > 0) {
      return { ok: true, message: `Connecté — ${networks.length} réseau(x) disponible(s)` };
    }
    return { ok: false, message: "Échec de connexion — vérifiez votre token Digylog" };
  }
}

// ─── Singleton factory ────────────────────────────────────────────────────────
export function createDigylogClient(): DigylogClient {
  const token   = process.env.DIGYLOG_TOKEN ?? "";
  const baseUrl = process.env.DIGYLOG_BASE_URL ?? "https://api.digylog.com/api/v2/seller";
  const referer = process.env.DIGYLOG_REFERER ?? "https://apiseller.digylog.com";
  return new DigylogClient(token, baseUrl, referer);
}

export type { DigylogWebhookPayload };
