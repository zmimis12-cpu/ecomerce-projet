/**
 * Réglages de la boutique HajtekZone (app_settings.store_config) — contrôle total
 * depuis l'admin : textes de l'accueil, bannière, produits visibles / mis en avant / ordre.
 */
import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type StoreProductSetting = { visible?: boolean; featured?: boolean; order?: number; category?: string };
export type StoreTrustItem = { title: string; sub: string };
export type StoreConfig = {
  announcement: string;          // barre noire en haut (vide = textes par défaut)
  heroTitle: string;
  heroTitleGold: string;         // 2e ligne du titre, en doré
  heroSubtitle: string;
  heroCta: string;
  heroImage: string;             // URL image de fond (optionnel)
  featuredTitle: string;         // titre de la section « mis en avant »
  allTitle: string;              // titre de la grille de produits
  showTrust: boolean;            // bloc « livraison / paiement / … »
  showAbout: boolean;            // bloc « About / ODT Deals » (Meta/TikTok)
  trust: StoreTrustItem[];       // 4 garanties sous la bannière
  bottomTitle1: string; bottomSub1: string; bottomTitle2: string; bottomSub2: string; // bandeau du bas
  contactEmail: string;
  whatsapp: string;              // ex : 0664783510 (vide = caché)
  products: Record<string, StoreProductSetting>; // clé = product_id
};

export const DEFAULT_STORE_CONFIG: StoreConfig = {
  announcement: "",
  heroTitle: "منتجات عالية الجودة",
  heroTitleGold: "بأفضل الأسعار",
  heroSubtitle: "اختر منتجك، أكد طلبك فالهاتف، وخلص غير ملي يوصلك. توصيل لجميع مدن المغرب.",
  heroCta: "تسوق الآن",
  heroImage: "",
  featuredTitle: "الأكثر مبيعاً 🔥",
  allTitle: "جميع المنتجات",
  showTrust: true,
  showAbout: true,
  trust: [
    { title: "توصيل سريع", sub: "لكل مدن المغرب" },
    { title: "الدفع عند الاستلام", sub: "باش تكون مرتاح" },
    { title: "منتجات مضمونة", sub: "جودة عالية 100%" },
    { title: "خدمة الزبناء", sub: "دعم دائم ومباشر" },
  ],
  bottomTitle1: "الدفع عند الاستلام", bottomSub1: "اطلب الآن وادفع عند وصول الطلب",
  bottomTitle2: "توصيل لجميع مدن المغرب", bottomSub2: "بأسرع وقت وأمان",
  contactEmail: "contact@hajtek.ma",
  whatsapp: "",
  products: {},
};

export async function readStoreConfig(): Promise<StoreConfig> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "store_config").maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value;
  let v: Partial<StoreConfig> = {};
  try { v = (typeof raw === "string" ? JSON.parse(raw) : raw) ?? {}; } catch { /* défauts */ }
  const trust = Array.isArray(v.trust) && v.trust.length ? v.trust.slice(0, 4) : DEFAULT_STORE_CONFIG.trust;
  return { ...DEFAULT_STORE_CONFIG, ...v, trust, products: { ...(v.products ?? {}) } };
}

export const getStoreConfig = unstable_cache(readStoreConfig, ["store-config-v1"], { revalidate: 300, tags: ["store"] });
