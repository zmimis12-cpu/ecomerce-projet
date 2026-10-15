"use server";
import { revalidateTag, revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { BumpConfig } from "./catalog";

/** Enregistre les upsells « en même temps » : { productId: [{product_id, price, label}] } */
export async function saveStoreBumps(cfg: Record<string, BumpConfig[]>): Promise<{ success: boolean; error?: string }> {
  await requireRole(["super_admin", "admin", "manager"]);
  const clean: Record<string, BumpConfig[]> = {};
  for (const [pid, list] of Object.entries(cfg)) {
    const l = (list ?? [])
      .filter((b) => b.product_id && b.product_id !== pid && Number(b.price) > 0)
      .slice(0, 3)
      .map((b) => ({ product_id: b.product_id, price: Math.round(Number(b.price)), ...(b.label?.trim() ? { label: b.label.trim().slice(0, 80) } : {}) }));
    if (l.length) clean[pid] = l;
  }
  const { error } = await supabaseAdmin.from("app_settings").upsert(
    { key: "store_bumps", value: JSON.stringify(clean), category: "store", label: "Upsells boutique (order bumps)" } as never,
    { onConflict: "key" },
  );
  if (error) return { success: false, error: error.message };
  revalidateTag("store");
  revalidatePath("/lp/[slug]", "page");
  revalidatePath("/");
  return { success: true };
}

/** Enregistre les réglages de la boutique (accueil + produits visibles / mis en avant / ordre). */
export async function saveStoreConfig(cfg: import("./config").StoreConfig): Promise<{ success: boolean; error?: string }> {
  await requireRole(["super_admin", "admin", "manager"]);
  const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const clean = {
    announcement: clip(cfg.announcement, 140), heroTitle: clip(cfg.heroTitle, 120), heroSubtitle: clip(cfg.heroSubtitle, 300),
    heroCta: clip(cfg.heroCta, 40), heroImage: clip(cfg.heroImage, 500), featuredTitle: clip(cfg.featuredTitle, 80),
    allTitle: clip(cfg.allTitle, 80), showTrust: !!cfg.showTrust, showAbout: !!cfg.showAbout,
    contactEmail: clip(cfg.contactEmail, 120), whatsapp: clip(cfg.whatsapp, 20),
    products: Object.fromEntries(Object.entries(cfg.products ?? {}).map(([k, v]) => [k, {
      visible: v.visible !== false, featured: !!v.featured, order: Number.isFinite(Number(v.order)) ? Number(v.order) : 1000,
    }])),
  };
  const { error } = await supabaseAdmin.from("app_settings").upsert(
    { key: "store_config", value: JSON.stringify(clean), category: "store", label: "Réglages boutique" } as never,
    { onConflict: "key" },
  );
  if (error) return { success: false, error: error.message };
  revalidateTag("store");
  revalidatePath("/");
  revalidatePath("/lp/[slug]", "page");
  return { success: true };
}
