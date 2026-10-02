/**
 * lib/meta/reporting.ts — envoi AUTOMATIQUE des livraisons à Meta.
 *  1. "Purchase" (Conversions API) dès qu'une commande est livrée (≤ 7 jours,
 *     limite Meta), avec montant + infos de correspondance chiffrées.
 *  2. Audience personnalisée "Acheteurs livrés" mise à jour (téléphone, nom,
 *     ville chiffrés SHA-256) → base pour Lookalike 1 % et exclusions.
 * Server-only. Appelé par le webhook Digylog et le cron (15 min).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendMetaPurchaseEvent, sha256Meta, normalizeForMeta } from "@/lib/meta/conversions-api";
import { toInternationalMorocco } from "@/lib/delivery/phone-utils";

const META = "https://graph.facebook.com/v21.0";
const DAY = 86400_000;

async function settings() {
  const { data } = await supabaseAdmin.from("ad_platform_settings")
    .select("access_token, account_id, is_active").eq("platform", "meta").maybeSingle();
  return data as { access_token: string; account_id: string; is_active: boolean } | null;
}

/** Pixel par défaut = celui des commandes les plus récentes qui en ont un. */
async function defaultPixel() {
  const { data } = await supabaseAdmin.from("orders").select("meta_pixel_id")
    .not("meta_pixel_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as { meta_pixel_id: string } | null)?.meta_pixel_id ?? null;
}

type ORow = {
  id: string; customer_name: string; customer_phone: string; customer_city: string; total_amount_mad: number;
  meta_pixel_id: string | null; meta_fbp: string | null; meta_fbc: string | null;
  meta_client_ip: string | null; meta_client_ua: string | null;
  delivered_at: string | null; updated_at: string;
};

export async function reportDeliveredToMeta() {
  const s = await settings();
  if (!s?.access_token || !s.is_active) return { ok: false, error: "Meta non configuré" };
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const { data, error } = await supabaseAdmin.from("orders")
    .select("id, customer_name, customer_phone, customer_city, total_amount_mad, meta_pixel_id, meta_fbp, meta_fbc, meta_client_ip, meta_client_ua, delivered_at, updated_at")
    .in("status", ["delivered", "paid"])
    .eq("meta_purchase_sent", false)
    .or(`delivered_at.gte.${since},and(delivered_at.is.null,updated_at.gte.${since})`)
    .limit(300);
  if (error) return { ok: false, error: error.message };
  const orders = (data ?? []) as unknown as ORow[];
  if (!orders.length) return { ok: true, sent: 0, failed: 0 };

  const pixel = await defaultPixel();
  const ids = orders.map((o) => o.id);
  const { data: items } = await supabaseAdmin.from("order_items").select("order_id, product_id").in("order_id", ids);
  const productsOf = new Map<string, string[]>();
  for (const it of (items ?? []) as { order_id: string; product_id: string | null }[]) {
    if (it.product_id) productsOf.set(it.order_id, [...(productsOf.get(it.order_id) ?? []), it.product_id]);
  }

  let sent = 0, failed = 0;
  for (const o of orders) {
    const pixelId = o.meta_pixel_id ?? pixel;
    if (!pixelId) { failed++; continue; }
    const when = Date.parse(o.delivered_at ?? o.updated_at);
    const eventTime = Math.floor(Math.min(Date.now(), Math.max(when, Date.now() - 7 * DAY + 3600_000)) / 1000);
    const res = await sendMetaPurchaseEvent({
      pixelId,
      accessToken: s.access_token,
      value: Number(o.total_amount_mad ?? 0),
      currency: "MAD",
      phone: o.customer_phone,
      city: o.customer_city ?? "",
      fullName: o.customer_name,
      fbp: o.meta_fbp,
      fbc: o.meta_fbc,
      clientIp: o.meta_client_ip,
      clientUserAgent: o.meta_client_ua,
      eventId: o.id,
      eventTime,
      // Commande sans navigateur connu (WhatsApp, téléphone…) → "other"
      actionSource: o.meta_client_ua ? "website" : "other",
      contentIds: productsOf.get(o.id),
    });
    const patch = res.ok
      ? { meta_purchase_sent: true, meta_purchase_sent_at: new Date().toISOString(), meta_purchase_error: null }
      : { meta_purchase_error: (res.error ?? "erreur").slice(0, 500) };
    await supabaseAdmin.from("orders").update(patch as never).eq("id", o.id);
    if (res.ok) sent++; else failed++;
  }
  return { ok: true, sent, failed };
}

/** Audience "Acheteurs livrés" : créée une fois, puis complétée à chaque passage. */
export async function syncBuyersAudience() {
  const s = await settings();
  if (!s?.access_token || !s.is_active || !s.account_id) return { ok: false, error: "Meta non configuré" };
  const acc = s.account_id.startsWith("act_") ? s.account_id : `act_${s.account_id}`;

  const { data: setting } = await supabaseAdmin.from("app_settings").select("value").eq("key", "meta_buyers_audience_id").maybeSingle();
  let audienceId = (setting as { value: string } | null)?.value ?? null;

  if (!audienceId) {
    const res = await fetch(`${META}/${acc}/customaudiences`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        name: "GestionPro — Acheteurs livrés (auto)",
        subtype: "CUSTOM",
        description: "Clients livrés, mis à jour automatiquement par GestionPro. Base pour Lookalike / exclusions.",
        customer_file_source: "USER_PROVIDED_ONLY",
        access_token: s.access_token,
      }).toString(),
    });
    const json = await res.json();
    if (!res.ok || json.error) return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    audienceId = String(json.id);
    await supabaseAdmin.from("app_settings").upsert({
      key: "meta_buyers_audience_id", value: audienceId, category: "ads", label: "Audience Meta « Acheteurs livrés »",
    } as never, { onConflict: "key" });
  }

  const { data } = await supabaseAdmin.from("orders")
    .select("id, customer_name, customer_phone, customer_city")
    .in("status", ["delivered", "paid"]).eq("meta_audience_added" as never, false).limit(1000);
  const rows = (data ?? []) as { id: string; customer_name: string; customer_phone: string; customer_city: string | null }[];
  if (!rows.length) return { ok: true, audienceId, added: 0 };

  const payload = rows.map((r) => {
    const parts = (r.customer_name ?? "").trim().split(/\s+/);
    return [
      sha256Meta(toInternationalMorocco(r.customer_phone).replace("+", "")),
      parts[0] ? sha256Meta(normalizeForMeta(parts[0])) : "",
      parts.length > 1 ? sha256Meta(normalizeForMeta(parts.slice(1).join(" "))) : "",
      r.customer_city ? sha256Meta(normalizeForMeta(r.customer_city)) : "",
      sha256Meta("ma"),
    ];
  });
  const res = await fetch(`${META}/${audienceId}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payload: { schema: ["PHONE", "FN", "LN", "CT", "COUNTRY"], data: payload },
      access_token: s.access_token,
    }),
  });
  const json = await res.json();
  if (!res.ok || json.error) return { ok: false, audienceId, error: json?.error?.message ?? `HTTP ${res.status}` };

  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 150) {
    await supabaseAdmin.from("orders").update({ meta_audience_added: true } as never).in("id", ids.slice(i, i + 150));
  }
  return { ok: true, audienceId, added: rows.length, received: json.num_received, invalid: json.num_invalid_entries };
}

/** Résumé pour la carte "Reporting Meta". */
export async function getMetaReportingStatus() {
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const [sentAll, pending7, errors, audSetting] = await Promise.all([
    supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).eq("meta_purchase_sent", true),
    supabaseAdmin.from("orders").select("id", { count: "exact", head: true })
      .in("status", ["delivered", "paid"]).eq("meta_purchase_sent", false).gte("updated_at", since),
    supabaseAdmin.from("orders").select("order_number, meta_purchase_error")
      .not("meta_purchase_error" as never, "is", null).eq("meta_purchase_sent", false).limit(5),
    supabaseAdmin.from("app_settings").select("value").eq("key", "meta_buyers_audience_id").maybeSingle(),
  ]);
  const { count: inAudience } = await supabaseAdmin.from("orders").select("id", { count: "exact", head: true })
    .eq("meta_audience_added" as never, true);
  let audienceSize: number | null = null;
  const audienceId = (audSetting.data as { value: string } | null)?.value ?? null;
  if (audienceId) {
    const s = await settings();
    if (s?.access_token) {
      const j = await (await fetch(`${META}/${audienceId}?fields=approximate_count_lower_bound&access_token=${encodeURIComponent(s.access_token)}`, { cache: "no-store" })).json();
      audienceSize = typeof j.approximate_count_lower_bound === "number" ? j.approximate_count_lower_bound : null;
    }
  }
  return {
    sent: sentAll.count ?? 0,
    pending: pending7.count ?? 0,
    errors: (errors.data ?? []) as { order_number: string; meta_purchase_error: string }[],
    audienceId, inAudience: inAudience ?? 0, audienceSize,
  };
}
