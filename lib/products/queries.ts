/**
 * lib/products/queries.ts
 * Server-side Supabase queries for the Products module.
 * All functions use the server client (anon key + RLS).
 */
import { createClient } from "@/lib/supabase/server";
import type { Product, ProductImage, ProductListItem } from "@/types/products";

const PRODUCT_FIELDS = `
  id, sku, slug, name, description, is_active, is_bundle,
  sale_price_mad, purchase_price_mad, packaging_cost_mad,
  confirmation_cost_mad, shipping_cost_mad, ads_cost_mad,
  other_costs_mad, total_cost_mad, estimated_profit_mad,
  min_profitable_price, margin_pct,
  created_at, updated_at
`;

const IMAGE_FIELDS = `
  id, product_id, storage_path, public_url, is_primary,
  display_order, file_name, file_size, created_at
`;

/** List all products with their primary image */
export async function getProducts(): Promise<ProductListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(`
      ${PRODUCT_FIELDS},
      images:product_images(${IMAGE_FIELDS})
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[products] getProducts error:", error.message);
    return [];
  }

  return (data ?? []).map((p) => {
    const row = p as unknown as (Product & { images?: ProductImage[] });
    const images = (row.images ?? []) as ProductImage[];
    const primary = images.find((img) => img.is_primary) ?? images[0] ?? null;
    return {
      ...row,
      images,
      primary_image_url: primary?.public_url ?? null,
    } as ProductListItem;
  });
}

/** Get single product with all images */
export async function getProduct(id: string): Promise<Product | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(`
      ${PRODUCT_FIELDS},
      images:product_images(${IMAGE_FIELDS})
    `)
    .eq("id", id)
    .single();

  if (error) {
    console.error("[products] getProduct error:", error.message);
    return null;
  }

  return data as unknown as Product;
}

/** Check SKU uniqueness (excluding current product on edit) */
export async function isSkuTaken(sku: string, excludeId?: string): Promise<boolean> {
  const supabase = await createClient();
  let query = supabase.from("products").select("id").eq("sku", sku);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;
  return (data?.length ?? 0) > 0;
}

/** Check slug uniqueness */
export async function isSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const supabase = await createClient();
  let query = supabase.from("products").select("id").eq("slug", slug);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;
  return (data?.length ?? 0) > 0;
}
