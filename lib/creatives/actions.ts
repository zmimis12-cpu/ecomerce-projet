"use server";
/**
 * lib/creatives/actions.ts — gestion des vidéos et commissions éditeurs.
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MANAGERS = ["super_admin", "admin", "manager"] as const;

type Result = { success: boolean; error?: string; code?: string };

export async function createCreative(input: {
  editorId: string;
  productId: string | null;
  title: string;
  videoUrl?: string;
  platform: "meta" | "tiktok" | "other";
}): Promise<Result> {
  const session = await requireRole([...MANAGERS]);
  if (!input.editorId) return { success: false, error: "Choisis un éditeur." };
  if (!input.title.trim()) return { success: false, error: "Donne un titre à la vidéo." };

  const { data, error } = await supabaseAdmin
    .from("creatives" as never)
    .insert({
      editor_id:  input.editorId,
      product_id: input.productId || null,
      title:      input.title.trim(),
      video_url:  input.videoUrl?.trim() || null,
      platform:   input.platform,
      status:     "in_ads",
      created_by: session.authId,
    } as never)
    .select("code")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/creatives");
  return { success: true, code: (data as { code: string }).code };
}

export async function updateCreativeStatus(id: string, status: "draft" | "in_ads" | "paused"): Promise<Result> {
  await requireRole([...MANAGERS]);
  const { error } = await supabaseAdmin
    .from("creatives" as never)
    .update({ status } as never)
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/creatives");
  return { success: true };
}

export async function updateEditorCommission(
  userId: string,
  commissionType: "fixed" | "percent",
  commissionValue: number,
): Promise<Result> {
  await requireRole([...MANAGERS]);
  if (!(commissionValue >= 0)) return { success: false, error: "Montant invalide." };
  if (commissionType === "percent" && commissionValue > 100) return { success: false, error: "Max 100%." };

  const { error } = await supabaseAdmin
    .from("video_editor_settings" as never)
    .upsert({
      user_id: userId,
      commission_type: commissionType,
      commission_value: commissionValue,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: "user_id" });
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/creatives");
  return { success: true };
}

/** Change l'éditeur d'une vidéo (corrige une mauvaise assignation). */
export async function updateCreativeEditor(id: string, editorId: string): Promise<Result> {
  await requireRole([...MANAGERS]);
  if (!editorId) return { success: false, error: "Choisis un éditeur." };
  const { error } = await supabaseAdmin
    .from("creatives" as never)
    .update({ editor_id: editorId } as never)
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/creatives");
  return { success: true };
}

/** Supprime une vidéo — seulement si aucune commande n'y est rattachée. */
export async function deleteCreative(id: string): Promise<Result> {
  await requireRole([...MANAGERS]);
  const { count } = await supabaseAdmin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("creative_id" as never, id);
  if ((count ?? 0) > 0) {
    return {
      success: false,
      error: `Cette vidéo a ${count} commande(s) : impossible de la supprimer sans perdre les gains. Mets-la en pause ou change l'éditeur.`,
    };
  }
  const { error } = await supabaseAdmin.from("creatives" as never).delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/creatives");
  return { success: true };
}

/** Lie (ou délie si creativeId vide) une pub Meta/TikTok à une vidéo. */
export async function linkAdToCreative(platform: string, adId: string, creativeId: string): Promise<Result> {
  await requireRole([...MANAGERS]);
  if (!creativeId) {
    const { error } = await supabaseAdmin.from("creative_ads" as never).delete().eq("platform", platform).eq("ad_id", adId);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabaseAdmin
      .from("creative_ads" as never)
      .upsert({ platform, ad_id: adId, creative_id: creativeId, linked_by: "manual" } as never, { onConflict: "platform,ad_id" });
    if (error) return { success: false, error: error.message };
  }
  revalidatePath("/admin/creatives");
  return { success: true };
}
