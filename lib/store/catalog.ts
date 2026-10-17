/**
 * Catalogue public de la boutique HajtekZone (server-only) :
 *  - produits actifs (une landing page active = un produit en vente)
 *  - upsells « en même temps » (order bumps) configurés dans app_settings.store_bumps
 * Mis en cache 5 min (unstable_cache) : la boutique reste instantanée.
 */
import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readStoreConfig } from "./config";

export type StoreProduct = {
  productId: string; slug: string; title: string; image: string | null;
  price: number; oldPrice: number | null;
  visible: boolean; featured: boolean; order: number;
  category: string | null; subtitle: string | null;
};
export type BumpConfig = { product_id: string; price: number; label?: string };
export type StoreBump = { productId: string; name: string; image: string | null; price: number; oldPrice: number | null; label: string | null };

export const getStoreProducts = unstable_cache(async (): Promise<StoreProduct[]> => {
  const { data: lps } = await supabaseAdmin
    .from("landing_pages").select("slug, title, subtitle, hero_subheadline, hero_image, product_id, offers, old_price_text, updated_at")
    .eq("is_active", true).order("updated_at", { ascending: false }).limit(40);
  const list = ((lps ?? []) as { slug: string; title: string; subtitle: string | null; hero_subheadline: string | null; hero_image: string | null; product_id: string | null; offers: unknown; old_price_text: string | null }[])
    .filter((l) => l.product_id);
  const ids = [...new Set(list.map((l) => l.product_id!))];
  if (!ids.length) return [];
  const [{ data: imgs }, { data: prods }, cfg] = await Promise.all([
    supabaseAdmin.from("product_images").select("product_id, public_url, is_primary, display_order").in("product_id", ids),
    supabaseAdmin.from("products").select("id, sale_price_mad, is_active").in("id", ids),
    readStoreConfig(),
  ]);
  const img = new Map<string, string>();
  for (const i of ((imgs ?? []) as { product_id: string; public_url: string; is_primary: boolean }[]))
    if (!img.has(i.product_id) || i.is_primary) img.set(i.product_id, i.public_url);
  const price = new Map(((prods ?? []) as { id: string; sale_price_mad: number; is_active: boolean }[])
    .filter((p) => p.is_active !== false).map((p) => [p.id, Number(p.sale_price_mad)]));
  const seen = new Set<string>();
  const out: StoreProduct[] = [];
  for (const l of list) {
    if (seen.has(l.product_id!) || !price.has(l.product_id!)) continue; // 1 page par produit
    seen.add(l.product_id!);
    const offers = Array.isArray(l.offers) ? (l.offers as { qty: number; price: number }[]) : [];
    const one = offers.find((o) => Number(o.qty) === 1 && Number(o.price) > 0);
    const old = Number(String(l.old_price_text ?? "").replace(/[^\d.]/g, "")) || null;
    out.push({
      productId: l.product_id!, slug: l.slug, title: l.title,
      // Photo du produit (pas le GIF/visuel « hero » de la landing page)
      image: img.get(l.product_id!) || l.hero_image || null,
      price: one ? Number(one.price) : price.get(l.product_id!)!,
      oldPrice: old,
      visible: cfg.products[l.product_id!]?.visible !== false,
      featured: !!cfg.products[l.product_id!]?.featured,
      order: cfg.products[l.product_id!]?.order ?? 1000 + out.length,
      category: cfg.products[l.product_id!]?.category?.trim() || null,
      subtitle: (l.subtitle || l.hero_subheadline || "").trim() || null,
    });
  }
  return out.sort((a, b) => a.order - b.order);
}, ["store-products-v4"], { revalidate: 300, tags: ["store"] });

export async function getBumpConfig(): Promise<Record<string, BumpConfig[]>> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "store_bumps").maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return v && typeof v === "object" ? (v as Record<string, BumpConfig[]>) : {};
  } catch { return {}; }
}

/** Upsells proposés avec le produit `productId` (nom, photo, prix spécial). */
export const getBumpsFor = unstable_cache(async (productId: string): Promise<StoreBump[]> => {
  const cfg = (await getBumpConfig())[productId] ?? [];
  if (!cfg.length) return [];
  const ids = cfg.map((c) => c.product_id);
  const [{ data: prods }, { data: imgs }] = await Promise.all([
    supabaseAdmin.from("products").select("id, name, sale_price_mad").in("id", ids),
    supabaseAdmin.from("product_images").select("product_id, public_url, is_primary").in("product_id", ids),
  ]);
  const img = new Map<string, string>();
  for (const i of ((imgs ?? []) as { product_id: string; public_url: string; is_primary: boolean }[]))
    if (!img.has(i.product_id) || i.is_primary) img.set(i.product_id, i.public_url);
  const p = new Map(((prods ?? []) as { id: string; name: string; sale_price_mad: number }[]).map((x) => [x.id, x]));
  return cfg.filter((c) => p.has(c.product_id) && Number(c.price) > 0).map((c) => ({
    productId: c.product_id, name: p.get(c.product_id)!.name, image: img.get(c.product_id) ?? null,
    price: Number(c.price),
    oldPrice: Number(p.get(c.product_id)!.sale_price_mad) > Number(c.price) ? Number(p.get(c.product_id)!.sale_price_mad) : null,
    label: c.label ?? null,
  }));
}, ["store-bumps-v1"], { revalidate: 120, tags: ["store"] });
