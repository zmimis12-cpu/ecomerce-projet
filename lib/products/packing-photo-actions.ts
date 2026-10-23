"use server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { getPackingPhotoMap } from "./packing-photo";

/** Enregistre la photo emballage d'un produit (url vide = photo principale). */
export async function savePackingPhoto(productId: string, url: string): Promise<{ success: boolean; error?: string }> {
  await requireRole(["super_admin", "admin", "manager"]);
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return { success: false, error: "Produit invalide" };
  const clean = String(url ?? "").trim().slice(0, 800);
  if (clean && !/^https:\/\//i.test(clean)) return { success: false, error: "Lien invalide" };
  const map = await getPackingPhotoMap();
  if (clean) map[productId] = clean; else delete map[productId];
  const { error } = await supabaseAdmin.from("app_settings").upsert(
    { key: "packing_photos", value: JSON.stringify(map), category: "products", label: "Photos emballage (récap tickets)" } as never,
    { onConflict: "key" },
  );
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/products/${productId}`);
  return { success: true };
}
