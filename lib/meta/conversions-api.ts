/**
 * lib/meta/conversions-api.ts
 * Envoie l'événement "Purchase" à Meta côté SERVEUR, au vrai moment de
 * conversion (commande marquée payée) — pas au moment de la commande.
 * Réutilise le token déjà stocké pour le sync Meta Ads (ad_platform_settings).
 */
import crypto from "crypto";
import { toInternationalMorocco } from "@/lib/delivery/phone-utils";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/** Meta exige: minuscule, sans accents, sans espaces/ponctuation, alphabet romain */
function normalizeForMeta(value: string): string {
  return value
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents (é→e, etc.)
    .toLowerCase()
    .replace(/[^a-z]/g, ""); // garde uniquement les lettres
}

export interface PurchaseEventInput {
  pixelId: string;
  accessToken: string;
  value: number;
  currency: string;
  phone: string;          // sera hashé (SHA-256), jamais envoyé en clair
  city: string;
  fullName?: string;      // prénom + nom — améliore le score de matching Meta
  country?: string;       // défaut "ma"
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  clientUserAgent?: string | null;
  eventId: string;        // = order id, pour dédupliquer si rejoué
}

export async function sendMetaPurchaseEvent(input: PurchaseEventInput): Promise<{ ok: boolean; error?: string }> {
  const url = `https://graph.facebook.com/v21.0/${input.pixelId}/events?access_token=${encodeURIComponent(input.accessToken)}`;

  const userData: Record<string, unknown> = {
    ph: [sha256(toInternationalMorocco(input.phone).replace("+", ""))],
    ct: [sha256(normalizeForMeta(input.city))],
    country: [sha256(input.country ?? "ma")],
    external_id: [sha256(input.eventId)],
  };
  if (input.fullName?.trim()) {
    const parts = input.fullName.trim().split(/\s+/);
    userData.fn = [sha256(normalizeForMeta(parts[0]))];
    if (parts.length > 1) userData.ln = [sha256(normalizeForMeta(parts.slice(1).join(" ")))];
  }
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.clientUserAgent) userData.client_user_agent = input.clientUserAgent;

  const body = {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_id: input.eventId, // dédup avec un éventuel pixel navigateur qui aurait aussi tracké
      action_source: "website",
      user_data: userData,
      custom_data: { value: input.value, currency: input.currency },
    }],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    const msg = (json as { error?: { message?: string } })?.error?.message ?? res.statusText;
    return { ok: false, error: `Meta Conversions API ${res.status}: ${msg}` };
  }
  return { ok: true };
}
