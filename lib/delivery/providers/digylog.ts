/**
 * lib/delivery/providers/digylog.ts
 * Digylog delivery company API adapter.
 *
 * NOTE: Digylog API docs not publicly available.
 * This is a clean adapter ready to implement once API credentials/docs are provided.
 * All methods have proper error handling and return typed results.
 *
 * To activate: set DIGYLOG_API_KEY in Vercel environment variables.
 */
import {
  DeliveryProvider, ShipmentPayload, ShipmentResult,
  TrackingEvent, InvoiceListItem, InvoiceDetail, DocumentResult,
} from "./base";
import { STATUS_MAP } from "../status-map";

export class DigylogProvider extends DeliveryProvider {
  readonly slug = "digylog";
  readonly name = "Digylog";

  private readonly apiKey:  string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl = "https://api.digylog.com") {
    super();
    this.apiKey  = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private headers() {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`,
      "Accept": "application/json",
    };
  }

  private async request<T>(
    method: string, path: string, body?: unknown
  ): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers(),
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}`, status: res.status };
      }

      const data = await res.json() as T;
      return { ok: true, data, status: res.status };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Network error" };
    }
  }

  // ── Create shipment ──────────────────────────────────────────────────────────
  async createShipment(payload: ShipmentPayload): Promise<ShipmentResult> {
    // TODO: replace endpoint + payload shape once Digylog API docs available
    const res = await this.request<{
      tracking_number?: string;
      id?: string;
      barcode?: string;
      error?: string;
    }>("POST", "/api/v1/colis", {
      // Digylog field names — adjust when API docs confirmed
      reference:     payload.orderNumber,
      nom_client:    payload.customerName,
      telephone:     payload.customerPhone,
      ville:         payload.customerCity,
      adresse:       payload.customerAddress,
      montant_cod:   payload.codAmount,
      remarque:      payload.notes ?? "",
      designation:   payload.productName ?? "Produit",
      nb_articles:   payload.quantity ?? 1,
    });

    if (!res.ok) {
      return { success: false, error: res.error ?? "Digylog API error" };
    }

    return {
      success:        true,
      trackingNumber: res.data?.tracking_number ?? res.data?.barcode,
      externalOrderId:String(res.data?.id ?? ""),
      rawPayload:     res.data as Record<string, unknown>,
    };
  }

  // ── Get shipment status ──────────────────────────────────────────────────────
  async getShipmentStatus(trackingNumber: string): Promise<TrackingEvent | null> {
    const res = await this.request<{
      statut?: string;
      status?: string;
      updated_at?: string;
    }>("GET", `/api/v1/colis/${trackingNumber}`);

    if (!res.ok || !res.data) return null;

    const externalStatus = String(res.data.statut ?? res.data.status ?? "");
    return {
      trackingNumber,
      externalStatus,
      internalStatus: STATUS_MAP[externalStatus.toLowerCase()] ?? "unknown",
      eventTime:      res.data.updated_at ?? new Date().toISOString(),
      rawPayload:     res.data as Record<string, unknown>,
    };
  }

  // ── List shipments ───────────────────────────────────────────────────────────
  async listShipments(params: { from?: string; to?: string; page?: number }): Promise<TrackingEvent[]> {
    const qs = new URLSearchParams();
    if (params.from) qs.set("date_debut", params.from);
    if (params.to)   qs.set("date_fin",   params.to);
    if (params.page) qs.set("page",       String(params.page));

    const res = await this.request<unknown[]>("GET", `/api/v1/colis?${qs}`);
    if (!res.ok || !Array.isArray(res.data)) return [];

    return res.data.map((item) => {
      const o = item as Record<string, unknown>;
      const ext = String(o.statut ?? o.status ?? "");
      return {
        trackingNumber: String(o.tracking_number ?? o.barcode ?? ""),
        externalStatus: ext,
        internalStatus: STATUS_MAP[ext.toLowerCase()] ?? "unknown",
        eventTime:      String(o.updated_at ?? o.date ?? ""),
        rawPayload:     o,
      };
    });
  }

  // ── Invoices ─────────────────────────────────────────────────────────────────
  async getInvoices(params: { from?: string; to?: string }): Promise<InvoiceListItem[]> {
    const qs = new URLSearchParams();
    if (params.from) qs.set("date_debut", params.from);
    if (params.to)   qs.set("date_fin",   params.to);

    const res = await this.request<unknown[]>("GET", `/api/v1/factures?${qs}`);
    if (!res.ok || !Array.isArray(res.data)) return [];

    return res.data.map((item) => {
      const o = item as Record<string, unknown>;
      return {
        invoiceNumber: String(o.numero ?? o.id ?? ""),
        invoiceDate:   String(o.date ?? ""),
        totalAmount:   Number(o.montant ?? o.total ?? 0),
        status:        String(o.statut ?? ""),
      };
    });
  }

  async getInvoiceDetails(invoiceNumber: string): Promise<InvoiceDetail | null> {
    const res = await this.request<Record<string, unknown>>(
      "GET", `/api/v1/factures/${invoiceNumber}`
    );
    if (!res.ok || !res.data) return null;

    const o     = res.data;
    const items = (Array.isArray(o.colis) ? o.colis : []) as Record<string, unknown>[];

    return {
      invoiceNumber,
      invoiceDate:  String(o.date ?? ""),
      totalAmount:  Number(o.montant ?? 0),
      items: items.map((c) => ({
        trackingNumber: String(c.tracking ?? c.barcode ?? ""),
        codAmount:      Number(c.montant_cod ?? 0),
        deliveryFee:    Number(c.frais_livraison ?? 0),
        returnFee:      Number(c.frais_retour ?? 0),
        amountPaid:     Number(c.montant_paye ?? c.montant ?? 0),
        status:         String(c.statut ?? ""),
      })),
      rawPayload: o,
    };
  }

  // ── Documents ────────────────────────────────────────────────────────────────
  async getDeliveryBon(date: string): Promise<DocumentResult> {
    return this.fetchDocument("/api/v1/bons/livraison", date);
  }
  async getPickupBon(date: string): Promise<DocumentResult> {
    return this.fetchDocument("/api/v1/bons/ramassage", date);
  }
  async getReturnBon(date: string): Promise<DocumentResult> {
    return this.fetchDocument("/api/v1/bons/retour", date);
  }

  private async fetchDocument(path: string, date: string): Promise<DocumentResult> {
    const res = await this.request<{ url?: string; id?: string }>(
      "GET", `${path}?date=${date}`
    );
    if (!res.ok) return { success: false, error: res.error };
    return {
      success:    true,
      fileUrl:    res.data?.url,
      externalId: String(res.data?.id ?? ""),
      rawPayload: res.data as Record<string, unknown>,
    };
  }
}
