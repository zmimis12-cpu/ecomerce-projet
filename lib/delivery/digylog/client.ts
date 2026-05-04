/**
 * lib/delivery/digylog/client.ts
 * Digylog API v2.4 client — server-side only.
 */
import type {
  DigylogNetwork, DigylogFC, DigylogStore, DigylogCity, DigylogStatus,
  DigylogCreateOrdersBody, DigylogCreatedOrder, DigylogSendResponse,
  DigylogOrderInfo, DigylogOrderRef, DigylogHistorics,
  DigylogDeliveryCost, DigylogPickupArea, DigylogWebhookPayload,
} from "./types";

export class DigylogClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly referer: string;

  constructor(
    token: string,
    baseUrl: string = "https://api.digylog.com/api/v2/seller",
    referer: string = "https://apiseller.digylog.com"
  ) {
    this.token = (token ?? "").trim();
    this.baseUrl = baseUrl.replace(/\/$/, "").trim();
    this.referer = referer.trim();
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    returnBlob = false
  ): Promise<{ ok: boolean; data?: T; blob?: Blob; error?: string; status?: number }> {
    try {
      if (!this.token) {
        return { ok: false, error: "DIGYLOG_TOKEN is empty", status: 0 };
      }

      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Referer: this.referer,
          "Content-Type": "application/json",
          Accept: returnBlob ? "application/pdf" : "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          error: `HTTP ${res.status}: ${text.slice(0, 300)}`,
          status: res.status,
        };
      }

      if (returnBlob) {
        return { ok: true, blob: await res.blob(), status: res.status };
      }

      const data = (await res.json()) as T;
      return { ok: true, data, status: res.status };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  }

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
    const r = await this.request<DigylogCity[]>("GET", `/cities${qs}`);
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

  async createOrders(body: DigylogCreateOrdersBody): Promise<{
    ok: boolean;
    orders: DigylogCreatedOrder[];
    error?: string;
  }> {
    const r = await this.request<DigylogCreatedOrder[]>("POST", "/orders", body);
    if (!r.ok) return { ok: false, orders: [], error: r.error };
    return { ok: true, orders: r.data ?? [] };
  }

  async sendOrders(trackings: string[]): Promise<{ ok: boolean; bl?: number; error?: string }> {
    const r = await this.request<DigylogSendResponse>("PUT", "/orders/send", { orders: trackings });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, bl: r.data?.bl };
  }

  async getOrderInfos(tracking: string): Promise<DigylogOrderInfo | null> {
    const r = await this.request<DigylogOrderInfo>("GET", `/order/${tracking}/infos`);
    return r.ok ? (r.data ?? null) : null;
  }

  async getOrderRefs(tracking: string): Promise<DigylogOrderRef[]> {
    const r = await this.request<DigylogOrderRef[]>("GET", `/order/${tracking}/refs`);
    return r.ok ? (r.data ?? []) : [];
  }

  async getHistorics(trackings: string[]): Promise<DigylogHistorics> {
    const qs = `trackings=${encodeURIComponent(trackings.join(","))}`;
    const r = await this.request<DigylogHistorics>("GET", `/historics?${qs}`);
    return r.ok ? (r.data ?? {}) : {};
  }

  async downloadLabels(params: {
    orders?: string[];
    bl?: number;
    format?: 1 | 2 | 3 | 4 | 5;
  }): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
    const body: Record<string, unknown> = {};
    if (params.bl) body.bl = params.bl;
    if (params.orders) body.orders = params.orders;
    if (params.format) body.format = params.format;

    const r = await this.request<never>("POST", "/labels", body, true);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, blob: r.blob };
  }

  async downloadBlPdf(blId: number): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
    const r = await this.request<never>("GET", `/bl/${blId}/pdf`, undefined, true);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, blob: r.blob };
  }

  async registerWebhook(url: string): Promise<{ ok: boolean; error?: string }> {
    const r = await this.request<unknown>("PUT", "/webhook", { url });
    return { ok: r.ok, error: r.error };
  }

  async testWebhookStatus(
    tracking: string,
    statusId: number,
    postponedTo?: string
  ): Promise<{ ok: boolean; error?: string }> {
    const body: Record<string, unknown> = { status: statusId };
    if (postponedTo) body.postponedTo = postponedTo;
    const r = await this.request<unknown>("PUT", `/order/${tracking}/status`, body);
    return { ok: r.ok, error: r.error };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const r = await this.request<DigylogNetwork[]>("GET", "/networks");

    const tokenPreview = this.token
      ? `${this.token.slice(0, 6)}...${this.token.slice(-4)}`
      : "EMPTY";

    if (!r.ok) {
      return {
        ok: false,
        message: `Erreur Digylog: ${r.status ?? "NO_STATUS"} — ${r.error ?? "Unknown"} — token=${tokenPreview}`,
      };
    }

    const networks = Array.isArray(r.data) ? r.data : [];

    return {
      ok: true,
      message: `Connecté — ${networks.length} réseau(x) — token=${tokenPreview}`,
    };
  }
}

export function createDigylogClient(tokenOverride?: string): DigylogClient {
  const token = tokenOverride ?? process.env.DIGYLOG_TOKEN ?? "";
  const baseUrl = process.env.DIGYLOG_BASE_URL ?? "https://api.digylog.com/api/v2/seller";
  const referer = process.env.DIGYLOG_REFERER ?? "https://apiseller.digylog.com";
  return new DigylogClient(token, baseUrl, referer);
}

export async function createDigylogClientFromDB(): Promise<DigylogClient> {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");

  const { data } = await supabaseAdmin
    .from("digylog_settings")
    .select("token, referer")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const dbToken = (data as { token?: string; referer?: string } | null)?.token ?? "";
  const dbReferer = (data as { token?: string; referer?: string } | null)?.referer ?? "";

  const token = dbToken || process.env.DIGYLOG_TOKEN || "";
  const baseUrl = process.env.DIGYLOG_BASE_URL ?? "https://api.digylog.com/api/v2/seller";
  const referer = dbReferer || process.env.DIGYLOG_REFERER || "https://apiseller.digylog.com";

  return new DigylogClient(token, baseUrl, referer);
}

export type { DigylogWebhookPayload };