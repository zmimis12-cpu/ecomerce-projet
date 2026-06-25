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

  const { matches, unmatchedCampaigns } = matchCampaignsToProducts(productList, result.campaigns);

  // Taux USD→MAD depuis app_settings (clé: meta_usd_to_mad, défaut: 10)
  const { data: rateRow } = await supabaseAdmin.from("app_settings").select("value").eq("key", "meta_usd_to_mad").maybeSingle();
  const USD_TO_MAD = Number((rateRow as { value?: string } | null)?.value ?? 10);

  const rowsToUpsert = matches
    .filter((m) => m.matched_campaign_names.length > 0)
    .map((m) => ({
      product_id: m.product_id,
      platform: "meta" as const,
      matched_campaign_names: m.matched_campaign_names,
      spend_mad: Math.round(m.total_spend * USD_TO_MAD * 100) / 100,
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
    unmatchedCampaigns: unmatchedCampaigns.map((c) => ({ name: c.campaign_name, spend: c.spend })),
  };
}
