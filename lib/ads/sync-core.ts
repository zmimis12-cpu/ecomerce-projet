/**
 * lib/ads/sync-core.ts — synchro des dépenses pub SANS contrôle de session.
 * ⚠️ Server-only : appelé par les server actions (après requireRole) et par
 * le cron /api/cron/sync (protégé par CRON_SECRET). Ne PAS marquer "use server".
 */
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MetaAdsClient } from "./meta/client";
import { matchCampaignsToProducts, type ProductForMatching } from "./matcher";
import { getUsdToMad } from "./fx";

type Settings = { access_token: string; account_id: string; is_active: boolean };

export async function readSettings(platform: "meta" | "tiktok"): Promise<Settings | null> {
  if (platform === "meta") {
    // Multi-comptes : renvoie le compte PRINCIPAL (Lanceur, audience…)
    const { primaryMetaAccount } = await import("./meta-accounts");
    const p = await primaryMetaAccount();
    if (p) return { access_token: p.token, account_id: p.adAccountId!, is_active: true };
  }
  const { data } = await supabaseAdmin
    .from("ad_platform_settings")
    .select("access_token, account_id, is_active")
    .eq("platform", platform)
    .maybeSingle();
  return (data as Settings | null) ?? null;
}

async function syncMetaAdSpendOneRange(dateFrom: string, dateTo: string) {

  // Multi-comptes : les campagnes de TOUS les comptes Meta actifs sont additionnées
  const { activeMetaAccounts } = await import("./meta-accounts");
  const accounts = await activeMetaAccounts();
  if (!accounts.length) {
    return { ok: false as const, error: "Intégration Meta Ads non configurée." };
  }
  const merged: { campaign_id: string; campaign_name: string; spend: number }[] = [];
  const errs: string[] = [];
  for (const a of accounts) {
    const client = new MetaAdsClient(a.token, a.adAccountId!);
    const r = await client.getCampaignSpend(dateFrom, dateTo);
    // Taxe propre à chaque compte (ex : 20 % Maroc, 0 % compte USA)
    const { getAccountTaxConfig, taxFactorFor } = await import("./fx");
    const f = taxFactorFor(dateFrom, await getAccountTaxConfig(a));
    if (r.ok) merged.push(...(r.campaigns as { campaign_id: string; campaign_name: string; spend: number }[]).map((c) => ({ ...c, spend: Number(c.spend) * f })));
    else errs.push(`${a.label}: ${r.error}`);
  }
  // Si un compte échoue, on n'écrase PAS les chiffres déjà enregistrés (sinon sous-estimation)
  const result = errs.length
    ? { ok: false as const, error: errs.join(" | ") }
    : { ok: true as const, campaigns: merged };

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

  // Campagnes qui n'ont matché AUCUN produit (ni assignation manuelle, ni SKU) —
  // leur dépense existe bien chez Meta et doit compter dans le total global,
  // même si on ne peut pas l'attribuer à un produit précis.
  const matchedNames = new Set(matches.flatMap((m) => m.matched_campaign_names));
  const unmatchedCampaigns = unassignedCampaigns.filter((c) => !matchedNames.has(c.campaign_name));
  const unmatchedSpendUsd = unmatchedCampaigns.reduce((s, c) => s + c.spend, 0);

  // Taux USD→MAD réel du jour (marché + frais bancaires éventuels)
  const { base: USD_TO_MAD } = await getUsdToMad(dateFrom); // taxe appliquée compte par compte ci-dessus

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
    // Supprimer TOUTE ligne dont la période chevauche [dateFrom, dateTo] —
    // pas juste les lignes strictement incluses dedans. Sinon un resync avec
    // une fenêtre glissante (ex: "hier à aujourd'hui" chaque jour) laisse les
    // anciennes lignes qui chevauchent partiellement → double comptage cumulatif.
    await supabaseAdmin
      .from("product_ad_spend")
      .delete()
      .eq("platform", "meta")
      .lte("period_start", dateTo)
      .gte("period_end", dateFrom);

    const { error: upsertErr } = await supabaseAdmin
      .from("product_ad_spend")
      .insert(rowsToUpsert as never);
    if (upsertErr) {
      return { ok: false as const, error: `Échec de sauvegarde: ${upsertErr.message}` };
    }
  }

  // Sauvegarder la dépense non-matchée (même si 0, pour effacer une éventuelle
  // ancienne valeur si toutes les campagnes sont maintenant matchées).
  await supabaseAdmin
    .from("unmatched_ad_spend")
    .delete()
    .eq("platform", "meta")
    .lte("period_start", dateTo)
    .gte("period_end", dateFrom);

  if (unmatchedSpendUsd > 0) {
    await supabaseAdmin.from("unmatched_ad_spend").insert({
      platform:               "meta",
      matched_campaign_names: unmatchedCampaigns.map((c) => c.campaign_name),
      spend_mad:              Math.round(unmatchedSpendUsd * USD_TO_MAD * 100) / 100,
      period_start:           dateFrom,
      period_end:             dateTo,
    } as never);
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

async function syncTikTokAdSpendOneRange(dateFrom: string, dateTo: string) {

  const settings = await readSettings("tiktok");
  if (!settings || !settings.is_active) {
    return { ok: false as const, error: "Intégration TikTok Ads non configurée." };
  }

  const { TikTokAdsClient } = await import("./tiktok/client");
  const client = new TikTokAdsClient(settings.access_token, settings.account_id);
  const result = await client.getCampaignSpend(dateFrom, dateTo);

  if (!result.ok) {
    await supabaseAdmin.from("ad_platform_settings").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "error",
      last_sync_error: result.error,
    } as never).eq("platform", "tiktok");
    return { ok: false as const, error: result.error };
  }

  const { data: products } = await supabaseAdmin.from("products").select("id, sku, name");
  const productList = (products ?? []) as ProductForMatching[];

  const { data: manualAssignments } = await supabaseAdmin
    .from("campaign_product_assignments")
    .select("campaign_id, campaign_name, product_id")
    .eq("platform", "tiktok");
  const manualMap = new Map<string, string>();
  for (const a of (manualAssignments ?? []) as { campaign_id: string; product_id: string }[]) {
    manualMap.set(a.campaign_id, a.product_id);
  }

  const spendByProduct = new Map<string, { spend: number; campaign_names: string[] }>();

  for (const campaign of result.campaigns) {
    if (campaign.spend === 0) continue;
    const manualProductId = manualMap.get(campaign.campaign_id);
    if (manualProductId) {
      const existing = spendByProduct.get(manualProductId) ?? { spend: 0, campaign_names: [] };
      existing.spend += campaign.spend;
      existing.campaign_names.push(campaign.campaign_name);
      spendByProduct.set(manualProductId, existing);
    }
  }

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

  const matchedNames = new Set(matches.flatMap((m) => m.matched_campaign_names));
  const unmatchedCampaigns = unassignedCampaigns.filter((c) => !matchedNames.has(c.campaign_name));
  const unmatchedSpendRaw = unmatchedCampaigns.reduce((s, c) => s + c.spend, 0);

  // Taux devise compte→MAD (clé: tiktok_currency_to_mad, défaut 1 — la
  // plupart des comptes TikTok Ads Maroc facturent déjà directement en MAD,
  // contrairement à Meta qui est souvent en USD).
  const { data: rateRow } = await supabaseAdmin.from("app_settings").select("value").eq("key", "tiktok_currency_to_mad").maybeSingle();
  const RATE_TO_MAD = Number((rateRow as { value?: string } | null)?.value ?? 1);

  const rowsToUpsert = [...spendByProduct.entries()].map(([product_id, { spend, campaign_names }]) => ({
    product_id,
    platform: "tiktok" as const,
    matched_campaign_names: campaign_names,
    spend_mad: Math.round(spend * RATE_TO_MAD * 100) / 100,
    period_start: dateFrom,
    period_end: dateTo,
    synced_at: new Date().toISOString(),
  }));

  if (rowsToUpsert.length > 0) {
    await supabaseAdmin
      .from("product_ad_spend")
      .delete()
      .eq("platform", "tiktok")
      .lte("period_start", dateTo)
      .gte("period_end", dateFrom);

    const { error: upsertErr } = await supabaseAdmin
      .from("product_ad_spend")
      .insert(rowsToUpsert as never);
    if (upsertErr) {
      return { ok: false as const, error: `Échec de sauvegarde: ${upsertErr.message}` };
    }
  }

  await supabaseAdmin
    .from("unmatched_ad_spend")
    .delete()
    .eq("platform", "tiktok")
    .lte("period_start", dateTo)
    .gte("period_end", dateFrom);

  if (unmatchedSpendRaw > 0) {
    await supabaseAdmin.from("unmatched_ad_spend").insert({
      platform:               "tiktok",
      matched_campaign_names: unmatchedCampaigns.map((c) => c.campaign_name),
      spend_mad:              Math.round(unmatchedSpendRaw * RATE_TO_MAD * 100) / 100,
      period_start:           dateFrom,
      period_end:             dateTo,
    } as never);
  }

  await supabaseAdmin.from("ad_platform_settings").update({
    last_sync_at: new Date().toISOString(),
    last_sync_status: "ok",
    last_sync_error: null,
  } as never).eq("platform", "tiktok");

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

/** Liste des jours YYYY-MM-DD entre deux dates incluses (max 120). */
function daysBetween(from: string, to: string) {
  const out: string[] = [];
  const d = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (d <= end && out.length < 120) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

type SyncResult =
  | { ok: false; error: string }
  | { ok: true; matchedProducts: number; totalSpendMatched: number; unmatchedCampaigns: { name: string; spend: number }[] };

/**
 * Synchro JOUR PAR JOUR : chaque ligne de product_ad_spend couvre 1 seul jour.
 * Avant, une synchro "1 mois" créait 1 ligne sur tout le mois ; la synchro
 * auto de "aujourd'hui" l'aurait effacée (chevauchement) → dépenses perdues.
 */
async function byDay(
  fn: (f: string, t: string) => Promise<unknown>,
  dateFrom: string,
  dateTo: string,
): Promise<SyncResult> {
  let matched = 0, total = 0;
  const unmatched = new Map<string, number>();
  for (const d of daysBetween(dateFrom, dateTo)) {
    const r = (await fn(d, d)) as SyncResult;
    if (!r.ok) return r;
    matched = Math.max(matched, r.matchedProducts);
    total += r.totalSpendMatched;
    for (const u of r.unmatchedCampaigns) unmatched.set(u.name, (unmatched.get(u.name) ?? 0) + u.spend);
  }
  return {
    ok: true,
    matchedProducts: matched,
    totalSpendMatched: Math.round(total * 100) / 100,
    unmatchedCampaigns: [...unmatched].map(([name, spend]) => ({ name, spend })),
  };
}

export async function syncMetaAdSpendCore(dateFrom: string, dateTo: string) {
  return byDay(syncMetaAdSpendOneRange, dateFrom, dateTo);
}

export async function syncTikTokAdSpendCore(dateFrom: string, dateTo: string) {
  return byDay(syncTikTokAdSpendOneRange, dateFrom, dateTo);
}
