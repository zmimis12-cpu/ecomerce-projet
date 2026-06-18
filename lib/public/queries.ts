/**
 * lib/public/queries.ts
 * Public product/landing page queries.
 * Uses anon Supabase client — only returns public-safe fields.
 * NEVER exposes: costs, profit, purchase_price, margins.
 */
import { createClient } from "@supabase/supabase-js";

// Public Supabase client — anon key only, no service role
function getPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export interface PublicProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sale_price_mad: number;
  images: { id: string; public_url: string; is_primary: boolean; display_order: number }[];
}

export interface PublicLandingPage {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  offer_text: string | null;
  meta_pixel_id: string | null;
  tiktok_pixel_id: string | null;
  google_gtm_id: string | null;
  product: PublicProduct;
}

/** Get landing page by slug — tries landing_pages table first, falls back to product slug */
export async function getLandingPage(slug: string): Promise<PublicLandingPage | null> {
  const supabase = getPublicClient();

  // Try landing_pages table first
  const { data: lp } = await supabase
    .from("landing_pages")
    .select("id, slug, title, subtitle, description, offer_text, meta_pixel_id, tiktok_pixel_id, google_gtm_id, product_id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (lp) {
    const page = lp as unknown as { id: string; slug: string; title: string; subtitle: string | null; description: string | null; offer_text: string | null; meta_pixel_id: string | null; tiktok_pixel_id: string | null; google_gtm_id: string | null; product_id: string };
    const product = await getPublicProduct(page.product_id);
    if (!product) return null;
    return { ...page, product };
  }

  // Fallback: treat slug as product slug
  const product = await getPublicProductBySlug(slug);
  if (!product) return null;

  return {
    id:              product.id,
    slug:            product.slug,
    title:           product.name,
    subtitle:        null,
    description:     product.description,
    offer_text:      null,
    meta_pixel_id:   null,
    tiktok_pixel_id: null,
    google_gtm_id:   null,
    product,
  };
}

async function getPublicProduct(id: string): Promise<PublicProduct | null> {
  const supabase = getPublicClient();

  const { data } = await supabase
    .from("products")
    .select("id, slug, name, description, sale_price_mad")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (!data) return null;
  const p = data as unknown as { id: string; slug: string; name: string; description: string | null; sale_price_mad: number };

  const { data: imgs } = await supabase
    .from("product_images")
    .select("id, public_url, is_primary, display_order")
    .eq("product_id", id)
    .order("display_order");

  return {
    ...p,
    images: (imgs ?? []) as unknown as PublicProduct["images"],
  };
}

async function getPublicProductBySlug(slug: string): Promise<PublicProduct | null> {
  const supabase = getPublicClient();

  const { data } = await supabase
    .from("products")
    .select("id, slug, name, description, sale_price_mad")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!data) return null;
  const p = data as unknown as { id: string; slug: string; name: string; description: string | null; sale_price_mad: number };

  const { data: imgs } = await supabase
    .from("product_images")
    .select("id, public_url, is_primary, display_order")
    .eq("product_id", p.id)
    .order("display_order");

  return {
    ...p,
    images: (imgs ?? []) as unknown as PublicProduct["images"],
  };
}
