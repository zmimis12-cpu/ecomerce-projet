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
  productId: string;     // requis: sans ça TikTok signale "Content ID is missing"
  productName?: string;
}

export async function sendTikTokCompletePayment(input: TikTokPurchaseInput): Promise<{ ok: boolean; error?: string }> {
  const url = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

  const userData: Record<string, unknown> = {
    // TikTok exige le format E.164 AVEC le "+" avant hachage (contrairement
    // à Meta qui exige le numéro SANS le "+") — bug trouvé en test réel.
    phone: [sha256(toInternationalMorocco(input.phone))],
  };
  if (input.ttp) userData.ttp = input.ttp;
  if (input.clientIp) userData.ip = input.clientIp;
  if (input.clientUserAgent) userData.user_agent = input.clientUserAgent;

  const body = {
    event_source: "web",
    event_source_id: input.pixelId,
    data: [
      {
        event: "CompletePayment",
        event_time: Math.floor(Date.now() / 1000),
        event_id: `${input.eventId}-cp`,
        user: userData,
        properties: {
          value: input.value, currency: input.currency,
          content_id: input.productId,
          content_type: "product",
          contents: [{ content_id: input.productId, content_name: input.productName ?? "" }],
        },
        page: input.ttclid ? { url: `?ttclid=${input.ttclid}` } : undefined,
      },
      // TikTok exige précisément l'événement "Purchase" pour son funnel
      // e-commerce standard (Diagnostics → "Missing events" le réclame
      // explicitement, même si CompletePayment est aussi un événement valide).
      {
        event: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: `${input.eventId}-purchase`,
        user: userData,
        properties: {
          value: input.value, currency: input.currency,
          content_id: input.productId,
          content_type: "product",
          contents: [{ content_id: input.productId, content_name: input.productName ?? "" }],
        },
        page: input.ttclid ? { url: `?ttclid=${input.ttclid}` } : undefined,
      },
    ],
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

/** Token pour l'Events API : compte TikTok connecté (OAuth, Réglages → Pubs) en priorité, sinon ancien réglage. */
export async function getTikTokEventsToken(): Promise<string | null> {
  try {
    const { activeTikTokAccounts } = await import("@/lib/ads/tiktok-accounts");
    const acc = (await activeTikTokAccounts()).find((a) => a.token);
    if (acc?.token) return acc.token;
  } catch { /* ancien réglage */ }
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const { data } = await supabaseAdmin.from("ad_platform_settings").select("access_token, is_active").eq("platform", "tiktok").maybeSingle();
  const s = data as { access_token: string; is_active: boolean } | null;
  return s?.is_active && s.access_token ? s.access_token : null;
}

/** Commande reçue (formulaire) → « SubmitForm » + « PlaceAnOrder » côté SERVEUR.
 *  event_id SubmitForm = `lead_<n° commande>` = celui du pixel navigateur → TikTok déduplique. */
export async function sendTikTokLead(input: {
  pixelId: string; accessToken: string; value: number; phone: string; orderNumber: string;
  ttp?: string | null; ttclid?: string | null; clientIp?: string | null; clientUserAgent?: string | null;
  productId: string; productName?: string; pageUrl?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const user: Record<string, unknown> = { phone: [sha256(toInternationalMorocco(input.phone))] };
  if (input.ttp) user.ttp = input.ttp;
  if (input.ttclid) user.ttclid = input.ttclid;
  if (input.clientIp) user.ip = input.clientIp;
  if (input.clientUserAgent) user.user_agent = input.clientUserAgent;
  const properties = {
    value: input.value, currency: "MAD", content_id: input.productId, content_type: "product",
    contents: [{ content_id: input.productId, content_name: input.productName ?? "", quantity: 1, price: input.value }],
  };
  const page = input.pageUrl ? { url: input.pageUrl } : undefined;
  const t = Math.floor(Date.now() / 1000);
  const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Access-Token": input.accessToken },
    body: JSON.stringify({
      event_source: "web", event_source_id: input.pixelId,
      data: [
        { event: "SubmitForm", event_time: t, event_id: `lead_${input.orderNumber}`, user, properties, page },
        { event: "PlaceAnOrder", event_time: t, event_id: `order_${input.orderNumber}`, user, properties, page },
      ],
    }),
  }).catch((e) => ({ ok: false, json: async () => ({ message: String(e) }) }) as unknown as Response);
  const json = await res.json().catch(() => ({})) as { code?: number; message?: string };
  if (!res.ok || (json.code !== undefined && json.code !== 0)) return { ok: false, error: `TikTok ${json.code ?? ""} ${json.message ?? ""}` };
  return { ok: true };
}
