/**
 * lib/meta/confirmed-event.ts — envoie « OrderConfirmed » à Meta (Conversions API) quand une commande
 * est confirmée par le call center. Meta apprend alors à chercher des gens qui CONFIRMENT
 * (pas seulement des gens qui remplissent le formulaire). Un seul envoi par commande
 * (orders.metadata.meta_confirmed_sent). Meta accepte les événements de 7 jours max. Server only.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ord = {
  id: string; order_number: string | null; customer_phone: string; customer_city: string | null; customer_name: string | null;
  total_amount_mad: number | null; meta_pixel_id: string | null; meta_fbp: string | null; meta_fbc: string | null;
  meta_client_ip: string | null; meta_client_ua: string | null; confirmed_at: string | null; metadata: Record<string, unknown> | null;
  order_items?: { product_id: string | null }[] | null;
};

export async function sendMetaConfirmedIfNeeded(orderId: string, at?: string): Promise<{ ok: boolean; sent: number; error?: string }> {
  const { data } = await supabaseAdmin.from("orders")
    .select("id, order_number, customer_phone, customer_city, customer_name, total_amount_mad, meta_pixel_id, meta_fbp, meta_fbc, meta_client_ip, meta_client_ua, confirmed_at, metadata, order_items(product_id)")
    .eq("id", orderId).maybeSingle();
  const o = data as Ord | null;
  if (!o || !o.meta_pixel_id) return { ok: false, sent: 0, error: "pas de pixel" };
  if (o.metadata?.meta_confirmed_sent) return { ok: true, sent: 0 };

  const ts = at ?? o.confirmed_at;
  const when = ts ? Math.floor(Date.parse(ts) / 1000) : Math.floor(Date.now() / 1000);
  if (Date.now() / 1000 - when > 7 * 86400 - 600) return { ok: false, sent: 0, error: "plus de 7 jours" };

  const { getMetaAccounts } = await import("@/lib/ads/meta-accounts");
  const { sendMetaPurchaseEvent } = await import("@/lib/meta/conversions-api");
  const accs = (await getMetaAccounts()).filter((a) => a.isActive && a.token);
  let sent = 0; let lastErr = "";
  for (const pixelId of o.meta_pixel_id.split(/[,\s]+/).filter(Boolean)) {
    const token = accs.find((a) => a.pixelId === pixelId)?.token ?? accs.find((a) => a.isPrimary)?.token;
    if (!token) continue;
    const r = await sendMetaPurchaseEvent({
      pixelId, accessToken: token, value: Number(o.total_amount_mad ?? 0), currency: "MAD",
      phone: o.customer_phone, city: o.customer_city ?? "", fullName: o.customer_name ?? "",
      fbp: o.meta_fbp, fbc: o.meta_fbc, clientIp: o.meta_client_ip, clientUserAgent: o.meta_client_ua,
      eventId: `confirmed_${o.order_number ?? o.id}`, eventName: "OrderConfirmed", eventTime: when, actionSource: "website",
      contentIds: (o.order_items ?? []).map((i) => i.product_id).filter(Boolean) as string[],
    }).catch((e) => ({ ok: false, error: String(e) }));
    if (r.ok) sent++; else lastErr = r.error ?? "";
  }
  if (sent > 0) {
    await supabaseAdmin.from("orders")
      .update({ metadata: { ...(o.metadata ?? {}), meta_confirmed_sent: new Date().toISOString() } } as never).eq("id", o.id);
  }
  return { ok: sent > 0, sent, error: sent ? undefined : lastErr };
}
