/**
 * lib/ads/meta-live.ts — lecture EN DIRECT de Meta (au moment où la page s'ouvre),
 * avec les mêmes colonnes que Meta Ads Manager. Server-only.
 */
import { readSettings } from "./sync-core";
import { deriveDelivery, type Delivery } from "./meta-status";

const META = "https://graph.facebook.com/v21.0";

export type MetaLiveAd = {
  id: string;
  name: string;
  delivery: Delivery;            // comme la colonne "Diffusion" de Meta
  adsetName: string | null;
  attribution: string;
  resultLabel: string;
  results: number | null;
  costPerResultUsd: number | null;
  budget: { usd: number; kind: "Quotidien" | "Total"; level: "Ensemble" | "Campagne" } | null;
  spendUsd: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;              // Clics (tous)
  linkClicks: number;
  videoPlays: number;
  thruplays: number;
  ends: string | null;           // null = En continu
  bidStrategy: string;
  lastEdit: string | null;
  quality: string | null;
  engagement: string | null;
  conversion: string | null;
};

const BID: Record<string, string> = {
  LOWEST_COST_WITHOUT_CAP: "Volume le plus élevé",
  COST_CAP: "Objectif de coût par résultat",
  LOWEST_COST_WITH_BID_CAP: "Plafond d'enchère",
  LOWEST_COST_WITH_MIN_ROAS: "Objectif de ROAS",
};

// Événement optimisé → actions Meta qui forment la colonne "Résultats"
function resultSpec(goal?: string, event?: string): { label: string; types: string[] } {
  switch (event) {
    case "LEAD": return { label: "Prospects (site web)", types: ["lead", "offsite_conversion.fb_pixel_lead", "onsite_web_lead"] };
    case "PURCHASE": return { label: "Achats", types: ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"] };
    case "INITIATED_CHECKOUT": return { label: "Paiements initiés", types: ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"] };
    case "COMPLETE_REGISTRATION": return { label: "Inscriptions", types: ["complete_registration", "offsite_conversion.fb_pixel_complete_registration"] };
    case "CONTACT": return { label: "Contacts", types: ["contact", "offsite_conversion.fb_pixel_contact"] };
  }
  switch (goal) {
    case "CONVERSATIONS": return { label: "Conversations", types: ["onsite_conversion.messaging_conversation_started_7d"] };
    case "LINK_CLICKS": return { label: "Clics sur le lien", types: ["link_click"] };
    case "LANDING_PAGE_VIEWS": return { label: "Vues de page", types: ["landing_page_view"] };
    case "THRUPLAY": return { label: "ThruPlays", types: ["__thruplay"] };
    case "LEAD_GENERATION": return { label: "Prospects (formulaire)", types: ["lead", "onsite_conversion.lead_grouped"] };
  }
  return { label: "Résultats", types: ["lead", "purchase"] };
}

function attributionLabel(spec?: { event_type: string; window_days: number }[]) {
  if (!spec?.length) return "—";
  const map: Record<string, string> = {
    CLICK_THROUGH: "clic", VIEW_THROUGH: "vue", ENGAGED_VIDEO_VIEW: "vue engagée",
  };
  return spec.map((s) => `${s.window_days} j après ${map[s.event_type] ?? s.event_type.toLowerCase()}`).join(", ");
}

const val = (arr: { action_type: string; value: string }[] | undefined, types: string[]) => {
  if (!arr) return null;
  for (const t of types) { const a = arr.find((x) => x.action_type === t); if (a) return Number(a.value); }
  return null;
};

export async function getMetaAdsLive(adIds: string[], range: { since: string; until: string } | null):
  Promise<{ ok: true; ads: MetaLiveAd[]; fetchedAt: string } | { ok: false; error: string }> {
  if (!adIds.length) return { ok: true, ads: [], fetchedAt: new Date().toISOString() };
  const s = await readSettings("meta");
  if (!s?.access_token) return { ok: false, error: "Meta non configuré" };

  const insights = range
    ? `insights.time_range(${JSON.stringify(range)})`
    : "insights.date_preset(maximum)";
  const fields = [
    "name", "effective_status", "updated_time", "issues_info",
    "adset{name,daily_budget,lifetime_budget,start_time,end_time,learning_stage_info,bid_strategy,attribution_spec,optimization_goal,promoted_object,campaign{bid_strategy,daily_budget,lifetime_budget}}",
    `${insights}{spend,impressions,reach,frequency,clicks,actions,cost_per_action_type,quality_ranking,engagement_rate_ranking,conversion_rate_ranking,inline_link_clicks,video_thruplay_watched_actions}`,
  ].join(",");

  const ads: MetaLiveAd[] = [];
  for (let i = 0; i < adIds.length; i += 50) {
    const url = new URL(`${META}/`);
    url.searchParams.set("ids", adIds.slice(i, i + 50).join(","));
    url.searchParams.set("fields", fields);
    url.searchParams.set("access_token", s.access_token);
    const res = await fetch(url.toString(), { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || json.error) return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };

    for (const [id, a] of Object.entries(json as Record<string, Record<string, unknown>>)) {
      const adset = (a.adset ?? {}) as Record<string, unknown>;
      const campaign = (adset.campaign ?? {}) as Record<string, unknown>;
      const promoted = (adset.promoted_object ?? {}) as Record<string, string>;
      const ins = (((a.insights as { data?: Record<string, unknown>[] })?.data) ?? [])[0] ?? {};
      const actions = ins.actions as { action_type: string; value: string }[] | undefined;
      const costs = ins.cost_per_action_type as { action_type: string; value: string }[] | undefined;
      const thru = val(ins.video_thruplay_watched_actions as { action_type: string; value: string }[] | undefined, ["video_view"]) ?? 0;

      const spec = resultSpec(adset.optimization_goal as string, promoted.custom_event_type);
      const results = spec.types[0] === "__thruplay" ? thru : val(actions, spec.types);
      const spend = Number(ins.spend ?? 0);
      const cpr = spec.types[0] === "__thruplay"
        ? (thru ? spend / thru : null)
        : (val(costs, spec.types) ?? (results ? spend / results : null));

      const pick = (o: Record<string, unknown>, level: "Ensemble" | "Campagne") => {
        const d = Number(o.daily_budget ?? 0), l = Number(o.lifetime_budget ?? 0);
        if (d > 0) return { usd: d / 100, kind: "Quotidien" as const, level };
        if (l > 0) return { usd: l / 100, kind: "Total" as const, level };
        return null;
      };

      ads.push({
        id,
        name: String(a.name ?? id),
        delivery: deriveDelivery(a),
        adsetName: (adset.name as string) ?? null,
        attribution: attributionLabel(adset.attribution_spec as { event_type: string; window_days: number }[]),
        resultLabel: spec.label,
        results,
        costPerResultUsd: cpr,
        budget: pick(adset, "Ensemble") ?? pick(campaign, "Campagne"),
        spendUsd: spend,
        impressions: Number(ins.impressions ?? 0),
        reach: Number(ins.reach ?? 0),
        frequency: Number(ins.frequency ?? 0),
        clicks: Number(ins.clicks ?? 0),
        linkClicks: Number(ins.inline_link_clicks ?? 0),
        videoPlays: val(actions, ["video_view"]) ?? 0,
        thruplays: thru,
        ends: (adset.end_time as string) ?? null,
        bidStrategy: BID[(adset.bid_strategy ?? campaign.bid_strategy) as string] ?? String(adset.bid_strategy ?? campaign.bid_strategy ?? "—"),
        lastEdit: (a.updated_time as string) ?? null,
        quality: (ins.quality_ranking as string) ?? null,
        engagement: (ins.engagement_rate_ranking as string) ?? null,
        conversion: (ins.conversion_rate_ranking as string) ?? null,
      });
    }
  }
  return { ok: true, ads: ads.sort((x, y) => y.spendUsd - x.spendUsd), fetchedAt: new Date().toISOString() };
}

/** Toutes les pubs du compte (hors supprimées/archivées) — pour la vue admin. */
export async function getAccountAdIds(): Promise<string[]> {
  const s = await readSettings("meta");
  if (!s?.access_token || !s.account_id) return [];
  const acc = s.account_id.startsWith("act_") ? s.account_id : `act_${s.account_id}`;
  const url = new URL(`${META}/${acc}/ads`);
  url.searchParams.set("fields", "id");
  url.searchParams.set("limit", "500");
  url.searchParams.set("effective_status", JSON.stringify([
    "ACTIVE", "PAUSED", "ADSET_PAUSED", "CAMPAIGN_PAUSED", "IN_PROCESS", "PENDING_REVIEW",
    "WITH_ISSUES", "DISAPPROVED", "PREAPPROVED", "PENDING_BILLING_INFO",
  ]));
  url.searchParams.set("access_token", s.access_token);
  const ids: string[] = [];
  let next: string | undefined = url.toString();
  for (let g = 0; next && g < 10; g++) {
    const res: Response = await fetch(next, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || json.error) break;
    ids.push(...((json.data ?? []) as { id: string }[]).map((a) => a.id));
    next = json.paging?.next;
  }
  return ids;
}
