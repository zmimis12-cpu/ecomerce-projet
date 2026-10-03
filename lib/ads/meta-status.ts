/**
 * lib/ads/meta-status.ts — statut de diffusion EN DIRECT (comme la colonne
 * "Diffusion" de Meta Ads Manager) + statut automatique de chaque vidéo.
 * Server-only.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readSettings } from "./sync-core";

const META = "https://graph.facebook.com/v21.0";

export type Tone = "green" | "blue" | "amber" | "red" | "gray";
export type Delivery = { key: string; label: string; tone: Tone; rank: number };

/** Même logique que la colonne "Diffusion" de Meta Ads Manager. */
export function deriveDelivery(ad: Record<string, unknown>): Delivery {
  const st = String(ad.effective_status ?? "");
  const adset = (ad.adset ?? {}) as Record<string, unknown>;
  const learning = ((adset.learning_stage_info ?? {}) as Record<string, string>).status;
  const now = Date.now();
  const start = adset.start_time ? new Date(String(adset.start_time)).getTime() : 0;
  const end = adset.end_time ? new Date(String(adset.end_time)).getTime() : 0;
  const issues = (ad.issues_info as unknown[] | undefined)?.length ?? 0;

  switch (st) {
    case "ACTIVE":
      if (start > now) return { key: "SCHEDULED", label: "Programmée", tone: "blue", rank: 3 };
      if (end && end < now) return { key: "COMPLETED", label: "Terminée", tone: "gray", rank: 8 };
      if (issues) return { key: "WITH_ISSUES", label: "Active – problème", tone: "amber", rank: 2 };
      if (learning === "LEARNING") return { key: "LEARNING", label: "Active – apprentissage", tone: "green", rank: 1 };
      if (learning === "FAIL") return { key: "LEARNING_LIMITED", label: "Apprentissage limité", tone: "amber", rank: 1 };
      return { key: "ACTIVE", label: "Active", tone: "green", rank: 0 };
    case "IN_PROCESS":
    case "PREAPPROVED":     return { key: "PREPARING", label: "En préparation", tone: "blue", rank: 4 };
    case "PENDING_REVIEW":  return { key: "IN_REVIEW", label: "En examen", tone: "blue", rank: 4 };
    case "WITH_ISSUES":     return { key: "WITH_ISSUES", label: "Problème", tone: "red", rank: 5 };
    case "DISAPPROVED":     return { key: "DISAPPROVED", label: "Refusée", tone: "red", rank: 5 };
    case "PENDING_BILLING_INFO": return { key: "BILLING", label: "Paiement requis", tone: "red", rank: 5 };
    case "ADSET_PAUSED":    return { key: "ADSET_OFF", label: "Ensemble de pubs désactivé", tone: "gray", rank: 6 };
    case "CAMPAIGN_PAUSED": return { key: "CAMPAIGN_OFF", label: "Campagne désactivée", tone: "gray", rank: 6 };
    case "PAUSED":          return { key: "OFF", label: "Désactivée", tone: "gray", rank: 6 };
    case "ARCHIVED":        return { key: "ARCHIVED", label: "Archivée", tone: "gray", rank: 9 };
    case "DELETED":         return { key: "DELETED", label: "Supprimée", tone: "gray", rank: 10 };
  }
  return { key: st || "UNKNOWN", label: st || "Inconnu", tone: "gray", rank: 11 };
}

export const TONE_CLS: Record<Tone, string> = {
  green: "bg-green-100 text-green-800",
  blue:  "bg-blue-100 text-blue-800",
  amber: "bg-amber-100 text-amber-800",
  red:   "bg-red-100 text-red-800",
  gray:  "bg-gray-100 text-gray-600",
};

export const DELIVERY_FIELDS =
  "effective_status,issues_info,adset{effective_status,start_time,end_time,learning_stage_info}";

/** Statut en direct de plusieurs pubs Meta. */
export async function getMetaDeliveries(adIds: string[]): Promise<Map<string, Delivery>> {
  const out = new Map<string, Delivery>();
  if (!adIds.length) return out;
  // Multi-comptes : chaque pub avec le token de son compte
  const { groupAdsByAccount } = await import("./meta-accounts");
  for (const grp of await groupAdsByAccount(adIds)) await deliveriesFor(grp.account.token, grp.ids, out);
  return out;
}

async function deliveriesFor(token: string, adIds: string[], out: Map<string, Delivery>) {
  const s = { access_token: token };
  try {
    const { fetchMetaByIds } = await import("./meta-fetch");
    const got = await fetchMetaByIds(adIds, DELIVERY_FIELDS, s.access_token);
    if (!got.ok) return;
    for (const [id, ad] of Object.entries(got.data)) out.set(id, deriveDelivery(ad));
  } catch { /* réseau : on garde ce qu'on a */ }
}

export type CreativeLive = { label: string; tone: Tone; detail: string; dbStatus: "in_ads" | "paused" | "draft" };

/** Statut automatique d'une vidéo = le "meilleur" statut de ses pubs. */
export function creativeStatusFrom(deliveries: Delivery[]): CreativeLive {
  if (!deliveries.length) return { label: "Aucune pub liée", tone: "gray", detail: "", dbStatus: "draft" };
  const best = [...deliveries].sort((a, b) => a.rank - b.rank)[0];
  const live = deliveries.filter((d) => d.rank <= 2).length;
  const detail = deliveries.length > 1 ? `${live} / ${deliveries.length} pubs actives` : "";
  if (best.rank <= 2) return { label: live > 1 ? `En pub (${live})` : best.label === "Active" ? "En pub" : best.label, tone: best.tone, detail, dbStatus: "in_ads" };
  return { label: best.label, tone: best.tone, detail, dbStatus: best.rank <= 5 ? "draft" : "paused" };
}

/** Statut en direct de chaque vidéo (creative_id → statut). */
export async function getCreativesLiveStatus(creativeIds: string[]): Promise<Map<string, CreativeLive>> {
  const out = new Map<string, CreativeLive>();
  if (!creativeIds.length) return out;
  const { data } = await supabaseAdmin
    .from("creative_ads" as never).select("platform, ad_id, creative_id").in("creative_id", creativeIds);
  const links = (data ?? []) as { platform: string; ad_id: string; creative_id: string }[];
  const deliveries = await getMetaDeliveries(links.filter((l) => l.platform === "meta").map((l) => l.ad_id));
  for (const id of creativeIds) {
    const ds = links.filter((l) => l.creative_id === id).map((l) => deliveries.get(l.ad_id)).filter(Boolean) as Delivery[];
    out.set(id, creativeStatusFrom(ds));
  }
  return out;
}

/** Cron : recopie le statut auto dans creatives.status (compteurs "vidéos en pub"). */
export async function syncCreativeStatuses() {
  const { data: cr } = await supabaseAdmin.from("creatives" as never).select("id, status");
  const creatives = (cr ?? []) as { id: string; status: string }[];
  const live = await getCreativesLiveStatus(creatives.map((c) => c.id));
  let changed = 0;
  for (const c of creatives) {
    const l = live.get(c.id);
    if (!l || l.label === "Aucune pub liée") continue; // pas de pub liée → on ne touche pas
    if (l.dbStatus !== c.status) {
      await supabaseAdmin.from("creatives" as never).update({ status: l.dbStatus } as never).eq("id", c.id);
      changed++;
    }
  }
  return { ok: true, changed };
}
