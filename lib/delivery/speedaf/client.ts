/**
 * Client HTTP Speedaf Open API v1.3 (server-only).
 * POST {base}/{path}?appCode=…&timestamp=<ms>  — corps : {"data": …} en text/plain.
 * La réponse peut être doublement enveloppée : {success, data:{success, data}}.
 */
import { SPEEDAF_BASE_URL, type SpeedafConfig } from "./types";

export type SpeedafResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export class SpeedafClient {
  constructor(private cfg: SpeedafConfig) {}

  private async call<T>(path: string, data: unknown): Promise<SpeedafResult<T>> {
    if (!this.cfg.appCode) return { ok: false, error: "appCode Speedaf manquant (Paramètres → Livraison → Speedaf)." };
    const url = `${SPEEDAF_BASE_URL[this.cfg.env]}/${path}?appCode=${encodeURIComponent(this.cfg.appCode)}&timestamp=${Date.now()}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ data }),
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
      const text = await res.text();
      let json: Record<string, unknown>;
      try { json = JSON.parse(text); } catch { return { ok: false, error: `Réponse Speedaf invalide (HTTP ${res.status}) : ${text.slice(0, 200)}` }; }
      const err = (j: Record<string, unknown>) => {
        const e = j.error as { code?: string; message?: string } | string | null;
        return typeof e === "string" ? { msg: e, code: undefined } : { msg: e?.message ?? "Erreur Speedaf", code: e?.code };
      };
      if (json.success === false) { const e = err(json); return { ok: false, error: e.msg, code: e.code }; }
      let payload = json.data as unknown;
      // Double enveloppe {success, error, data}
      if (payload && typeof payload === "object" && !Array.isArray(payload) && "success" in (payload as object) && "data" in (payload as object)) {
        const inner = payload as Record<string, unknown>;
        if (inner.success === false) { const e = err(inner); return { ok: false, error: e.msg, code: e.code }; }
        payload = inner.data;
      }
      return { ok: true, data: payload as T };
    } catch (e) {
      return { ok: false, error: `Speedaf injoignable : ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  createOrder(order: Record<string, unknown>) {
    return this.call<{ success: boolean; billCode?: string; message?: string | null; customerOrderNo?: string }>("express/order/v2/createOrder", order);
  }
  cancelOrder(billCode: string, reason: string) {
    return this.call<{ billCode: string; success: boolean; message?: string }[]>("express/order/v2/cancelOrder",
      [{ customerCode: this.cfg.customerCode, billCode, cancelReason: reason }]);
  }
  printLabels(waybills: string[]) {
    return this.call<{ urls?: string[]; orderLabels?: { waybillNo: string; labelUrl?: string; labelBase64?: string }[] }>(
      "express/order/v2/print", { waybillNoList: waybills, labelType: this.cfg.labelType, withLogo: true });
  }
  track(mailNos: string[]) {
    return this.call<SpeedafTrackResult[]>("express/track/v2/query", { mailNoList: mailNos });
  }
  getAreaTree() {
    return this.call<SpeedafArea | SpeedafArea[]>("common/area/v2/getTreeByCountryCode", { countryCode: "MA" });
  }
  subscribeWebhook(callbackUrl: string) {
    return this.call<{ callbackUrl: string }>("express/track/webhook/subscribe",
      { customerCode: this.cfg.customerCode, callbackUrl, appCode: this.cfg.appCode });
  }
}

export type SpeedafTrack = {
  mailNo: string; action: string; subAction?: string; actionName?: string;
  message?: string; msgEng?: string; msgLoc?: string; time: string; timezone?: number; pictureUrl?: string;
};
export type SpeedafTrackResult = { mailNo: string; tracks: SpeedafTrack[] };
export type SpeedafArea = { code: string; name: string; enName?: string; frName?: string; arName?: string; type: number; children?: SpeedafArea[] };
