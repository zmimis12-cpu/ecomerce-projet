/**
 * lib/products/packing-photo.ts — « Photo emballage » de chaque produit.
 * Photo affichée sur le récap des tickets (10×10) pour que l'équipe d'emballage
 * reconnaisse le produit. Choisie par l'admin dans la fiche produit ;
 * vide = photo principale du produit.
 * Stockée dans app_settings.packing_photos = { [productId]: url } (pas de migration).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function getPackingPhotoMap(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "packing_photos").maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch { return {}; }
}

/** Photo à afficher pour chaque produit : photo emballage choisie, sinon photo principale. */
export async function resolvePackingPhotos(productIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return out;
  const [chosen, imgs] = await Promise.all([
    getPackingPhotoMap(),
    supabaseAdmin.from("product_images").select("product_id, public_url, is_primary, display_order").in("product_id", ids),
  ]);
  type Img = { product_id: string; public_url: string; is_primary: boolean | null; display_order: number | null };
  const sorted = ((imgs.data ?? []) as Img[]).sort((a, b) =>
    Number(!!b.is_primary) - Number(!!a.is_primary) || (a.display_order ?? 0) - (b.display_order ?? 0));
  for (const id of ids) {
    const url = chosen[id] || sorted.find((i) => i.product_id === id)?.public_url;
    if (url) out.set(id, url);
  }
  return out;
}
