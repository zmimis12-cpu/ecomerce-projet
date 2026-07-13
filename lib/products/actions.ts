"use server";
/**
 * lib/products/actions.ts
 * Server Actions for the Products module.
 * All mutations check user role before executing.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { isSkuTaken, isSlugTaken } from "./queries";


const MANAGER_ROLES = ["super_admin", "admin", "manager"] as const;

function parseNum(val: FormData | null, key: string): number {
  const v = val?.get(key);
  const n = parseFloat(String(v ?? "0"));
  return isNaN(n) || n < 0 ? 0 : n;
}

// ─── Validate form ─────────────────────────────────────────────────────────────
interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

async function validateProduct(
  data: FormData,
  excludeId?: string
): Promise<ValidationResult> {
  const errors: Record<string, string> = {};

  const name = String(data.get("name") ?? "").trim();
  const sku  = String(data.get("sku")  ?? "").trim();
  const slug = String(data.get("slug") ?? "").trim();

  if (!name) errors.name = "Le nom est requis.";
  if (!sku)  errors.sku  = "Le SKU est requis.";
  if (!slug) errors.slug = "Le slug est requis.";

  const sale = parseNum(data, "sale_price_mad");
  if (sale < 0) errors.sale_price_mad = "Le prix de vente ne peut pas être négatif.";

  if (sku && await isSkuTaken(sku, excludeId)) {
    errors.sku = "Ce SKU est déjà utilisé par un autre produit.";
  }
  if (slug && await isSlugTaken(slug, excludeId)) {
    errors.slug = "Ce slug est déjà utilisé.";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

// ─── Create product ────────────────────────────────────────────────────────────
export async function createProduct(formData: FormData) {
  await requireRole([...MANAGER_ROLES]);

  const validation = await validateProduct(formData);
  if (!validation.ok) return { success: false, errors: validation.errors };

  const supabase = await createClient();

  const payload = {
    name:                 String(formData.get("name")).trim(),
    slug:                 String(formData.get("slug")).trim(),
    description:          String(formData.get("description") ?? "").trim() || null,
    sku:                  String(formData.get("sku")).trim(),
    is_active:            formData.get("is_active") === "true",
    sale_price_mad:       parseNum(formData, "sale_price_mad"),
    purchase_price_mad:   parseNum(formData, "purchase_price_mad"),
    packaging_cost_mad:   parseNum(formData, "packaging_cost_mad"),
    confirmation_cost_mad:parseNum(formData, "confirmation_cost_mad"),
    shipping_cost_mad:    parseNum(formData, "shipping_cost_mad"),
    ads_cost_mad:         parseNum(formData, "ads_cost_mad"),
    other_costs_mad:      parseNum(formData, "other_costs_mad"),
    // Required legacy fields
    purchase_price_usd:   0,
    exchange_rate:        1,
  };

  const { data, error } = await supabase
    .from("products")
    .insert(payload as never)
    .select("id")
    .single();

  if (error) {
    return { success: false, errors: { _form: error.message } };
  }

  revalidatePath("/admin/products");
  return { success: true, productId: (data as { id: string }).id };
}

// ─── Update product ────────────────────────────────────────────────────────────
export async function updateProduct(id: string, formData: FormData) {
  await requireRole([...MANAGER_ROLES]);

  const validation = await validateProduct(formData, id);
  if (!validation.ok) return { success: false, errors: validation.errors };

  const supabase = await createClient();

  const payload = {
    name:                 String(formData.get("name")).trim(),
    slug:                 String(formData.get("slug")).trim(),
    description:          String(formData.get("description") ?? "").trim() || null,
    sku:                  String(formData.get("sku")).trim(),
    is_active:            formData.get("is_active") === "true",
    sale_price_mad:       parseNum(formData, "sale_price_mad"),
    purchase_price_mad:   parseNum(formData, "purchase_price_mad"),
    packaging_cost_mad:   parseNum(formData, "packaging_cost_mad"),
    confirmation_cost_mad:parseNum(formData, "confirmation_cost_mad"),
    shipping_cost_mad:    parseNum(formData, "shipping_cost_mad"),
    ads_cost_mad:         parseNum(formData, "ads_cost_mad"),
    other_costs_mad:      parseNum(formData, "other_costs_mad"),
  };

  const { error } = await supabase
    .from("products")
    .update(payload as never)
    .eq("id", id);

  if (error) return { success: false, errors: { _form: error.message } };

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${id}`);
  return { success: true };
}

// ─── Upload image ──────────────────────────────────────────────────────────────
export async function uploadProductImage(
  productId: string,
  formData: FormData
): Promise<{ success: boolean; error?: string; image?: Record<string, unknown> }> {
  await requireRole([...MANAGER_ROLES]);

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { success: false, error: "Aucun fichier sélectionné." };
  }

  const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];
  if (!ALLOWED.includes(file.type)) {
    return { success: false, error: "Format non supporté. Utilisez JPEG, PNG ou WebP." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { success: false, error: "Fichier trop grand. Maximum 5MB." };
  }

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabaseAdmin.storage
    .from("product-images")
    .upload(path, buffer, { contentType: file.type, upsert: false, cacheControl: "31536000" });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  const { data: urlData } = supabaseAdmin.storage
    .from("product-images")
    .getPublicUrl(path);

  const publicUrl = urlData.publicUrl;

  // Check if this is the first image (make it primary)
  const supabase = await createClient();
  const { count } = await supabase
    .from("product_images")
    .select("*", { count: "exact", head: true })
    .eq("product_id", productId);

  const isPrimary = (count ?? 0) === 0;

  const { data: imgRow, error: dbError } = await supabase
    .from("product_images")
    .insert({
      product_id:    productId,
      storage_path:  path,
      public_url:    publicUrl,
      is_primary:    isPrimary,
      display_order: count ?? 0,
      file_name:     file.name,
      file_size:     file.size,
    } as never)
    .select("id, public_url, is_primary, storage_path")
    .single();

  if (dbError) {
    // Clean up orphan from storage
    await supabaseAdmin.storage.from("product-images").remove([path]);
    return { success: false, error: dbError.message };
  }

  revalidatePath(`/admin/products/${productId}`);
  return { success: true, image: imgRow };
}

// ─── Set primary image ─────────────────────────────────────────────────────────
export async function setPrimaryImage(productId: string, imageId: string) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();

  // Unset all
  await supabase
    .from("product_images")
    .update({ is_primary: false } as never)
    .eq("product_id", productId);

  // Set new primary
  const { error } = await supabase
    .from("product_images")
    .update({ is_primary: true } as never)
    .eq("id", imageId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/admin/products/${productId}`);
  return { success: true };
}

// ─── Delete image ──────────────────────────────────────────────────────────────
export async function deleteProductImage(productId: string, imageId: string, storagePath: string) {
  await requireRole([...MANAGER_ROLES]);

  // Remove from storage
  await supabaseAdmin.storage.from("product-images").remove([storagePath]);

  // Remove from DB
  const supabase = await createClient();
  const { error } = await supabase
    .from("product_images")
    .delete()
    .eq("id", imageId);

  if (error) return { success: false, error: error.message };

  // If deleted image was primary, promote the next one
  const { data: remaining } = await supabase
    .from("product_images")
    .select("id")
    .eq("product_id", productId)
    .order("display_order")
    .limit(1);

  if (remaining && remaining.length > 0) {
    await supabase
      .from("product_images")
      .update({ is_primary: true } as never)
      .eq("id", (remaining[0] as { id: string }).id);
  }

  revalidatePath(`/admin/products/${productId}`);
  return { success: true };
}

// ─── Toggle active status ──────────────────────────────────────────────────────
export async function toggleProductStatus(id: string, isActive: boolean) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("products")
    .update({ is_active: isActive } as never)
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${id}`);
  return { success: true };
}

// ─── Delete product ────────────────────────────────────────────────────────────
export async function deleteProduct(id: string) {
  await requireRole([...MANAGER_ROLES]);

  // Get all image paths first
  const supabase = await createClient();
  const { data: images } = await supabase
    .from("product_images")
    .select("storage_path")
    .eq("product_id", id);

  if (images && images.length > 0) {
    const paths = (images as { storage_path: string }[]).map((i) => i.storage_path);
    await supabaseAdmin.storage.from("product-images").remove(paths);
  }

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/products");
  redirect("/admin/products");
}
