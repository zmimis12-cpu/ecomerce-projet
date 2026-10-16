/** Types + valeurs par défaut du design des landing pages (utilisable côté client ET serveur). */
export const LP_BLOCKS = [
  { key: "quick", label: "Icônes rapides sous la photo (avantages)" },
  { key: "form", label: "Prix + formulaire de commande" },
  { key: "video", label: "Vidéo « شاهد كيف يعمل »" },
  { key: "why", label: "Pourquoi ce produit (scénarios)" },
  { key: "feature", label: "Bloc image + texte" },
  { key: "tiles", label: "3 photos avec légende" },
  { key: "gallery", label: "Autres photos du produit" },
  { key: "crosssell", label: "Produits complémentaires (boutique)" },
  { key: "reviews", label: "Avis clients + photos clients" },
  { key: "faq", label: "Questions fréquentes" },
  { key: "guarantees", label: "Garanties (4 icônes)" },
  { key: "final", label: "Dernier appel « لا تفوت الفرصة »" },
] as const;
export type LpBlockKey = (typeof LP_BLOCKS)[number]["key"];

export type LpDesign = {
  blocks: { key: LpBlockKey; on: boolean }[];
  // Options
  heroSource: "product" | "banner";  // photo principale : 1re photo produit ou bannière (hero_image) de la LP
  showStoreHeader: boolean;          // logo + menu « القائمة »
  showTopBar: boolean;               // barre noire en haut
  showBadge: boolean;
  showDiscount: boolean;
  showOldPrice: boolean;
  showCodBar: boolean;
  askAddress: boolean;
  addressRequired: boolean;
  showWhatsapp: boolean;
  sticky: boolean;
  showFooter: boolean;
  // Textes (vide = texte de la landing page / texte par défaut)
  topBar: string; badge: string; codBar: string; orderTitle: string; orderSub: string;
  videoTitle: string; videoSub: string; whyTitle: string; crossTitle: string;
  reviewsTitle: string; faqTitle: string; finalTitle: string; finalText: string; finalCta: string; stickyText: string;
  // Couleurs
  colorPrimary: string; colorBadge: string; colorDiscount: string; colorDark: string; colorBg: string;
  // Vidéo (YouTube ou lien .mp4) — surtout utile par landing page
  videoUrl: string;
};

export const DEFAULT_LP_DESIGN: LpDesign = {
  blocks: LP_BLOCKS.map((b) => ({ key: b.key, on: true })),
  heroSource: "product", showStoreHeader: true, showTopBar: true, showBadge: true, showDiscount: true,
  showOldPrice: true, showCodBar: true, askAddress: true, addressRequired: false, showWhatsapp: true,
  sticky: true, showFooter: true,
  topBar: "", badge: "عرض خاص", codBar: "🚚 التوصيل لجميع المدن | الدفع عند الاستلام", orderTitle: "🛒 اطلب الآن", orderSub: "",
  videoTitle: "شاهد كيف يعمل", videoSub: "فيديو توضيحي يبين لك جودة الصورة وسهولة الاستعمال",
  whyTitle: "", crossTitle: "عروض و منتجات مكملة", reviewsTitle: "ماذا يقول عملاؤنا؟", faqTitle: "أسئلة شائعة",
  finalTitle: "لا تفوت الفرصة!", finalText: "", finalCta: "", stickyText: "",
  colorPrimary: "#16a34a", colorBadge: "#dc2626", colorDiscount: "#facc15", colorDark: "#0f172a", colorBg: "#f6f7f9",
  videoUrl: "",
};

export type LpDesignStore = { global: LpDesign; perSlug: Record<string, LpDesign> };

/** Complète un réglage partiel (anciens enregistrements, nouveaux blocs ajoutés plus tard…) */
export function normalizeDesign(v: Partial<LpDesign> | undefined | null): LpDesign {
  const d = { ...DEFAULT_LP_DESIGN, ...(v ?? {}) } as LpDesign;
  const known = new Set(LP_BLOCKS.map((b) => b.key));
  const blocks = (Array.isArray(v?.blocks) ? v!.blocks : []).filter((b) => known.has(b.key));
  for (const b of LP_BLOCKS) if (!blocks.some((x) => x.key === b.key)) blocks.push({ key: b.key, on: true });
  return { ...d, blocks };
}

