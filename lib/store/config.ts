/**
 * Réglages de la boutique HajtekZone (app_settings.store_config) — contrôle total
 * depuis l'admin : textes de l'accueil, bannière, produits visibles / mis en avant / ordre.
 */
import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type StoreProductSetting = { visible?: boolean; featured?: boolean; order?: number };
export type StoreConfig = {
  announcement: string;          // barre noire en haut (vide = textes par défaut)
  heroTitle: string;
  heroSubtitle: string;
  heroCta: string;
  heroImage: string;             // URL image de fond (optionnel)
  featuredTitle: string;         // titre de la section « mis en avant »
  allTitle: string;              // titre de la grille de produits
  showTrust: boolean;            // bloc « livraison / paiement / … »
  showAbout: boolean;            // bloc « About / ODT Deals » (Meta/TikTok)
  contactEmail: string;
  whatsapp: string;              // ex : 0664783510 (vide = caché)
  products: Record<string, StoreProductSetting>; // clé = product_id
};

export const DEFAULT_STORE_CONFIG: StoreConfig = {
  announcement: "",
  heroTitle: "منتجات عملية لحياة أسهل",
  heroSubtitle: "اختر منتجك، أكد طلبك فالهاتف، وخلص غير ملي يوصلك. توصيل لجميع مدن المغرب.",
  heroCta: "تسوق الآن",
  heroImage: "",
  featuredTitle: "الأكثر مبيعاً 🔥",
  allTitle: "جميع المنتجات",
  showTrust: true,
  showAbout: true,
  contactEmail: "contact@hajtek.ma",
  whatsapp: "",
  products: {},
};

export async function readStoreConfig(): Promise<StoreConfig> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "store_config").maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value;
  let v: Partial<StoreConfig> = {};
  try { v = (typeof raw === "string" ? JSON.parse(raw) : raw) ?? {}; } catch { /* défauts */ }
  return { ...DEFAULT_STORE_CONFIG, ...v, products: { ...(v.products ?? {}) } };
}

export const getStoreConfig = unstable_cache(readStoreConfig, ["store-config-v1"], { revalidate: 300, tags: ["store"] });
