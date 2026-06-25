"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { MetaAdsClient } from "./meta/client";
import { matchCampaignsToProducts, type ProductForMatching } from "./matcher";

export type AdPlatformSettings = {
  id: string;
  platform: "meta" | "google" | "tiktok";
  access_token: string;
  account_id: string;
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
};

export async function getAdPlatformSettings(platform: "meta" | "google" | "tiktok"): Promise<AdPlatformSettings | null> {
  await requireRole(["super_admin", "admin", "manager", "finance"]);
  const { data } = await supabaseAdmin
    .from("ad_platform_settings")
    .select("*")
    .eq("platform", platform)
    .maybeSingle();
  return data as AdPlatformSettings | null;
}

export async function saveAdPlatformSettings(platform: "meta" | "google" | "tiktok", input: {
  access_token: string;
  account_id: string;
}) {
  await requireRole(["super_admin", "admin"]);

  const { error } = await supabaseAdmin
    .from("ad_platform_settings")
    .upsert({
      platform,
      access_token: input.access_token.trim(),
      account_id: input.account_id.trim(),
      is_active: input.access_token.trim().length > 0 && input.account_id.trim().length > 0,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: "platform" });

  revalidatePath("/admin/settings/ads");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function testMetaConnection() {
  await requireRole(["super_admin", "admin", "manager", "finance"]);
  const settings = await getAdPlatformSettings("meta");
  if (!settings) return { ok: false, error: "Aucun paramètre Meta enregistré." };

  const client = new MetaAdsClient(settings.access_token, settings.account_id);
  return client.testConnection();
}

/**
 * Pull campaign spend from Meta for the given date range, match campaigns to
 * products by SKU, and store the result in product_ad_spend. This overwrites
 * any previous sync for the same period (upsert on product_id+platform+period).
 */
export async function syncMetaAdSpend(dateFrom: string, dateTo: string) {
  await requireRole(["super_admin", "admin", "manager", "finance"]);

  const settings = await getAdPlatformSettings("meta");
  if (!settings || !settings.is_active) {
    return { ok: false as const, error: "Intégration Meta Ads non configurée." };
  }

  const client = new MetaAdsClient(settings.access_token, settings.account_id);
  const result = await client.getCampaignSpend(dateFrom, dateTo);

  if (!result.ok) {
    await supabaseAdmin.from("ad_platform_settings").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "error",
      last_sync_error: result.error,
    } as never).eq("platform", "meta");
    return { ok: false as const, error: result.error };
  }

  const { data: products } = await supabaseAdmin.from("products").select("id, sku, name");
  const productList = (products ?? []) as ProductForMatching[];

  // Load manual assignments
  const { data: manualAssignments } = await supabaseAdmin
    .from("campaign_product_assignments")
    .select("campaign_id, campaign_name, product_id")
    .eq("platform", "meta");
  const manualMap = new Map<string, string>(); // campaign_id → product_id
  for (const a of (manualAssignments ?? []) as { campaign_id: string; product_id: string }[]) {
    manualMap.set(a.campaign_id, a.product_id);
  }

  // Build spend per product using manual assignments first, then SKU matching
  const spendByProduct = new Map<string, { spend: number; campaign_names: string[] }>();

  for (const campaign of result.campaigns) {
    if (campaign.spend === 0) continue;
    // Manual assignment takes priority
    const manualProductId = manualMap.get(campaign.campaign_id);
    if (manualProductId) {
      const existing = spendByProduct.get(manualProductId) ?? { spend: 0, campaign_names: [] };
      existing.spend += campaign.spend;
      existing.campaign_names.push(campaign.campaign_name);
      spendByProduct.set(manualProductId, existing);
    }
  }

  // Fallback SKU matching for unassigned campaigns
  const assignedCampaignIds = new Set(manualMap.keys());
  const unassignedCampaigns = result.campaigns.filter((c) => !assignedCampaignIds.has(c.campaign_id) && c.spend > 0);
  const { matches } = matchCampaignsToProducts(productList, unassignedCampaigns);
  for (const match of matches) {
    if (match.matched_campaign_names.length === 0) continue;
    const existing = spendByProduct.get(match.product_id) ?? { spend: 0, campaign_names: [] };
    existing.spend += match.total_spend;
    existing.campaign_names.push(...match.matched_campaign_names);
    spendByProduct.set(match.product_id, existing);
  }

  // Taux USD→MAD depuis app_settings (clé: meta_usd_to_mad, défaut: 10)
  const { data: rateRow } = await supabaseAdmin.from("app_settings").select("value").eq("key", "meta_usd_to_mad").maybeSingle();
  const USD_TO_MAD = Number((rateRow as { value?: string } | null)?.value ?? 10);

  const rowsToUpsert = [...spendByProduct.entries()].map(([product_id, { spend, campaign_names }]) => ({
    product_id,
    platform: "meta" as const,
    matched_campaign_names: campaign_names,
    spend_mad: Math.round(spend * USD_TO_MAD * 100) / 100,
    period_start: dateFrom,
    period_end: dateTo,
    synced_at: new Date().toISOString(),
  }));

  if (rowsToUpsert.length > 0) {
    const { error: upsertErr } = await supabaseAdmin
      .from("product_ad_spend")
      .upsert(rowsToUpsert as never, { onConflict: "product_id,platform,period_start,period_end" });
    if (upsertErr) {
      return { ok: false as const, error: `Échec de sauvegarde: ${upsertErr.message}` };
    }
  }

  await supabaseAdmin.from("ad_platform_settings").update({
    last_sync_at: new Date().toISOString(),
    last_sync_status: "ok",
    last_sync_error: null,
  } as never).eq("platform", "meta");

  revalidatePath("/admin/finance");

  return {
    ok: true as const,
    matchedProducts: rowsToUpsert.length,
    totalSpendMatched: rowsToUpsert.reduce((s, r) => s + r.spend_mad, 0),
    unmatchedCampaigns: result.campaigns
      .filter((c) => !assignedCampaignIds.has(c.campaign_id) && c.spend > 0)
      .filter((c) => !matches.find((m) => m.matched_campaign_names.includes(c.campaign_name)))
      .map((c) => ({ name: c.campaign_name, spend: c.spend })),
  };
}

/** List all Meta campaigns for manual assignment UI */
export async function listMetaCampaigns() {
  await requireRole(["super_admin", "admin", "manager"]);
  const settings = await getAdPlatformSettings("meta");
  if (!settings?.is_active) return { ok: false as const, error: "Meta non configuré" };
  const client = new MetaAdsClient(settings.access_token, settings.account_id);
  return client.listCampaigns();
}

/** Save manual campaign→product assignments */
export async function saveCampaignAssignments(
  assignments: { campaign_id: string; campaign_name: string; product_id: string | null }[]
) {
  await requireRole(["super_admin", "admin", "manager"]);
  // Delete existing and reinsert
  await supabaseAdmin.from("campaign_product_assignments").delete().eq("platform", "meta");
  const rows = assignments
    .filter((a) => a.product_id)
    .map((a) => ({ platform: "meta", campaign_id: a.campaign_id, campaign_name: a.campaign_name, product_id: a.product_id }));
  if (rows.length > 0) {
    await supabaseAdmin.from("campaign_product_assignments").insert(rows as never);
  }
  return { ok: true as const };
}

/** Get saved campaign assignments */
export async function getCampaignAssignments() {
  await requireRole(["super_admin", "admin", "manager"]);
  const { data } = await supabaseAdmin
    .from("campaign_product_assignments")
    .select("campaign_id, campaign_name, product_id")
    .eq("platform", "meta");
  return (data ?? []) as { campaign_id: string; campaign_name: string; product_id: string }[];
}
