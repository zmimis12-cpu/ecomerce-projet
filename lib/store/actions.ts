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
    announcement: clip(cfg.announcement, 140), heroTitle: clip(cfg.heroTitle, 120), heroTitleGold: clip(cfg.heroTitleGold, 120), heroSubtitle: clip(cfg.heroSubtitle, 300),
    trust: (cfg.trust ?? []).slice(0, 4).map((t) => ({ title: clip(t.title, 60), sub: clip(t.sub, 80) })),
    bottomTitle1: clip(cfg.bottomTitle1, 80), bottomSub1: clip(cfg.bottomSub1, 120), bottomTitle2: clip(cfg.bottomTitle2, 80), bottomSub2: clip(cfg.bottomSub2, 120),
    heroCta: clip(cfg.heroCta, 40), heroImage: clip(cfg.heroImage, 800), heroImageMobile: clip(cfg.heroImageMobile, 800),
    heroLayout: cfg.heroLayout === "banner" || cfg.heroLayout === "side" ? cfg.heroLayout : "full", featuredTitle: clip(cfg.featuredTitle, 80),
    allTitle: clip(cfg.allTitle, 80), showTrust: !!cfg.showTrust, showAbout: !!cfg.showAbout,
    contactEmail: clip(cfg.contactEmail, 120), whatsapp: clip(cfg.whatsapp, 20),
    products: Object.fromEntries(Object.entries(cfg.products ?? {}).map(([k, v]) => [k, {
      visible: v.visible !== false, featured: !!v.featured, order: Number.isFinite(Number(v.order)) ? Number(v.order) : 1000,
      ...(v.category?.trim() ? { category: clip(v.category, 40) } : {}),
      ...(v.image && /^https?:\/\//.test(v.image) ? { image: v.image.slice(0, 800) } : {}),
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

/** Enregistre le design des landing pages (global + réglages par landing page). */
export async function saveLpDesign(store: import("./lp-design-shared").LpDesignStore): Promise<{ success: boolean; error?: string }> {
  await requireRole(["super_admin", "admin", "manager"]);
  const { normalizeDesign } = await import("./lp-design-shared");
  const clip = (d: import("./lp-design-shared").LpDesign) => {
    const n = normalizeDesign(d);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n)) {
      if (k === "blocks") out[k] = n.blocks.map((b) => ({ key: b.key, on: !!b.on }));
      else if (typeof v === "string") out[k] = k.startsWith("color") ? (/^#[0-9a-f]{3,8}$/i.test(v) ? v : "")
        : v.slice(0, ["videoUrl", "heroImage", "featureImage", "problemImage", "heroVideo"].includes(k) ? 800 : k === "featureText" ? 600 : 200);
      else if (k === "tiles") out[k] = n.tiles.map((t) => ({ image: t.image.slice(0, 800), text: t.text.slice(0, 160) }));
      else if (k === "galleryImages") out[k] = n.galleryImages.map((u) => u.slice(0, 800));
      else if (k === "proofImages") out[k] = n.proofImages.map((u) => u.slice(0, 800));
      else if (k === "angles") out[k] = n.angles.map((a) => ({ codes: a.codes.slice(0, 120), headline: a.headline.slice(0, 160), sub: a.sub.slice(0, 200), image: a.image.slice(0, 800) }));
      else out[k] = v;
    }
    return normalizeDesign(out as Partial<import("./lp-design-shared").LpDesign>);
  };
  const clean = {
    global: clip(store.global),
    perSlug: Object.fromEntries(Object.entries(store.perSlug ?? {}).filter(([k]) => /^[a-z0-9-]{1,120}$/i.test(k)).map(([k, d]) => [k, clip(d)])),
  };
  const { error } = await supabaseAdmin.from("app_settings").upsert(
    { key: "lp_design", value: JSON.stringify(clean), category: "store", label: "Design des landing pages" } as never,
    { onConflict: "key" },
  );
  if (error) return { success: false, error: error.message };
  revalidateTag("store");
  revalidatePath("/lp/[slug]", "page");
  return { success: true };
}
