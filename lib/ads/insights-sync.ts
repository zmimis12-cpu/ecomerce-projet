/**
 * lib/ads/insights-sync.ts — stats par PUB et par JOUR (Meta / TikTok) pour
 * les vidéos des éditeurs : impressions, clics, CTR, leads, messages, dépense.
 * Server-only (appelé par le cron). Les pubs dont le nom contient un code
 * vidéo (ex: "V001 - hook") sont liées automatiquement à la vidéo.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readSettings } from "./sync-core";
import { getUsdToMad, getAccountTaxConfig, taxFactorFor } from "./fx";

const META_BASE = "https://graph.facebook.com/v21.0";
const TIKTOK_BASE = "https://business-api.tiktok.com/open_api/v1.3";
const CODE_RE = /\bV\d{3,}\b/i;

type Row = {
  platform: "meta" | "tiktok";
  ad_id: string;
  day: string;
  ad_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  impressions: number;
  clicks: number;
  link_clicks: number;
  leads: number;
  messages: number;
  landing_page_views: number;
  initiate_checkouts: number;
  video_plays: number;
  thruplays: number;
  spend_mad: number;
  updated_at: string;
};

async function rate(key: string, fallback: number) {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle();
  const v = Number((data as { value?: unknown } | null)?.value);
  return v > 0 ? v : fallback;
}

function actionValue(actions: { action_type: string; value: string }[] | undefined, types: string[]) {
  if (!actions) return 0;
  for (const t of types) {
    const a = actions.find((x) => x.action_type === t);
    if (a) return Number(a.value) || 0;
  }
  return 0;
}

async function upsertRows(rows: Row[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseAdmin
      .from("ad_insights_daily" as never)
      .upsert(rows.slice(i, i + 500) as never, { onConflict: "platform,ad_id,day" });
    if (error) throw new Error(error.message);
  }
}

/** Lie automatiquement les pubs "V001 …" à la vidéo V001 (sans écraser un lien manuel). */
async function autoLink(rows: Row[]) {
  const byCode = new Map<string, { platform: string; ad_id: string }[]>();
  for (const r of rows) {
    const m = r.ad_name?.match(CODE_RE);
    if (!m) continue;
    const code = m[0].toUpperCase();
    const list = byCode.get(code) ?? [];
    if (!list.some((x) => x.ad_id === r.ad_id && x.platform === r.platform)) list.push({ platform: r.platform, ad_id: r.ad_id });
    byCode.set(code, list);
  }
  if (!byCode.size) return 0;
  const { data: creatives } = await supabaseAdmin
    .from("creatives" as never)
    .select("id, code")
    .in("code", [...byCode.keys()]);
  const links: { platform: string; ad_id: string; creative_id: string; linked_by: string }[] = [];
  for (const c of (creatives ?? []) as { id: string; code: string }[]) {
    for (const ad of byCode.get(c.code) ?? []) links.push({ ...ad, creative_id: c.id, linked_by: "auto" });
  }
  if (!links.length) return 0;
  await supabaseAdmin
    .from("creative_ads" as never)
    .upsert(links as never, { onConflict: "platform,ad_id", ignoreDuplicates: true });
  return links.length;
}

export async function syncMetaAdInsights(since: string, until: string) {
  // Multi-comptes : chaque compte Meta actif est synchronisé
  const { activeMetaAccounts, adAccountMap, saveAdAccountMap, act } = await import("./meta-accounts");
  const accounts = await activeMetaAccounts();
  if (!accounts.length) return { ok: false, error: "Meta non configuré" };
  const map = await adAccountMap();
  const out: unknown[] = [];
  for (const a of accounts) {
    const r = await syncMetaAdInsightsFor(act(a), a.token, since, until, await getAccountTaxConfig(a));
    out.push({ account: a.label, ...r });
    for (const id of ((r as { adIds?: string[] }).adIds ?? [])) map[id] = a.key;
  }
  await saveAdAccountMap(map);
  return { ok: true, accounts: out };
}

async function syncMetaAdInsightsFor(acc: string, token: string, since: string, until: string, taxCfg: { pct: number; since: string | null }) {
  const s = { access_token: token };
  const { base: usdToMad } = await getUsdToMad();
  const url = new URL(`${META_BASE}/${acc}/insights`);
  url.searchParams.set("level", "ad");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("fields", "ad_id,ad_name,campaign_id,campaign_name,impressions,clicks,inline_link_clicks,spend,actions,video_thruplay_watched_actions,date_start");
  url.searchParams.set("time_range", JSON.stringify({ since, until }));
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", s.access_token);

  const rows: Row[] = [];
  const now = new Date().toISOString();
  let next: string | undefined = url.toString();
  for (let guard = 0; next && guard < 20; guard++) {
    const res: Response = await fetch(next, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || json.error) return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    for (const r of (json.data ?? []) as Record<string, unknown>[]) {
      const actions = r.actions as { action_type: string; value: string }[] | undefined;
      rows.push({
        platform: "meta",
        ad_id: String(r.ad_id),
        day: String(r.date_start),
        ad_name: (r.ad_name as string) ?? null,
        campaign_id: (r.campaign_id as string) ?? null,
        campaign_name: (r.campaign_name as string) ?? null,
        impressions: Number(r.impressions ?? 0),
        clicks: Number(r.clicks ?? 0),
        link_clicks: Number(r.inline_link_clicks ?? 0),
        leads: actionValue(actions, ["lead", "offsite_conversion.fb_pixel_lead", "onsite_web_lead"]),
        messages: actionValue(actions, ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection"]),
        landing_page_views: actionValue(actions, ["landing_page_view", "omni_landing_page_view"]),
        initiate_checkouts: actionValue(actions, ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"]),
        video_plays: actionValue(actions, ["video_view"]),
        thruplays: actionValue(r.video_thruplay_watched_actions as { action_type: string; value: string }[] | undefined, ["video_view"]),
        spend_mad: Math.round(Number(r.spend ?? 0) * usdToMad * taxFactorFor(String(r.date_start), taxCfg) * 100) / 100,
        updated_at: now,
      });
    }
    next = json.paging?.next;
  }
  await upsertRows(rows);
  const linked = await autoLink(rows);
  const meta = await syncMetaAdMeta(acc, s.access_token).catch((e) => ({ ok: false, error: String(e) }));
  return { ok: true, rows: rows.length, linked, meta, adIds: [...new Set(rows.map((r) => r.ad_id))] };
}

/** Portée, fréquence, classements Meta (depuis le début) + statut de diffusion. */
async function syncMetaAdMeta(acc: string, token: string) {
  const out = new Map<string, Record<string, unknown>>();
  const now = new Date().toISOString();

  const ins = new URL(`${META_BASE}/${acc}/insights`);
  ins.searchParams.set("level", "ad");
  ins.searchParams.set("date_preset", "maximum");
  ins.searchParams.set("fields", "ad_id,ad_name,adset_name,campaign_name,reach,frequency,quality_ranking,engagement_rate_ranking,conversion_rate_ranking");
  ins.searchParams.set("limit", "500");
  ins.searchParams.set("access_token", token);
  let next: string | undefined = ins.toString();
  for (let g = 0; next && g < 10; g++) {
    const res: Response = await fetch(next, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || json.error) break;
    for (const r of (json.data ?? []) as Record<string, string>[]) {
      out.set(r.ad_id, {
        platform: "meta", ad_id: r.ad_id, ad_name: r.ad_name ?? null, adset_name: r.adset_name ?? null,
        campaign_name: r.campaign_name ?? null, reach: Number(r.reach ?? 0), frequency: Number(r.frequency ?? 0),
        quality_ranking: r.quality_ranking ?? null, engagement_rate_ranking: r.engagement_rate_ranking ?? null,
        conversion_rate_ranking: r.conversion_rate_ranking ?? null, effective_status: null, updated_at: now,
      });
    }
    next = json.paging?.next;
  }

  const ads = new URL(`${META_BASE}/${acc}/ads`);
  ads.searchParams.set("fields", "id,effective_status");
  ads.searchParams.set("limit", "500");
  ads.searchParams.set("access_token", token);
  next = ads.toString();
  for (let g = 0; next && g < 10; g++) {
    const res: Response = await fetch(next, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || json.error) break;
    for (const a of (json.data ?? []) as { id: string; effective_status: string }[]) {
      const row = out.get(a.id);
      if (row) row.effective_status = a.effective_status;
    }
    next = json.paging?.next;
  }

  const rows = [...out.values()];
  if (rows.length) {
    await supabaseAdmin.from("ad_meta" as never).upsert(rows as never, { onConflict: "platform,ad_id" });
  }
  return { ok: true, ads: rows.length };
}

export async function syncTikTokAdInsights(since: string, until: string) {
  const { activeTikTokAccounts, tiktokToMad } = await import("./tiktok-accounts");
  const accounts = await activeTikTokAccounts();
  if (accounts.length) {
    const out: unknown[] = [];
    for (const a of accounts) out.push({ account: a.label, ...(await syncTikTokAdInsightsFor(a.token, a.advertiserId, since, until, await tiktokToMad(a))) });
    return { ok: true, accounts: out };
  }
  return syncTikTokAdInsightsLegacy(since, until);
}

async function syncTikTokAdInsightsFor(token: string, advertiserId: string, since: string, until: string, toMad: number) {
  const s = { access_token: token, account_id: advertiserId, is_active: true };
  return runTikTokInsights(s, since, until, toMad);
}

async function syncTikTokAdInsightsLegacy(since: string, until: string) {
  const s = await readSettings("tiktok");
  if (!s?.is_active || !s.access_token || !s.account_id) return { ok: false, error: "TikTok non configuré" };
  const advertiserId = s.account_id.trim();
  if (!/^\d+$/.test(advertiserId)) {
    return { ok: false, error: "Advertiser ID TikTok invalide (doit être uniquement des chiffres)" };
  }
  const toMad = await rate("tiktok_currency_to_mad", 1);

  return runTikTokInsights({ access_token: s.access_token, account_id: advertiserId, is_active: true }, since, until, toMad);
}

async function runTikTokInsights(s: { access_token: string; account_id: string; is_active: boolean }, since: string, until: string, toMad: number) {
  const advertiserId = s.account_id;
  const rows: Row[] = [];
  const now = new Date().toISOString();
  for (let page = 1; page <= 20; page++) {
    const url = new URL(`${TIKTOK_BASE}/report/integrated/get/`);
    url.searchParams.set("advertiser_id", advertiserId);
    url.searchParams.set("report_type", "BASIC");
    url.searchParams.set("data_level", "AUCTION_AD");
    url.searchParams.set("dimensions", JSON.stringify(["ad_id", "stat_time_day"]));
    url.searchParams.set("metrics", JSON.stringify(["ad_name", "campaign_id", "campaign_name", "spend", "impressions", "clicks", "conversion", "video_play_actions", "video_watched_6s"]));
    url.searchParams.set("start_date", since);
    url.searchParams.set("end_date", until);
    url.searchParams.set("page_size", "1000");
    url.searchParams.set("page", String(page));
    const res = await fetch(url.toString(), { headers: { "Access-Token": s.access_token }, cache: "no-store" });
    const json = await res.json();
    if (!res.ok || json.code !== 0) return { ok: false, error: json?.message ?? `HTTP ${res.status}` };
    const list = (json.data?.list ?? []) as { dimensions: Record<string, string>; metrics: Record<string, string> }[];
    for (const r of list) {
      rows.push({
        platform: "tiktok",
        ad_id: r.dimensions.ad_id,
        day: String(r.dimensions.stat_time_day).slice(0, 10),
        ad_name: r.metrics.ad_name ?? null,
        campaign_id: r.metrics.campaign_id ?? null,
        campaign_name: r.metrics.campaign_name ?? null,
        impressions: Number(r.metrics.impressions ?? 0),
        clicks: Number(r.metrics.clicks ?? 0),
        link_clicks: Number(r.metrics.clicks ?? 0),
        leads: Number(r.metrics.conversion ?? 0),
        messages: 0,
        landing_page_views: 0,
        initiate_checkouts: 0,
        video_plays: Number(r.metrics.video_play_actions ?? 0),
        thruplays: Number(r.metrics.video_watched_6s ?? 0),
        spend_mad: Math.round(Number(r.metrics.spend ?? 0) * toMad * 100) / 100,
        updated_at: now,
      });
    }
    const totalPages = Number(json.data?.page_info?.total_page ?? 1);
    if (page >= totalPages) break;
  }
  await upsertRows(rows);
  const linked = await autoLink(rows);
  return { ok: true, rows: rows.length, linked };
}
