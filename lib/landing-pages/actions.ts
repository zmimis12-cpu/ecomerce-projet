"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { generateLandingPageContent } from "@/lib/ai/generator";
import { analyzeProduct } from "@/lib/ai/analyzer";
import type { TemplateKey } from "@/lib/templates";

const MANAGER_ROLES = ["super_admin", "admin", "manager"] as const;

// ─── Toggle active ─────────────────────────────────────────────────────────────
export async function toggleLandingPage(id: string, isActive: boolean) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("landing_pages")
    .update({ is_active: isActive } as never)
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/landing-pages");
  return { success: true };
}

// ─── Upsert landing page ───────────────────────────────────────────────────────
export async function upsertLandingPage(id: string | null, data: {
  product_id: string;
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  offer_text?: string;
  hero_headline?: string;
  hero_subheadline?: string;
  price_text?: string;
  old_price_text?: string;
  stock_text?: string;
  cta_text?: string;
  whatsapp_number?: string;
  meta_pixel_id?: string;
  tiktok_pixel_id?: string;
  template_key?: string;
  sections?: unknown;
  is_active: boolean;
  bundle_1_price?: number | null;
  bundle_2_price?: number | null;
  bundle_3_price?: number | null;
  ai_analysis?: unknown;
}) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();
  const payload  = { ...data, slug: data.slug.trim().toLowerCase() };

  const { error } = id
    ? await supabase.from("landing_pages").update(payload as never).eq("id", id)
    : await supabase.from("landing_pages").insert(payload as never);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/landing-pages");
  return { success: true };
}

// ─── AI generation ─────────────────────────────────────────────────────────────
export async function generateWithAI(productId: string, templateKey: TemplateKey) {
  await requireRole([...MANAGER_ROLES]);

  // Fetch product — server side only, never expose to client
  const { data: product, error } = await supabaseAdmin
    .from("products")
    .select("id, name, description, sale_price_mad, sku")
    .eq("id", productId)
    .single();

  if (error || !product) {
    return { success: false, error: "Produit introuvable." };
  }

  const p = product as unknown as {
    id: string; name: string; description: string | null;
    sale_price_mad: number; sku: string;
  };

  // templateKey is optional — generator auto-selects based on product analysis
  const generated = await generateLandingPageContent(p, templateKey);

  return { success: true, content: generated };
}

// ─── Delete ────────────────────────────────────────────────────────────────────
export async function deleteLandingPage(id: string) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();
  const { error } = await supabase.from("landing_pages").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/landing-pages");
  return { success: true };
}

// ─── Smart generate — auto-detects template ───────────────────────────────────
export async function smartGenerateLandingPage(productId: string) {
  await requireRole([...MANAGER_ROLES]);

  const { data: product, error } = await supabaseAdmin
    .from("products")
    .select("id, name, description, sale_price_mad, sku")
    .eq("id", productId)
    .single();

  if (error || !product) return { success: false, error: "Produit introuvable." };

  const p = product as unknown as {
    id: string; name: string; description: string | null;
    sale_price_mad: number; sku: string;
  };

  // Step 1: analyze
  const analysis = analyzeProduct(p);

  // Step 2: generate with auto-selected template
  const generated = await generateLandingPageContent(p, analysis.templateKey);

  return {
    success:     true,
    content:     generated,
    analysis:    generated.ai_analysis,
    templateKey: analysis.templateKey,
  };
}
