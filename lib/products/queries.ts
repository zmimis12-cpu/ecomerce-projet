/**
 * lib/products/queries.ts
 * Uses two separate queries instead of a joined select to avoid
 * Supabase schema cache issues with newly created FK relationships.
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

  // Query 1: products
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .order("created_at", { ascending: false });

  if (productsError) {
    console.error("[products] getProducts error:", productsError.message);
    return [];
  }
  if (!products || products.length === 0) return [];

  // Query 2: all images for these products in one query
  const productIds = products.map((p) => (p as unknown as { id: string }).id);
  const { data: images } = await supabase
    .from("product_images")
    .select(IMAGE_FIELDS)
    .in("product_id", productIds)
    .order("display_order");

  const imagesByProduct: Record<string, ProductImage[]> = {};
  for (const img of (images ?? []) as unknown as ProductImage[]) {
    if (!imagesByProduct[img.product_id]) imagesByProduct[img.product_id] = [];
    imagesByProduct[img.product_id].push(img);
  }

  return products.map((p) => {
    const product = p as unknown as Product;
    const productImages = imagesByProduct[product.id] ?? [];
    const primary = productImages.find((img) => img.is_primary) ?? productImages[0] ?? null;
    return {
      ...product,
      images: productImages,
      primary_image_url: primary?.public_url ?? null,
    } as ProductListItem;
  });
}

/** Get single product with all images */
export async function getProduct(id: string): Promise<Product | null> {
  const supabase = await createClient();

  // Query 1: product
  const { data: product, error } = await supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("id", id)
    .single();

  if (error || !product) {
    console.error("[products] getProduct error:", error?.message);
    return null;
  }

  // Query 2: images
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
