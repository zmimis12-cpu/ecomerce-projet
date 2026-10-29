/** Types + valeurs par défaut du design des landing pages (utilisable côté client ET serveur). */
export const LP_BLOCKS = [
  { key: "quick", label: "Icônes rapides sous la photo (avantages)" },
  { key: "form", label: "Prix + formulaire de commande" },
  { key: "proof", label: "Preuves réelles (photos de colis / livraisons / messages clients)" },
  { key: "problems", label: "Problèmes du client (liste ❌ + photo)" },
  { key: "who", label: "Pour qui ? (les avatars)" },
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
  heroImage: string;                 // photo principale CHOISIE (par landing page) — prioritaire sur heroSource
  heroPosition: "top" | "after_form" | "hidden"; // photo en haut puis formulaire (défaut) / formulaire puis photo / pas de photo
  heroRatio: "1/1" | "4/5" | "9/16" | "auto"; // format de la photo principale (carré par défaut ; 4/5 = affiche complète sans recadrage)
  formFirst: boolean;                // formulaire juste sous la photo (avant les icônes et autres blocs)
  stickyAlways: boolean;             // barre fixe « اشتري الآن » + WhatsApp visible sur toute la page
  offerThumbs: boolean;              // petite photo du produit sur chaque offre (1 / 2 / 3 pièces)
  offersAfterFields: boolean;        // quantité sous les champs nom / téléphone / ville
  showStoreHeader: boolean;          // logo + menu « القائمة »
  crossAtBottom: boolean;            // autres produits toujours tout en bas (la page reste centrée sur LE produit — mieux pour Meta)
  showBumps: boolean;                // upsells « أضف لطلبك » dans le formulaire
  showTopBar: boolean;               // barre noire en haut
  showBadge: boolean;
  showDiscount: boolean;
  showOldPrice: boolean;
  showCodBar: boolean;
  askAddress: boolean;
  addressRequired: boolean;
  showWhatsapp: boolean;
  showWhatsappFloat: boolean;      // bouton WhatsApp rond flottant
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
  // Photos ↔ textes (par landing page) — vide = automatique
  featureImage: string; featureTitle: string; featureText: string;   // bloc « photo + texte »
  problemImage: string;                                              // photo sous la liste des problèmes
  whoTitle: string;                                                  // titre du bloc « Pour qui ? »
  tiles: { image: string; text: string }[];                          // tuiles photo + légende
  galleryImages: string[];                                           // galerie (ordre choisi)
  // ── Conversion ──
  heroVideo: string;                 // vidéo/animation en haut à la place de la photo (.webp/.gif animé conseillé, ou .mp4)
  openBeforePay: boolean;            // « تقدر تحل وتشوف المنتج قبل ما تخلص » (seulement si le livreur l'accepte)
  openBeforePayText: string;
  callNote: boolean;                 // réassurance appel de confirmation sous le titre du formulaire
  callNoteText: string;
  urgency: boolean;                  // bande d'urgence (seulement si c'est vrai)
  urgencyText: string;
  animBar: boolean;                  // bande défilante animée tout en haut (attire l'attention)
  animBarItems: string;              // messages séparés par « | »
  proofTitle: string;
  proofImages: string[];             // vraies photos (colis préparés, livraisons, captures WhatsApp avec accord)
  angles: { codes: string; headline: string; sub: string; image: string }[]; // titre + photo hero selon la pub (?cr=V009 ou ?av=couple) → même message pub ↔ page
};

export const DEFAULT_LP_DESIGN: LpDesign = {
  blocks: LP_BLOCKS.map((b) => ({ key: b.key, on: true })),
  heroSource: "product", heroImage: "", heroPosition: "top", heroRatio: "1/1", formFirst: true, stickyAlways: true, offerThumbs: true, offersAfterFields: true, crossAtBottom: true, showBumps: true, showStoreHeader: true, showTopBar: true, showBadge: true, showDiscount: true,
  showOldPrice: true, showCodBar: true, askAddress: true, addressRequired: false, showWhatsapp: true, showWhatsappFloat: true,
  sticky: true, showFooter: true,
  topBar: "", badge: "عرض خاص", codBar: "🚚 التوصيل لجميع المدن | الدفع عند الاستلام", orderTitle: "🛒 اطلب الآن", orderSub: "",
  videoTitle: "شاهد كيف يعمل", videoSub: "فيديو توضيحي يبين لك جودة الصورة وسهولة الاستعمال",
  whyTitle: "", crossTitle: "عروض و منتجات مكملة", reviewsTitle: "ماذا يقول عملاؤنا؟", faqTitle: "أسئلة شائعة",
  finalTitle: "لا تفوت الفرصة!", finalText: "", finalCta: "", stickyText: "",
  colorPrimary: "#16a34a", colorBadge: "#dc2626", colorDiscount: "#facc15", colorDark: "#0f172a", colorBg: "#f6f7f9",
  videoUrl: "",
  featureImage: "", featureTitle: "", featureText: "", problemImage: "", whoTitle: "", tiles: [], galleryImages: [],
  heroVideo: "",
  openBeforePay: false, openBeforePayText: "📦 تقدر تحل الكولية وتشوف المنتج قبل ما تخلص",
  callNote: true, callNoteText: "📞 كنتاصلو بيك قبل ما نصيفطو — إلا بدلتي رأيك ما كتخلص والو",
  urgency: false, urgencyText: "🔥 الكمية محدودة — اطلب دابا باش تضمن ديالك",
  animBar: true, animBarItems: "🚚 التوصيل مجاني لجميع المدن | ⏳ العرض لفترة محدودة | 🔥 الكمية محدودة — قربات تسالي | 💵 الدفع عند الاستلام",
  proofTitle: "📦 صور حقيقية من الطلبيات ديالنا", proofImages: [], angles: [],
};

export type LpDesignStore = { global: LpDesign; perSlug: Record<string, LpDesign> };

/** Complète un réglage partiel (anciens enregistrements, nouveaux blocs ajoutés plus tard…) */
export function normalizeDesign(v: Partial<LpDesign> | undefined | null): LpDesign {
  const d = { ...DEFAULT_LP_DESIGN, ...(v ?? {}) } as LpDesign;
  const known = new Set(LP_BLOCKS.map((b) => b.key));
  const blocks = (Array.isArray(v?.blocks) ? v!.blocks : []).filter((b) => known.has(b.key));
  // Nouveau bloc absent d'un ancien réglage → inséré à sa place logique (pas tout en bas)
  LP_BLOCKS.forEach((b, i) => {
    if (blocks.some((x) => x.key === b.key)) return;
    const prev = LP_BLOCKS.slice(0, i).reverse().find((p) => blocks.some((x) => x.key === p.key));
    const at = prev ? blocks.findIndex((x) => x.key === prev.key) + 1 : 0;
    blocks.splice(at, 0, { key: b.key, on: true });
  });
  const str = (x: unknown) => (typeof x === "string" ? x : "");
  const tiles = (Array.isArray(v?.tiles) ? v!.tiles : []).slice(0, 9)
    .map((t) => ({ image: str(t?.image), text: str(t?.text) })).filter((t) => t.image || t.text);
  const galleryImages = (Array.isArray(v?.galleryImages) ? v!.galleryImages : []).filter((x) => typeof x === "string" && x).slice(0, 20);
  const proofImages = (Array.isArray(v?.proofImages) ? v!.proofImages : []).filter((x) => typeof x === "string" && x).slice(0, 12);
  const angles = (Array.isArray(v?.angles) ? v!.angles : []).slice(0, 20)
    .map((a) => ({ codes: str(a?.codes), headline: str(a?.headline), sub: str(a?.sub), image: str((a as { image?: unknown })?.image) })).filter((a) => a.codes || a.headline || a.image);
  const heroPosition = d.heroPosition === "after_form" || d.heroPosition === "hidden" ? d.heroPosition : "top";
  const heroRatio = (["1/1", "4/5", "9/16", "auto"] as const).includes(d.heroRatio as never) ? d.heroRatio : "1/1";
  return { ...d, heroPosition, heroRatio, blocks, tiles, galleryImages, proofImages, angles };
}

