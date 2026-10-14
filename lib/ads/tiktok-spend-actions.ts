"use server";
/**
 * Dépense TikTok saisie à la main (en attendant l'API TikTok).
 * Stockée dans product_ad_spend (platform = 'tiktok') : elle est donc comptée
 * automatiquement partout (dashboard, profit par produit, calculs par produit).
 * Quand l'API TikTok sera connectée, la synchro remplacera ces lignes par les
 * vrais chiffres de TikTok sur la même période.
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUsdToMad } from "./fx";

const MANUAL_TAG = "Saisie manuelle TikTok";

export async function addTiktokSpend(input: {
  day: string; productId: string; amount: number; currency: "USD" | "MAD"; note?: string;
}): Promise<{ success: boolean; error?: string; info?: string }> {
  await requireRole(["super_admin", "admin", "manager"]);
  const { day, productId, amount, currency } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { success: false, error: "Date invalide." };
  if (!productId) return { success: false, error: "Choisis un produit." };
  if (!(amount > 0 && amount < 1_000_000)) return { success: false, error: "Montant invalide." };

  let mad = amount;
  let info = "";
  if (currency === "USD") {
    const fx = await getUsdToMad(day);
    mad = amount * fx.base; // taux marché + frais banque, sans la TVA Meta
    info = ` (${amount} $ × ${fx.base.toFixed(2)})`;
  }
  mad = Math.round(mad * 100) / 100;

  const label = input.note?.trim() ? `${MANUAL_TAG} — ${input.note.trim()}` : MANUAL_TAG;
  const { error } = await supabaseAdmin.from("product_ad_spend").insert({
    product_id: productId,
    platform: "tiktok",
    matched_campaign_names: [label],
    spend_mad: mad,
    period_start: day,
    period_end: day,
    synced_at: new Date().toISOString(),
  } as never);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/ads/tiktok");
  revalidatePath("/admin");
  return { success: true, info: `✅ ${mad.toLocaleString("fr-FR")} MAD ajoutés${info}` };
}

export async function deleteTiktokSpend(id: string): Promise<{ success: boolean; error?: string }> {
  await requireRole(["super_admin", "admin", "manager"]);
  const { error } = await supabaseAdmin.from("product_ad_spend").delete().eq("id", id).eq("platform", "tiktok");
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/ads/tiktok");
  revalidatePath("/admin");
  return { success: true };
}
