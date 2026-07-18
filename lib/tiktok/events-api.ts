/**
 * lib/tiktok/events-api.ts
 * Envoie l'événement "CompletePayment" à TikTok côté SERVEUR, au vrai moment
 * de conversion (commande marquée payée) — équivalent TikTok du Purchase Meta.
 * Réutilise le token déjà stocké pour le sync TikTok Ads (ad_platform_settings).
 */
import crypto from "crypto";
import { toInternationalMorocco } from "@/lib/delivery/phone-utils";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export interface TikTokPurchaseInput {
  pixelId: string;       // TikTok "Pixel Code"
  accessToken: string;
  value: number;
  currency: string;
  phone: string;
  ttp?: string | null;   // cookie _ttp
  ttclid?: string | null;
  clientIp?: string | null;
  clientUserAgent?: string | null;
  eventId: string;       // = order id, dédup
}

export async function sendTikTokCompletePayment(input: TikTokPurchaseInput): Promise<{ ok: boolean; error?: string }> {
  const url = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

  const userData: Record<string, unknown> = {
    phone: [sha256(toInternationalMorocco(input.phone).replace("+", ""))],
  };
  if (input.ttp) userData.ttp = input.ttp;
  if (input.clientIp) userData.ip = input.clientIp;
  if (input.clientUserAgent) userData.user_agent = input.clientUserAgent;

  const body = {
    event_source: "web",
    event_source_id: input.pixelId,
    data: [{
      event: "CompletePayment",
      event_time: Math.floor(Date.now() / 1000),
      event_id: input.eventId,
      user: userData,
      properties: { value: input.value, currency: input.currency },
      page: input.ttclid ? { url: `?ttclid=${input.ttclid}` } : undefined,
    }],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Access-Token": input.accessToken },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    const msg = (json as { message?: string })?.message ?? res.statusText;
    return { ok: false, error: `TikTok Events API ${res.status}: ${msg}` };
  }
  const json = await res.json().catch(() => ({}));
  const code = (json as { code?: number })?.code;
  if (code !== undefined && code !== 0) {
    return { ok: false, error: `TikTok Events API error code ${code}: ${(json as { message?: string }).message}` };
  }
  return { ok: true };
}
