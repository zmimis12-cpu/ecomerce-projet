/**
 * lib/ads/google-spend.ts — dépense Google Ads par campagne et par jour (API Google Ads),
 * copiée dans product_ad_spend / unmatched_ad_spend (platform = 'google') par la synchro de fond.
 * → comptée automatiquement dans le dashboard (Total Pub), le profit par produit et /admin/sources.
 * Comptes lus : app_settings google_ads.spend_customer_ids (défaut : 7186317988). Server-only.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUsdToMad } from "./fx";
import { matchCampaignsToProducts, type ProductForMatching } from "./matcher";

type GoogleCfg = {
  client_id: string; client_secret: string; refresh_token: string; developer_token: string;
  api_version?: string; spend_customer_ids?: string[]; campaign_products?: Record<string, string>;
};

async function readCfg(): Promise<GoogleCfg | null> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "google_ads").maybeSingle();
  let v = (data as { value?: unknown } | null)?.value;
  while (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  return (v as GoogleCfg) ?? null;
}

async function accessToken(c: GoogleCfg): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", cache: "no-store",
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token, grant_type: "refresh_token" }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`OAuth Google : ${j.error_description ?? j.error ?? r.status}`);
  return j.access_token as string;
}

type Camp = { campaign_id: string; campaign_name: string; spend: number }; // spend en devise du compte

/** Dépense par campagne pour 1 jour, tous les comptes réglés. */
export async function getGoogleCampaignSpend(day: string): Promise<{ ok: true; campaigns: Camp[]; currency: string } | { ok: false; error: string }> {
  const c = await readCfg();
  if (!c?.refresh_token || !c.developer_token) return { ok: false, error: "Google Ads non connecté." };
  const ids = (c.spend_customer_ids?.length ? c.spend_customer_ids : ["7186317988"]).map((x) => String(x).replace(/\D/g, ""));
  const token = await accessToken(c);
  const out: Camp[] = [];
  let currency = "USD";
  for (const id of ids) {
    const r = await fetch(`https://googleads.googleapis.com/${c.api_version ?? "v24"}/customers/${id}/googleAds:search`, {
      method: "POST", cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "developer-token": c.developer_token, "login-customer-id": id, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `SELECT customer.currency_code, campaign.id, campaign.name, metrics.cost_micros FROM campaign WHERE segments.date = '${day}' AND metrics.cost_micros > 0` }),
    });
    const j = await r.json();
    if (!r.ok) return { ok: false, error: `Google ${id} : ${j?.error?.details?.[0]?.errors?.[0]?.message ?? j?.error?.message ?? r.status}` };
    for (const row of (j.results ?? []) as { customer?: { currencyCode?: string }; campaign: { id: string; name: string }; metrics: { costMicros?: string } }[]) {
      currency = row.customer?.currencyCode ?? currency;
      out.push({ campaign_id: String(row.campaign.id), campaign_name: row.campaign.name, spend: Number(row.metrics.costMicros ?? 0) / 1e6 });
    }
  }
  return { ok: true, campaigns: out, currency };
}

/** Mot du nom de campagne → produit (réglable : google_ads.campaign_products { "MEULEUSE": "<product_id>" }). */
function productByKeyword(name: string, map: Record<string, string>): string | null {
  const n = name.toUpperCase();
  for (const [k, pid] of Object.entries(map)) if (k && n.includes(k.toUpperCase())) return pid;
  return null;
}

async function syncOneDay(day: string) {
  const res = await getGoogleCampaignSpend(day);
  if (!res.ok) return res;
  const cfg = await readCfg();
  const rate = res.currency === "MAD" ? 1 : (await getUsdToMad(day)).base;

  const [{ data: products }, { data: assigns }] = await Promise.all([
    supabaseAdmin.from("products").select("id, sku, name"),
    supabaseAdmin.from("campaign_product_assignments").select("campaign_id, product_id").eq("platform", "google"),
  ]);
  const manual = new Map(((assigns ?? []) as { campaign_id: string; product_id: string }[]).map((a) => [a.campaign_id, a.product_id]));
  const byProduct = new Map<string, { spend: number; names: string[] }>();
  const add = (pid: string, c: Camp) => { const e = byProduct.get(pid) ?? { spend: 0, names: [] }; e.spend += c.spend; e.names.push(c.campaign_name); byProduct.set(pid, e); };
  const rest: Camp[] = [];
  for (const c of res.campaigns) {
    const pid = manual.get(c.campaign_id) ?? productByKeyword(c.campaign_name, cfg?.campaign_products ?? {});
    if (pid) add(pid, c); else rest.push(c);
  }
  const { matches } = matchCampaignsToProducts((products ?? []) as ProductForMatching[], rest);
  const matchedNames = new Set<string>();
  for (const m of matches) {
    if (!m.matched_campaign_names.length) continue;
    for (const nm of m.matched_campaign_names) { matchedNames.add(nm); const c = rest.find((x) => x.campaign_name === nm); if (c) add(m.product_id, c); }
  }
  const unmatched = rest.filter((c) => !matchedNames.has(c.campaign_name));

  // remplace les lignes Google du jour (pas de double comptage)
  await Promise.all([
    supabaseAdmin.from("product_ad_spend").delete().eq("platform", "google").eq("period_start", day).eq("period_end", day),
    supabaseAdmin.from("unmatched_ad_spend").delete().eq("platform", "google").eq("period_start", day).eq("period_end", day),
  ]);
  const rows = [...byProduct].map(([product_id, v]) => ({
    product_id, platform: "google", matched_campaign_names: v.names,
    spend_mad: Math.round(v.spend * rate * 100) / 100, period_start: day, period_end: day, synced_at: new Date().toISOString(),
  }));
  if (rows.length) {
    const { error } = await supabaseAdmin.from("product_ad_spend").insert(rows as never);
    if (error) return { ok: false as const, error: error.message };
  }
  const um = unmatched.reduce((s, c) => s + c.spend, 0);
  if (um > 0) {
    await supabaseAdmin.from("unmatched_ad_spend").insert({
      platform: "google", matched_campaign_names: unmatched.map((c) => c.campaign_name),
      spend_mad: Math.round(um * rate * 100) / 100, period_start: day, period_end: day,
    } as never);
  }
  const total = res.campaigns.reduce((s, c) => s + c.spend, 0);
  return { ok: true as const, day, spend: Math.round(total * 100) / 100, mad: Math.round(total * rate * 100) / 100, unmatched: unmatched.map((c) => c.campaign_name) };
}

/** Synchro Google jour par jour (appelée par /api/cron/sync). */
export async function syncGoogleAdSpend(from: string, to: string) {
  const out: unknown[] = [];
  const d = new Date(from + "T00:00:00Z"), end = new Date(to + "T00:00:00Z");
  for (let i = 0; d <= end && i < 40; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    const r = await syncOneDay(d.toISOString().slice(0, 10));
    if (!r.ok) return r;
    out.push(r);
  }
  return { ok: true as const, days: out };
}
