/**
 * Design des landing pages (/lp/[slug]) — contrôle total depuis Admin → Boutique → Landing pages.
 * Stocké dans app_settings.lp_design : réglages globaux + réglages spécifiques par landing page (slug).
 * Le CONTENU (titre, prix, offres X1/X2/X3, avantages, avis, FAQ…) reste dans l'éditeur de chaque landing page.
 */
import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_LP_DESIGN, normalizeDesign, type LpDesign, type LpDesignStore } from "./lp-design-shared";
export * from "./lp-design-shared";

export async function readLpDesign(): Promise<LpDesignStore> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "lp_design").maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value;
  let v: Partial<LpDesignStore> = {};
  try { v = (typeof raw === "string" ? JSON.parse(raw) : raw) ?? {}; } catch { /* défauts */ }
  return {
    global: normalizeDesign(v.global),
    perSlug: Object.fromEntries(Object.entries(v.perSlug ?? {}).map(([k, d]) => [k, normalizeDesign(d)])),
  };
}

const cached = unstable_cache(readLpDesign, ["lp-design-v2"], { revalidate: 300, tags: ["store"] });

/** Réglage effectif d'une landing page : spécifique si défini, sinon global. */
export async function getLpDesignFor(slug: string): Promise<LpDesign> {
  try {
    const s = await cached();
    // normalizeDesign : sûr même si le cache contient un ancien format (nouvelles options ajoutées)
    return normalizeDesign(s.perSlug[slug] ?? s.global);
  } catch {
    return DEFAULT_LP_DESIGN;
  }
}

/** Pages complètes par avatar : { slug: { CODE_PUB: slugDeLaPageDédiée } } (lu par le middleware via /api/public/lp-variants). */
export async function getLpVariants(): Promise<Record<string, Record<string, string>>> {
  try {
    const s = await cached();
    const out: Record<string, Record<string, string>> = {};
    for (const [slug, raw] of Object.entries(s.perSlug)) {
      const d = normalizeDesign(raw);
      for (const a of d.angles) {
        if (!a.page || a.page === slug) continue;
        for (const c of a.codes.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean)) (out[slug] ??= {})[c] = a.page;
      }
    }
    return out;
  } catch { return {}; }
}
