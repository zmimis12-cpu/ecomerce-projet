"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { generateLandingPageContent } from "@/lib/ai/generator";
import { analyzeProduct } from "@/lib/ai/analyzer";
import type { TemplateKey } from "@/lib/templates";

const MANAGER_ROLES = ["super_admin", "admin", "manager"] as const;

// ─── Upload d'image/GIF pour une section de landing page (how_to_use, ────────
// ─── problem_solution, etc.) — stocké dans le bucket dédié lp-media ─────────
export async function uploadSectionMedia(formData: FormData): Promise<{
  success: boolean; url?: string; error?: string;
}> {
  await requireRole([...MANAGER_ROLES]);

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { success: false, error: "Fichier requis." };

  const isGif = file.type === "image/gif";
  const ext = file.name.split(".").pop() || (isGif ? "gif" : "jpg");
  const path = `sections/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage
    .from("lp-media")
    .upload(path, buffer, { contentType: file.type, upsert: false, cacheControl: "31536000" });
  if (uploadError) return { success: false, error: uploadError.message };

  const { data: urlData } = supabaseAdmin.storage.from("lp-media").getPublicUrl(path);
  return { success: true, url: urlData.publicUrl };
}

// ─── Bulk: rafraîchir les sections (how_to_use, guarantees, stats_bar) sur ────
// ─── toutes les LP existantes SANS toucher au reste (prix, hero, whatsapp) ────
export async function backfillSectionsOnAllLandingPages(): Promise<{
  success: boolean; updated: number; failed: number; error?: string;
}> {
  await requireRole([...MANAGER_ROLES]);

  const { data: pages, error } = await supabaseAdmin
    .from("landing_pages")
    .select("id, product_id, template_key");
  if (error) return { success: false, updated: 0, failed: 0, error: error.message };

  let updated = 0, failed = 0;

  for (const lp of (pages ?? []) as { id: string; product_id: string; template_key: TemplateKey }[]) {
    try {
      const { data: product } = await supabaseAdmin
        .from("products")
        .select("id, name, description, sale_price_mad, sku")
        .eq("id", lp.product_id)
        .single();
      if (!product) { failed++; continue; }

      const p = product as unknown as { id: string; name: string; description: string | null; sale_price_mad: number; sku: string };
      const generated = await generateLandingPageContent(p, lp.template_key);

      const { error: updErr } = await supabaseAdmin
        .from("landing_pages")
        .update({ sections: generated.sections, updated_at: new Date().toISOString() } as never)
        .eq("id", lp.id);
      if (updErr) { failed++; continue; }
      updated++;
    } catch {
      failed++;
    }
  }

  revalidatePath("/admin/landing-pages");
  return { success: true, updated, failed };
}

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
  hero_image?: string;
  store_logo_url?: string;
  store_name?: string;
  price_text?: string;
  old_price_text?: string;
  stock_text?: string;
  cta_text?: string;
  whatsapp_number?: string;
  meta_pixel_id?: string;
  tiktok_pixel_id?: string;
  google_gtm_id?: string;
  template_key?: string;
  sections?: unknown;
  is_active: boolean;
  bundle_1_price?: number | null;
  bundle_2_price?: number | null;
  bundle_3_price?: number | null;
  ai_analysis?: unknown;
  customer_photos?: string[];
}) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();
  const payload  = { ...data, slug: data.slug.trim().toLowerCase() };

  // ── Section Engine: valider les sections déjà migrées vers le nouveau
  // système de schémas Zod (lib/lp-engine). Les types pas encore migrés
  // passent sans validation (migration progressive, pas un big-bang).
  // Si une section est invalide (ex: données legacy incomplètes), on la
  // RÉPARE automatiquement avec des valeurs par défaut au lieu de bloquer
  // toute la sauvegarde — sinon une seule vieille section cassée empêche
  // de sauvegarder n'importe quelle autre modification sur la page.
  if (Array.isArray(data.sections)) {
    const { isMigratedSectionType, safeValidateSection, SECTION_REGISTRY } = await import("@/lib/lp-engine/schema/registry");
    const ctx = { productId: "", productName: data.title || "المنتج", price: 0, description: null, mediaCount: 0 };
    data.sections = (data.sections as { type: string; [k: string]: unknown }[]).map((section) => {
      if (!isMigratedSectionType(section.type)) return section;
      const result = safeValidateSection(section.type, section);
      if (result.success) return section;
      // Réparation: on repart des valeurs par défaut du type, en gardant
      // enabled/variant si présents, pour ne pas perdre l'état d'activation.
      console.warn(`[lp-engine] Section "${section.type}" invalide (${result.error}) — réparée avec les valeurs par défaut.`);
      const def = SECTION_REGISTRY[section.type];
      return { type: section.type, enabled: section.enabled ?? true, ...def.defaultData(ctx) };
    });
  }

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
