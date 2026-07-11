"use server";
/**
 * lib/ads/manual-actions.ts
 * Saisie manuelle des dépenses pub pour les plateformes sans API connectée
 * (TikTok, Google...). Meta a un vrai sync (lib/ads/actions.ts::syncMetaAdSpend).
 */
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";

const MANAGER = ["super_admin", "admin", "manager", "finance"] as const;

export interface ManualAdSpendEntry {
  id: string;
  platform: string;
  amount_mad: number;
  spend_date: string;
  note: string | null;
  created_at: string;
}

export async function addManualAdSpend(data: {
  platform: "tiktok" | "google" | "meta" | "other";
  amount_mad: number;
  spend_date: string;
  note?: string;
}): Promise<{ success: boolean; error?: string }> {
  const session = await requireRole([...MANAGER]);

  if (!data.amount_mad || data.amount_mad <= 0) {
    return { success: false, error: "Montant invalide." };
  }
  if (!data.spend_date) {
    return { success: false, error: "Date requise." };
  }

  const { error } = await supabaseAdmin.from("manual_ad_spend").insert({
    platform:   data.platform,
    amount_mad: data.amount_mad,
    spend_date: data.spend_date,
    note:       data.note ?? null,
    created_by: session.authId,
  } as never);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/settings/ads");
  return { success: true };
}

export async function deleteManualAdSpend(id: string): Promise<{ success: boolean; error?: string }> {
  await requireRole([...MANAGER]);
  const { error } = await supabaseAdmin.from("manual_ad_spend").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/settings/ads");
  return { success: true };
}

export async function listManualAdSpend(filter?: { from?: string; to?: string }): Promise<ManualAdSpendEntry[]> {
  await requireRole([...MANAGER]);
  let q = supabaseAdmin
    .from("manual_ad_spend")
    .select("id, platform, amount_mad, spend_date, note, created_at")
    .order("spend_date", { ascending: false });
  if (filter?.from) q = q.gte("spend_date", filter.from);
  if (filter?.to)   q = q.lte("spend_date", filter.to);
  const { data } = await q.limit(200);
  return (data ?? []) as ManualAdSpendEntry[];
}
