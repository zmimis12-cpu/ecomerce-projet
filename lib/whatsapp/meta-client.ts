/**
 * lib/whatsapp/meta-client.ts
 * Client minimal pour l'API officielle Meta WhatsApp Cloud API.
 * Doc: https://developers.facebook.com/docs/whatsapp/cloud-api
 * Pas d'abonnement mensuel — 1000 conversations/mois gratuites, puis
 * quelques centimes par conversation (bien moins cher que Twilio à volume).
 */

export interface MetaCreds {
  accessToken: string;
  phoneNumberId: string;
}

const GRAPH_VERSION = "v21.0";

async function metaRequest(creds: MetaCreds, payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${creds.phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${creds.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    const msg = (json as { error?: { message?: string } })?.error?.message ?? res.statusText;
    return { ok: false, error: `Meta API ${res.status}: ${msg}` };
  }
  return { ok: true };
}

/** to = numéro international SANS "+" ni espaces (ex: 212612345678) */
export async function sendWhatsAppText(creds: MetaCreds, to: string, text: string) {
  return metaRequest(creds, {
    to,
    type: "text",
    text: { body: text },
  });
}

export async function sendWhatsAppMedia(creds: MetaCreds, to: string, mediaUrl: string, mediaType: "image" | "video") {
  return metaRequest(creds, {
    to,
    type: mediaType,
    [mediaType]: { link: mediaUrl },
  });
}
