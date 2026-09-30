"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { MetaAdsClient } from "./meta/client";
import { syncMetaAdSpendCore, syncTikTokAdSpendCore } from "./sync-core";

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

export async function testTikTokConnection() {
  await requireRole(["super_admin", "admin", "manager", "finance"]);
  const settings = await getAdPlatformSettings("tiktok");
  if (!settings) return { ok: false, error: "Aucun paramètre TikTok enregistré." };

  const { TikTokAdsClient } = await import("./tiktok/client");
  const client = new TikTokAdsClient(settings.access_token, settings.account_id);
  return client.testConnection();
}

/**
 * Pull campaign spend from Meta for the given date range, match campaigns to
 * products by SKU, and store the result in product_ad_spend. This overwrites
 * any previous sync for the same period (upsert on product_id+platform+period).
 */
export async function syncMetaAdSpend(dateFrom: string, dateTo: string) {
  await requireRole(["super_admin", "admin", "manager", "finance"]);
  return syncMetaAdSpendCore(dateFrom, dateTo);
}

export async function syncTikTokAdSpend(dateFrom: string, dateTo: string) {
  await requireRole(["super_admin", "admin", "manager", "finance"]);
  return syncTikTokAdSpendCore(dateFrom, dateTo);
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
