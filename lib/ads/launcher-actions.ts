"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { processLaunch, activateLaunch, productEconomics, textSuggestions, type Economics } from "./launcher";

const MANAGERS = ["super_admin", "admin", "manager"] as const;
type Result<T = undefined> = { success: boolean; error?: string; data?: T };

export async function getProductEconomics(productId: string): Promise<Result<{ eco: Economics; texts: { headline: string; primary: string }[] }>> {
  await requireRole([...MANAGERS]);
  try {
    const eco = await productEconomics(productId);
    const { data: p } = await supabaseAdmin.from("products").select("name").eq("id", productId).single();
    return { success: true, data: { eco, texts: textSuggestions((p as unknown as { name: string }).name, eco.price, eco.offer) } };
  } catch (e) { return { success: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Coût max voulu par LIVRAISON → plafond Meta par LEAD (× taux commande→livraison). */
async function costCapFor(productId: string, maxPerDelivered?: number | null) {
  if (!maxPerDelivered || maxPerDelivered <= 0) return {};
  const eco = await productEconomics(productId);
  const perOrderMad = maxPerDelivered * eco.ordersToDelivered;
  return { max_cost_per_delivered_mad: maxPerDelivered, cost_cap_usd: Math.max(0.5, Math.round((perOrderMad / eco.fxRate) * 100) / 100) };
}

export async function createLaunch(input: { name: string; productId: string; budgetUsd: number; ageMin: number; ageMax: number; maxCostPerDeliveredMad?: number | null }): Promise<Result<{ id: string }>> {
  const session = await requireRole([...MANAGERS]);
  if (!input.productId) return { success: false, error: "Choisis un produit." };
  if (!input.name.trim()) return { success: false, error: "Donne un nom à la campagne." };
  if (!(input.budgetUsd >= 1)) return { success: false, error: "Budget minimum : 1 $ / jour." };
  const { data, error } = await supabaseAdmin.from("campaign_launches" as never).insert({
    name: input.name.trim(), product_id: input.productId, daily_budget_usd: input.budgetUsd,
    age_min: Math.max(18, input.ageMin || 18), age_max: Math.min(65, input.ageMax || 65), created_by: session.authId,
    ...(await costCapFor(input.productId, input.maxCostPerDeliveredMad)),
  } as never).select("id").single();
  if (error) return { success: false, error: error.message };
  const launchId = (data as { id: string }).id;
  // Ensemble de pubs par défaut (modifiable / duplicable ensuite)
  const cap = await costCapFor(input.productId, input.maxCostPerDeliveredMad);
  await supabaseAdmin.from("campaign_launch_adsets" as never).insert({
    launch_id: launchId, name: `${input.name.trim()} — Large Maroc`, daily_budget_usd: input.budgetUsd,
    age_min: Math.max(18, input.ageMin || 18), age_max: Math.min(65, input.ageMax || 65),
    ...("cost_cap_usd" in cap ? { bid_strategy: "COST_CAP", cost_cap_usd: (cap as { cost_cap_usd: number }).cost_cap_usd } : {}),
  } as never);
  revalidatePath("/admin/ads/launch");
  return { success: true, data: { id: launchId } };
}

/** Lien d'envoi direct navigateur → stockage (pas de limite de taille serveur). */
export async function getUploadUrl(fileName: string): Promise<Result<{ path: string; token: string }>> {
  await requireRole([...MANAGERS]);
  const safe = fileName.normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-80);
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safe}`;
  const { data, error } = await supabaseAdmin.storage.from("ad-media").createSignedUploadUrl(path);
  if (error || !data) return { success: false, error: error?.message ?? "Échec" };
  return { success: true, data: { path, token: data.token } };
}

export async function addLaunchItem(launchId: string, input: {
  creativeId: string | null; mediaType: "video" | "image"; mediaPath: string; primaryText: string; headline: string; cta: string;
  adsetRef?: string | null; adName?: string; description?: string; displayLink?: string; urlOverride?: string;
}): Promise<Result> {
  await requireRole([...MANAGERS]);
  if (!input.primaryText.trim() || !input.headline.trim()) return { success: false, error: "Texte et titre obligatoires." };
  const { error } = await supabaseAdmin.from("campaign_launch_items" as never).insert({
    launch_id: launchId, creative_id: input.creativeId || null, media_type: input.mediaType, media_path: input.mediaPath,
    primary_text: input.primaryText.trim(), headline: input.headline.trim().slice(0, 255), cta: input.cta,
    adset_ref: input.adsetRef || null, ad_name: input.adName?.trim() || null, description: input.description?.trim() || null,
    display_link: input.displayLink?.trim() || null, url_override: input.urlOverride?.trim() || null,
  } as never);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/ads/launch/${launchId}`);
  return { success: true };
}

export async function deleteLaunchItem(launchId: string, itemId: string): Promise<Result> {
  await requireRole([...MANAGERS]);
  const { data } = await supabaseAdmin.from("campaign_launch_items" as never).select("status, media_path").eq("id", itemId).single();
  const it = data as { status: string; media_path: string } | null;
  if (it?.status === "created") return { success: false, error: "Pub déjà créée dans Meta : supprime-la dans Ads Manager." };
  await supabaseAdmin.from("campaign_launch_items" as never).delete().eq("id", itemId);
  if (it?.media_path) await supabaseAdmin.storage.from("ad-media").remove([it.media_path]);
  revalidatePath(`/admin/ads/launch/${launchId}`);
  return { success: true };
}

export async function runLaunch(launchId: string): Promise<Result<{ status: string }>> {
  await requireRole([...MANAGERS]);
  const r = await processLaunch(launchId);
  revalidatePath(`/admin/ads/launch/${launchId}`);
  revalidatePath("/admin/ads/launch");
  return r.ok ? { success: true, data: { status: String(r.status) } } : { success: false, error: r.error };
}

export async function activateLaunchAction(launchId: string): Promise<Result> {
  await requireRole(["super_admin", "admin"]);
  try { await activateLaunch(launchId); }
  catch (e) { return { success: false, error: e instanceof Error ? e.message : String(e) }; }
  revalidatePath(`/admin/ads/launch/${launchId}`);
  revalidatePath("/admin/ads/launch");
  return { success: true };
}

export async function deleteLaunch(launchId: string): Promise<Result> {
  await requireRole(["super_admin", "admin"]);
  const { data } = await supabaseAdmin.from("campaign_launches" as never).select("meta_campaign_id").eq("id", launchId).single();
  if ((data as { meta_campaign_id: string | null } | null)?.meta_campaign_id) {
    return { success: false, error: "Déjà créée dans Meta : supprime-la dans Ads Manager." };
  }
  const { data: its } = await supabaseAdmin.from("campaign_launch_items" as never).select("media_path").eq("launch_id", launchId);
  const paths = ((its ?? []) as { media_path: string }[]).map((i) => i.media_path);
  if (paths.length) await supabaseAdmin.storage.from("ad-media").remove(paths);
  await supabaseAdmin.from("campaign_launches" as never).delete().eq("id", launchId);
  revalidatePath("/admin/ads/launch");
  return { success: true };
}


/* ─────────────── Niveau Campagne ─────────────── */
export async function updateLaunchCampaign(launchId: string, patch: {
  name?: string; objective?: string; budgetMode?: "abo" | "cbo"; campaignBudgetUsd?: number | null;
}): Promise<Result> {
  await requireRole([...MANAGERS]);
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.objective) row.objective = patch.objective;
  if (patch.budgetMode) row.budget_mode = patch.budgetMode;
  if (patch.campaignBudgetUsd !== undefined) row.campaign_budget_usd = patch.campaignBudgetUsd;
  const { error } = await supabaseAdmin.from("campaign_launches" as never).update(row as never).eq("id", launchId).is("meta_campaign_id", null);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/ads/launch/${launchId}`);
  return { success: true };
}

/* ─────────────── Niveau Ensemble de pubs ─────────────── */
export type AdsetInput = {
  name: string; dailyBudgetUsd: number; optimizationEvent: string; bidStrategy: string; costCapUsd: number | null;
  ageMin: number; ageMax: number; genders: string; advantageAudience: boolean;
  placements: "auto" | { facebook: string[]; instagram: string[] }; startTime: string | null; endTime: string | null;
};
const adsetRow = (i: AdsetInput) => ({
  name: i.name.trim() || "Ensemble", daily_budget_usd: i.dailyBudgetUsd, optimization_event: i.optimizationEvent,
  bid_strategy: i.bidStrategy, cost_cap_usd: i.bidStrategy === "COST_CAP" ? i.costCapUsd : null,
  age_min: Math.max(18, i.ageMin), age_max: Math.min(65, i.ageMax), genders: i.genders, advantage_audience: i.advantageAudience,
  placements: i.placements, start_time: i.startTime || null, end_time: i.endTime || null,
});

export async function saveAdset(launchId: string, adsetId: string | null, input: AdsetInput): Promise<Result> {
  await requireRole([...MANAGERS]);
  if (input.bidStrategy === "COST_CAP" && !(Number(input.costCapUsd) > 0)) return { success: false, error: "Indique le plafond Cost Cap." };
  if (adsetId) {
    const { data } = await supabaseAdmin.from("campaign_launch_adsets" as never).select("meta_adset_id").eq("id", adsetId).single();
    if ((data as { meta_adset_id: string | null } | null)?.meta_adset_id) return { success: false, error: "Déjà créé dans Meta : modifie-le dans Ads Manager." };
    await supabaseAdmin.from("campaign_launch_adsets" as never).update(adsetRow(input) as never).eq("id", adsetId);
  } else {
    const { count } = await supabaseAdmin.from("campaign_launch_adsets" as never).select("id", { count: "exact", head: true }).eq("launch_id", launchId);
    await supabaseAdmin.from("campaign_launch_adsets" as never).insert({ ...adsetRow(input), launch_id: launchId, position: count ?? 0 } as never);
  }
  revalidatePath(`/admin/ads/launch/${launchId}`);
  return { success: true };
}

export async function duplicateAdset(launchId: string, adsetId: string): Promise<Result> {
  await requireRole([...MANAGERS]);
  const { data } = await supabaseAdmin.from("campaign_launch_adsets" as never).select("*").eq("id", adsetId).single();
  const a = data as unknown as Record<string, unknown>;
  const { id: _i, meta_adset_id: _m, status: _s, error: _e, created_at: _c, ...rest } = a;
  void _i; void _m; void _s; void _e; void _c;
  const { data: newSet } = await supabaseAdmin.from("campaign_launch_adsets" as never)
    .insert({ ...rest, name: `${a.name} (copie)`, position: Number(a.position ?? 0) + 1 } as never).select("id").single();
  // Duplique aussi les pubs (même fichier, mêmes textes)
  const { data: items } = await supabaseAdmin.from("campaign_launch_items" as never).select("*").eq("adset_ref", adsetId);
  for (const it of (items ?? []) as Record<string, unknown>[]) {
    const { id: _a, status: _b, meta_video_id: _v, meta_image_hash: _h, meta_creative_id: _cr, meta_ad_id: _ad, error: _er, created_at: _ca, ...r } = it;
    void _a; void _b; void _v; void _h; void _cr; void _ad; void _er; void _ca;
    await supabaseAdmin.from("campaign_launch_items" as never).insert({ ...r, adset_ref: (newSet as unknown as { id: string }).id } as never);
  }
  revalidatePath(`/admin/ads/launch/${launchId}`);
  return { success: true };
}

export async function deleteAdset(launchId: string, adsetId: string): Promise<Result> {
  await requireRole([...MANAGERS]);
  const { data } = await supabaseAdmin.from("campaign_launch_adsets" as never).select("meta_adset_id").eq("id", adsetId).single();
  if ((data as { meta_adset_id: string | null } | null)?.meta_adset_id) return { success: false, error: "Déjà créé dans Meta." };
  await supabaseAdmin.from("campaign_launch_adsets" as never).delete().eq("id", adsetId);
  revalidatePath(`/admin/ads/launch/${launchId}`);
  return { success: true };
}

/* ─────────────── Niveau Pub : modifier les textes ─────────────── */
export async function updateLaunchItem(launchId: string, itemId: string, patch: {
  adName?: string; primaryText?: string; headline?: string; description?: string; displayLink?: string; urlOverride?: string; cta?: string; adsetRef?: string;
}): Promise<Result> {
  await requireRole([...MANAGERS]);
  const row: Record<string, unknown> = {};
  if (patch.adName !== undefined) row.ad_name = patch.adName.trim() || null;
  if (patch.primaryText !== undefined) row.primary_text = patch.primaryText;
  if (patch.headline !== undefined) row.headline = patch.headline.slice(0, 255);
  if (patch.description !== undefined) row.description = patch.description.trim() || null;
  if (patch.displayLink !== undefined) row.display_link = patch.displayLink.trim() || null;
  if (patch.urlOverride !== undefined) row.url_override = patch.urlOverride.trim() || null;
  if (patch.cta) row.cta = patch.cta;
  if (patch.adsetRef) row.adset_ref = patch.adsetRef;
  const { error } = await supabaseAdmin.from("campaign_launch_items" as never).update(row as never).eq("id", itemId).neq("status", "created");
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/ads/launch/${launchId}`);
  return { success: true };
}
