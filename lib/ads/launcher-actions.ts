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
  revalidatePath("/admin/ads/launch");
  return { success: true, data: { id: (data as { id: string }).id } };
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
}): Promise<Result> {
  await requireRole([...MANAGERS]);
  if (!input.primaryText.trim() || !input.headline.trim()) return { success: false, error: "Texte et titre obligatoires." };
  const { error } = await supabaseAdmin.from("campaign_launch_items" as never).insert({
    launch_id: launchId, creative_id: input.creativeId || null, media_type: input.mediaType, media_path: input.mediaPath,
    primary_text: input.primaryText.trim(), headline: input.headline.trim().slice(0, 255), cta: input.cta,
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
