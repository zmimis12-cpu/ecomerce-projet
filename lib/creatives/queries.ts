/**
 * lib/creatives/queries.ts
 * Rapport vidéos (créatives) → commandes → livrées → gains éditeurs.
 * Server-side only (supabaseAdmin).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Statuts qui comptent comme "livré" pour payer l'éditeur */
export const DELIVERED_STATUSES = ["delivered", "paid"];

export type CommissionType = "fixed" | "percent";

export type EditorInfo = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  commissionType: CommissionType;
  commissionValue: number;
};

export type CreativeStat = {
  id: string;
  code: string;
  title: string;
  videoUrl: string | null;
  platform: string;
  status: "draft" | "in_ads" | "paused";
  createdAt: string;
  editorId: string;
  editorName: string;
  productId: string | null;
  productName: string;
  lpSlug: string | null;
  orders: number;      // commandes créées dans la période
  delivered: number;   // livrées dans la période
  revenue: number;     // CA livré
  earnings: number;    // gain éditeur
  // Stats pubs (Meta/TikTok) des pubs liées à cette vidéo, sur la période
  adsCount: number;
  impressions: number;
  linkClicks: number;
  adLeads: number;
  messages: number;
  spend: number;       // ⚠️ privé : jamais affiché aux éditeurs
};

export type EditorStat = EditorInfo & {
  impressions: number;
  linkClicks: number;
  adLeads: number;
  videos: number;
  videosInAds: number;
  orders: number;
  delivered: number;
  revenue: number;
  earnings: number;
};

export type DeliveredOrderRow = {
  id: string;
  orderNumber: string;
  creativeCode: string;
  creativeTitle: string;
  productName: string;
  amount: number;
  deliveredAt: string;
  earning: number;
};

/** "2026-09" → bornes du mois. "all" ou vide → pas de filtre. */
export function periodRange(month?: string | null): { from: Date | null; to: Date | null; key: string } {
  // Périodes glissantes : "7d", "30d" (défaut). Avant, le défaut était le mois
  // en cours → le 1er du mois tout affichait 0.
  const rolling = /^(\d{1,3})d$/.exec(month ?? "30d");
  if (rolling) {
    const days = Number(rolling[1]);
    const to = new Date(); to.setUTCHours(0, 0, 0, 0); to.setUTCDate(to.getUTCDate() + 1);
    const from = new Date(to); from.setUTCDate(from.getUTCDate() - days);
    return { from, to, key: `${days}d` };
  }
  if (month === "all" || !month || !/^\d{4}-\d{2}$/.test(month)) {
    return { from: null, to: null, key: "all" };
  }
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)), key: month };
}

function inRange(iso: string | null, from: Date | null, to: Date | null) {
  if (!iso) return false;
  if (!from || !to) return true;
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t < to.getTime();
}

export function computeEarning(amount: number, type: CommissionType, value: number) {
  return type === "percent" ? Math.round(amount * value) / 100 : value;
}

export async function getVideoEditors(): Promise<EditorInfo[]> {
  const [{ data: users }, { data: settings }] = await Promise.all([
    supabaseAdmin.from("users").select("id, full_name, email, is_active").eq("role", "video_editor" as never),
    supabaseAdmin.from("video_editor_settings" as never).select("user_id, commission_type, commission_value"),
  ]);
  const map = new Map(
    ((settings ?? []) as { user_id: string; commission_type: CommissionType; commission_value: number }[])
      .map((s) => [s.user_id, s]),
  );
  return ((users ?? []) as { id: string; full_name: string; email: string; is_active: boolean }[])
    .map((u) => ({
      id: u.id,
      name: u.full_name || u.email,
      email: u.email,
      isActive: u.is_active,
      commissionType: map.get(u.id)?.commission_type ?? "fixed",
      commissionValue: Number(map.get(u.id)?.commission_value ?? 5),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCreativesReport(opts: { month?: string | null; editorId?: string | null } = {}) {
  const { from, to, key } = periodRange(opts.month);

  let cq = supabaseAdmin
    .from("creatives" as never)
    .select("id, code, title, video_url, platform, status, created_at, editor_id, product_id")
    .order("created_at", { ascending: false });
  if (opts.editorId) cq = cq.eq("editor_id", opts.editorId);

  const [{ data: creativesRaw }, editors] = await Promise.all([cq, getVideoEditors()]);

  type CRow = {
    id: string; code: string; title: string; video_url: string | null; platform: string;
    status: CreativeStat["status"]; created_at: string; editor_id: string; product_id: string | null;
  };
  const creatives = (creativesRaw ?? []) as unknown as CRow[];
  const editorMap = new Map(editors.map((e) => [e.id, e]));

  const productIds = [...new Set(creatives.map((c) => c.product_id).filter(Boolean))] as string[];
  const creativeIds = creatives.map((c) => c.id);

  const [{ data: products }, { data: lps }, { data: ordersRaw }] = await Promise.all([
    productIds.length
      ? supabaseAdmin.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] }),
    productIds.length
      ? supabaseAdmin.from("landing_pages" as never).select("product_id, slug").in("product_id", productIds)
      : Promise.resolve({ data: [] }),
    creativeIds.length
      ? supabaseAdmin
          .from("orders")
          .select("id, order_number, creative_id, status, total_amount_mad, created_at, delivered_at, updated_at, editor_earning_mad, editor_rate_label")
          .in("creative_id" as never, creativeIds)
      : Promise.resolve({ data: [] }),
  ]);

  const productName = new Map(((products ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const lpSlug = new Map<string, string>();
  for (const l of (lps ?? []) as { product_id: string; slug: string }[]) {
    if (!lpSlug.has(l.product_id)) lpSlug.set(l.product_id, l.slug);
  }

  type ORow = {
    id: string; order_number: string; creative_id: string; status: string;
    total_amount_mad: number; created_at: string; delivered_at: string | null; updated_at: string;
    editor_earning_mad: number | null; editor_rate_label: string | null;
  };
  const { loadRateBook, resolveRate, earningFor } = await import("@/lib/creatives/rates");
  const book = await loadRateBook();
  const orders = (ordersRaw ?? []) as unknown as ORow[];

  const stats = new Map<string, CreativeStat>();
  for (const c of creatives) {
    const ed = editorMap.get(c.editor_id);
    stats.set(c.id, {
      id: c.id, code: c.code, title: c.title, videoUrl: c.video_url, platform: c.platform,
      status: c.status, createdAt: c.created_at, editorId: c.editor_id,
      editorName: ed?.name ?? "—",
      productId: c.product_id,
      productName: c.product_id ? productName.get(c.product_id) ?? "—" : "—",
      lpSlug: c.product_id ? lpSlug.get(c.product_id) ?? null : null,
      orders: 0, delivered: 0, revenue: 0, earnings: 0,
      adsCount: 0, impressions: 0, linkClicks: 0, adLeads: 0, messages: 0, spend: 0,
    });
  }

  // ── Stats pubs liées (ad_insights_daily via creative_ads) ─────────────────
  let adsUpdatedAt: string | null = null;
  if (creativeIds.length) {
    const { data: links } = await supabaseAdmin
      .from("creative_ads" as never)
      .select("platform, ad_id, creative_id")
      .in("creative_id", creativeIds);
    const linkRows = (links ?? []) as { platform: string; ad_id: string; creative_id: string }[];
    const adToCreative = new Map(linkRows.map((l) => [`${l.platform}:${l.ad_id}`, l.creative_id]));
    for (const l of linkRows) { const st = stats.get(l.creative_id); if (st) st.adsCount++; }

    const adIds = [...new Set(linkRows.map((l) => l.ad_id))];
    for (let i = 0; i < adIds.length; i += 150) {
      let iq = supabaseAdmin
        .from("ad_insights_daily" as never)
        .select("platform, ad_id, impressions, link_clicks, leads, messages, spend_mad, updated_at")
        .in("ad_id", adIds.slice(i, i + 150));
      if (from && to) {
        iq = iq.gte("day", from.toISOString().slice(0, 10)).lt("day", to.toISOString().slice(0, 10));
      }
      const { data: ins } = await iq;
      for (const r of (ins ?? []) as {
        platform: string; ad_id: string; impressions: number; link_clicks: number;
        leads: number; messages: number; spend_mad: number; updated_at: string;
      }[]) {
        const cid = adToCreative.get(`${r.platform}:${r.ad_id}`);
        const st = cid ? stats.get(cid) : undefined;
        if (!st) continue;
        st.impressions += Number(r.impressions);
        st.linkClicks  += Number(r.link_clicks);
        st.adLeads     += Number(r.leads);
        st.messages    += Number(r.messages);
        st.spend       += Number(r.spend_mad);
        if (!adsUpdatedAt || r.updated_at > adsUpdatedAt) adsUpdatedAt = r.updated_at;
      }
    }
  }

  const deliveredRows: DeliveredOrderRow[] = [];
  for (const o of orders) {
    const s = stats.get(o.creative_id);
    if (!s) continue;
    if (inRange(o.created_at, from, to)) s.orders++;
    const deliveredAt = o.delivered_at ?? o.updated_at;
    if (DELIVERED_STATUSES.includes(o.status) && inRange(deliveredAt, from, to)) {
      const amount = Number(o.total_amount_mad ?? 0);
      // Gain FIGÉ à la livraison s'il existe, sinon tarif actuel (produit > éditeur)
      const earning = o.editor_earning_mad != null
        ? Number(o.editor_earning_mad)
        : earningFor(resolveRate(book, s.editorId, s.productId), amount);
      s.delivered++;
      s.revenue += amount;
      s.earnings += earning;
      deliveredRows.push({
        id: o.id, orderNumber: o.order_number, creativeCode: s.code, creativeTitle: s.title,
        productName: s.productName, amount, deliveredAt, earning,
      });
    }
  }
  deliveredRows.sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt));

  const creativeStats = [...stats.values()];
  const editorStats: EditorStat[] = editors
    .filter((e) => !opts.editorId || e.id === opts.editorId)
    .map((e) => {
      const mine = creativeStats.filter((c) => c.editorId === e.id);
      return {
        ...e,
        videos: mine.length,
        videosInAds: mine.filter((c) => c.status === "in_ads").length,
        orders: mine.reduce((s, c) => s + c.orders, 0),
        impressions: mine.reduce((s, c) => s + c.impressions, 0),
        linkClicks: mine.reduce((s, c) => s + c.linkClicks, 0),
        adLeads: mine.reduce((s, c) => s + c.adLeads, 0),
        delivered: mine.reduce((s, c) => s + c.delivered, 0),
        revenue: mine.reduce((s, c) => s + c.revenue, 0),
        earnings: mine.reduce((s, c) => s + c.earnings, 0),
      };
    });

  return { period: key, creatives: creativeStats, editors: editorStats, deliveredOrders: deliveredRows, adsUpdatedAt };
}

export function lpDomain() {
  return process.env.NEXT_PUBLIC_LP_DOMAIN || "hajtek.ma";
}

export function adLink(slug: string | null, code: string) {
  return slug ? `https://${lpDomain()}/lp/${slug}?cr=${code}` : null;
}

export type CreativeOption = {
  id: string;
  code: string;
  title: string;
  editorName: string;
  productId: string | null;
  status: string;
};

/** Liste courte des vidéos pour les selects (création / modification de commande). */
export async function getCreativeOptions(): Promise<CreativeOption[]> {
  const [{ data: cr }, editors] = await Promise.all([
    supabaseAdmin
      .from("creatives" as never)
      .select("id, code, title, editor_id, product_id, status")
      .order("code", { ascending: false }),
    getVideoEditors(),
  ]);
  const names = new Map(editors.map((e) => [e.id, e.name]));
  return ((cr ?? []) as unknown as {
    id: string; code: string; title: string; editor_id: string; product_id: string | null; status: string;
  }[]).map((c) => ({
    id: c.id, code: c.code, title: c.title,
    editorName: names.get(c.editor_id) ?? "—",
    productId: c.product_id, status: c.status,
  }));
}

/** CTR lien en % (clics sur le lien ÷ impressions). */
export function ctr(clicks: number, impressions: number) {
  return impressions > 0 ? (Math.round((clicks / impressions) * 10000) / 100).toFixed(2) + "%" : "—";
}

export function ago(iso: string | null) {
  if (!iso) return "jamais";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
}

export type AdRow = {
  platform: string;
  adId: string;
  adName: string;
  campaignName: string;
  impressions: number;
  spend: number;
  creativeId: string | null;
  linkedBy: string | null;
};

/** Pubs actives des 30 derniers jours + la vidéo à laquelle elles sont liées. */
export async function getRecentAds(): Promise<AdRow[]> {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("ad_insights_daily" as never)
    .select("platform, ad_id, ad_name, campaign_name, impressions, spend_mad, day")
    .gte("day", since)
    .limit(20000);
  const agg = new Map<string, AdRow & { lastDay: string }>();
  for (const r of (data ?? []) as {
    platform: string; ad_id: string; ad_name: string | null; campaign_name: string | null;
    impressions: number; spend_mad: number; day: string;
  }[]) {
    const k = `${r.platform}:${r.ad_id}`;
    const a = agg.get(k) ?? {
      platform: r.platform, adId: r.ad_id, adName: r.ad_name ?? r.ad_id, campaignName: r.campaign_name ?? "",
      impressions: 0, spend: 0, creativeId: null, linkedBy: null, lastDay: r.day,
    };
    a.impressions += Number(r.impressions);
    a.spend += Number(r.spend_mad);
    if (r.day >= a.lastDay) { a.lastDay = r.day; a.adName = r.ad_name ?? a.adName; }
    agg.set(k, a);
  }
  const { data: links } = await supabaseAdmin.from("creative_ads" as never).select("platform, ad_id, creative_id, linked_by");
  for (const l of (links ?? []) as { platform: string; ad_id: string; creative_id: string; linked_by: string }[]) {
    const a = agg.get(`${l.platform}:${l.ad_id}`);
    if (a) { a.creativeId = l.creative_id; a.linkedBy = l.linked_by; }
  }
  return [...agg.values()].filter((a) => a.impressions > 0).sort((a, b) => b.spend - a.spend);
}

// ── Stats détaillées par pub pour l'espace éditeur (AUCUNE donnée d'argent) ──
export type EditorAdStat = {
  platform: string;
  adId: string;
  adName: string;
  adsetName: string | null;
  creativeCode: string;
  creativeTitle: string;
  status: string | null;
  impressions: number;
  linkClicks: number;
  leads: number;
  messages: number;
  landingPageViews: number;
  initiateCheckouts: number;
  videoPlays: number;
  thruplays: number;
  spend: number;              // utilisé seulement pour le coût par lead (pas affiché seul)
  reach: number | null;       // cumul depuis le début (Meta)
  frequency: number | null;   // cumul depuis le début (Meta)
  qualityRanking: string | null;
  engagementRanking: string | null;
  conversionRanking: string | null;
};

export async function getEditorAdStats(opts: { editorId: string; month?: string | null }): Promise<EditorAdStat[]> {
  const { from, to } = periodRange(opts.month);
  const { data: cr } = await supabaseAdmin
    .from("creatives" as never).select("id, code, title").eq("editor_id", opts.editorId);
  const creatives = (cr ?? []) as { id: string; code: string; title: string }[];
  if (!creatives.length) return [];
  const byId = new Map(creatives.map((c) => [c.id, c]));

  const { data: links } = await supabaseAdmin
    .from("creative_ads" as never).select("platform, ad_id, creative_id").in("creative_id", creatives.map((c) => c.id));
  const linkRows = (links ?? []) as { platform: string; ad_id: string; creative_id: string }[];
  if (!linkRows.length) return [];
  const adIds = linkRows.map((l) => l.ad_id);

  let iq = supabaseAdmin
    .from("ad_insights_daily" as never)
    .select("platform, ad_id, ad_name, impressions, link_clicks, leads, messages, landing_page_views, initiate_checkouts, video_plays, thruplays, spend_mad")
    .in("ad_id", adIds);
  if (from && to) iq = iq.gte("day", from.toISOString().slice(0, 10)).lt("day", to.toISOString().slice(0, 10));
  const [{ data: ins }, { data: metaRows }] = await Promise.all([
    iq.limit(20000),
    supabaseAdmin.from("ad_meta" as never)
      .select("platform, ad_id, ad_name, adset_name, effective_status, reach, frequency, quality_ranking, engagement_rate_ranking, conversion_rate_ranking")
      .in("ad_id", adIds),
  ]);
  const meta = new Map(((metaRows ?? []) as Record<string, unknown>[]).map((m) => [`${m.platform}:${m.ad_id}`, m]));

  const out = new Map<string, EditorAdStat>();
  for (const l of linkRows) {
    const c = byId.get(l.creative_id)!;
    const m = meta.get(`${l.platform}:${l.ad_id}`);
    out.set(`${l.platform}:${l.ad_id}`, {
      platform: l.platform, adId: l.ad_id,
      adName: (m?.ad_name as string) ?? l.ad_id,
      adsetName: (m?.adset_name as string) ?? null,
      creativeCode: c.code, creativeTitle: c.title,
      status: (m?.effective_status as string) ?? null,
      impressions: 0, linkClicks: 0, leads: 0, messages: 0, landingPageViews: 0,
      initiateCheckouts: 0, videoPlays: 0, thruplays: 0, spend: 0,
      reach: m?.reach != null ? Number(m.reach) : null,
      frequency: m?.frequency != null ? Number(m.frequency) : null,
      qualityRanking: (m?.quality_ranking as string) ?? null,
      engagementRanking: (m?.engagement_rate_ranking as string) ?? null,
      conversionRanking: (m?.conversion_rate_ranking as string) ?? null,
    });
  }
  for (const r of (ins ?? []) as Record<string, unknown>[]) {
    const a = out.get(`${r.platform}:${r.ad_id}`);
    if (!a) continue;
    if (a.adName === a.adId && r.ad_name) a.adName = String(r.ad_name);
    a.impressions += Number(r.impressions ?? 0);
    a.linkClicks += Number(r.link_clicks ?? 0);
    a.leads += Number(r.leads ?? 0);
    a.messages += Number(r.messages ?? 0);
    a.landingPageViews += Number(r.landing_page_views ?? 0);
    a.initiateCheckouts += Number(r.initiate_checkouts ?? 0);
    a.videoPlays += Number(r.video_plays ?? 0);
    a.thruplays += Number(r.thruplays ?? 0);
    a.spend += Number(r.spend_mad ?? 0);
  }
  return [...out.values()].sort((a, b) => b.impressions - a.impressions);
}

/** Pubs liées aux vidéos d'un éditeur → { platform, adId, code, title } */
export async function getEditorLinkedAds(editorId: string) {
  const { data: cr } = await supabaseAdmin.from("creatives" as never).select("id, code, title").eq("editor_id", editorId);
  const creatives = (cr ?? []) as { id: string; code: string; title: string }[];
  if (!creatives.length) return [];
  const byId = new Map(creatives.map((c) => [c.id, c]));
  const { data: links } = await supabaseAdmin
    .from("creative_ads" as never).select("platform, ad_id, creative_id").in("creative_id", creatives.map((c) => c.id));
  return ((links ?? []) as { platform: string; ad_id: string; creative_id: string }[])
    .map((l) => ({ platform: l.platform, adId: l.ad_id, code: byId.get(l.creative_id)!.code, title: byId.get(l.creative_id)!.title }));
}

/** Période du filtre → plage de dates Meta (null = depuis le début). */
export function periodToRange(period: string): { since: string; until: string } | null {
  const { from, to } = periodRange(period);
  if (!from || !to) return null;
  const until = new Date(to.getTime() - 86400_000);
  return { since: from.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) };
}

// ── Suivi des livraisons pour l'éditeur — SANS aucune donnée client ──────────
export type EditorDeliveryRow = {
  orderNumber: string;
  createdAt: string;
  code: string;
  productName: string;
  status: string;
  dgLabel: string | null;
  dgId: number | null;
  reportedTo: string | null;
  deliveredAt: string | null;
  earning: number | null;
};

export async function getEditorDeliveries(opts: { editorId: string; month?: string | null }): Promise<EditorDeliveryRow[]> {
  const { from, to } = periodRange(opts.month);
  const { data: cr } = await supabaseAdmin.from("creatives" as never)
    .select("id, code, product_id").eq("editor_id", opts.editorId);
  const creatives = (cr ?? []) as { id: string; code: string; product_id: string | null }[];
  if (!creatives.length) return [];
  const byId = new Map(creatives.map((c) => [c.id, c]));

  // ⚠️ On ne sélectionne volontairement AUCUN champ client (nom, téléphone,
  // adresse, ville) ni le tracking / téléphone livreur.
  let q = supabaseAdmin.from("orders")
    .select("id, order_number, created_at, status, creative_id, delivered_at, delivery_external_status, delivery_external_status_id, delivery_reported_to, editor_earning_mad")
    .in("creative_id" as never, creatives.map((c) => c.id))
    .order("created_at", { ascending: false })
    .limit(1000);
  if (from && to) q = q.gte("created_at", from.toISOString()).lt("created_at", to.toISOString());
  const { data } = await q;
  const rows = (data ?? []) as unknown as {
    id: string; order_number: string; created_at: string; status: string; creative_id: string;
    delivered_at: string | null; delivery_external_status: string | null; delivery_external_status_id: number | null;
    delivery_reported_to: string | null; editor_earning_mad: number | null;
  }[];

  const pids = [...new Set(creatives.map((c) => c.product_id).filter(Boolean))] as string[];
  const { data: prods } = pids.length
    ? await supabaseAdmin.from("products").select("id, name").in("id", pids)
    : { data: [] };
  const pname = new Map(((prods ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

  return rows.map((r) => {
    const c = byId.get(r.creative_id);
    return {
      orderNumber: r.order_number,
      createdAt: r.created_at,
      code: c?.code ?? "—",
      productName: c?.product_id ? pname.get(c.product_id) ?? "—" : "—",
      status: r.status,
      dgLabel: r.delivery_external_status,
      dgId: r.delivery_external_status_id,
      reportedTo: r.delivery_reported_to,
      deliveredAt: r.delivered_at,
      earning: (r.status === "delivered" || r.status === "paid") ? r.editor_earning_mad : null,
    };
  });
}
