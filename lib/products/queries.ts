/**
 * lib/products/queries.ts
 * Optimised: separate queries to avoid schema cache issues.
 * List query omits description and fetches only primary images.
 */
import { createClient } from "@/lib/supabase/server";
import type { Product, ProductImage, ProductListItem } from "@/types/products";

// List: no description (saves bandwidth on large catalogues)
const PRODUCT_LIST_FIELDS = `
  id, sku, slug, name, is_active, is_bundle,
  sale_price_mad, total_cost_mad, estimated_profit_mad, margin_pct,
  created_at, updated_at
`;

// Detail: full fields
const PRODUCT_DETAIL_FIELDS = `
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

// Only fetch primary image URL for list thumbnails
const PRIMARY_IMAGE_FIELDS = `id, product_id, public_url, is_primary`;

/** List products — optimised for table display */
export async function getProducts(limit = 200): Promise<ProductListItem[]> {
  const supabase = await createClient();

  const { data: products, error } = await supabase
    .from("products")
    .select(PRODUCT_LIST_FIELDS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[products] getProducts error:", error.message);
    return [];
  }
  if (!products || products.length === 0) return [];

  // Fetch only primary images — not all images — for the list
  const productIds = products.map((p) => (p as unknown as { id: string }).id);
  const { data: primaryImages } = await supabase
    .from("product_images")
    .select(PRIMARY_IMAGE_FIELDS)
    .in("product_id", productIds)
    .eq("is_primary", true);

  const primaryByProduct: Record<string, string> = {};
  for (const img of (primaryImages ?? []) as unknown as { product_id: string; public_url: string }[]) {
    primaryByProduct[img.product_id] = img.public_url;
  }

  return products.map((p) => {
    const product = p as unknown as Product;
    return {
      ...product,
      images: [],                                         // not loaded on list
      primary_image_url: primaryByProduct[product.id] ?? null,
    } as ProductListItem;
  });
}

/** Get single product with all images */
export async function getProduct(id: string): Promise<Product | null> {
  const supabase = await createClient();

  const { data: product, error } = await supabase
    .from("products")
    .select(PRODUCT_DETAIL_FIELDS)
    .eq("id", id)
    .single();

  if (error || !product) {
    console.error("[products] getProduct error:", error?.message);
    return null;
  }

  const { data: images } = await supabase
    .from("product_images")
    .select(IMAGE_FIELDS)
    .eq("product_id", id)
    .order("display_order");

  return {
    ...(product as unknown as Product),
    images: (images ?? []) as unknown as ProductImage[],
  };
}

/** Check SKU uniqueness */
export async function isSkuTaken(sku: string, excludeId?: string): Promise<boolean> {
  const supabase = await createClient();
  let query = supabase.from("products").select("id").eq("sku", sku).limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;
  return (data?.length ?? 0) > 0;
}

/** Check slug uniqueness */
export async function isSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const supabase = await createClient();
  let query = supabase.from("products").select("id").eq("slug", slug).limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;
  return (data?.length ?? 0) > 0;
}
