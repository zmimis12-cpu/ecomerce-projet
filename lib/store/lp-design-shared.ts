/** Types + valeurs par défaut du design des landing pages (utilisable côté client ET serveur). */
export const LP_BLOCKS = [
  { key: "quick", label: "Icônes rapides sous la photo (avantages)" },
  { key: "form", label: "Prix + formulaire de commande" },
  { key: "bullets", label: "Listes de points (style « مميزات ») + bouton commander après chaque liste" },
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
  heroMaxH: number;                  // hauteur max de la photo principale sur mobile (px) — 310 par défaut
  heroRatio: "1/1" | "4/5" | "9/16" | "auto"; // format de la photo principale (carré par défaut ; 4/5 = affiche complète sans recadrage)
  formFirst: boolean;                // formulaire juste sous la photo (avant les icônes et autres blocs)
  stickyAlways: boolean;             // barre fixe « اشتري الآن » + WhatsApp visible sur toute la page
  offerThumbs: boolean;              // petite photo du produit sur chaque offre (1 / 2 / 3 pièces)
  offersAfterFields: boolean;
  showTotalBox: boolean;
  submitText: string;
  clarityId: string;
  template: "classic" | "bm" | "bm2";         // modèle visuel : classique ou « bm » (barre rouge, bandeaux bleus, boutons orange — style LP COD concurrentes)                 // Microsoft Clarity (enregistrements des visites) — vide = désactivé
  bmNote: string;                    // « BM2 » : ligne rouge sous le bouton commander
  bmBadges: string;                  // « BM2 » : 4 badges ronds sous le bouton, séparés par |
  bmStars: boolean;                  // « BM2 » : ★★★★★ sous le prix
  bmTitleColor: string;              // « BM2 » : couleur du titre principal
  bmReviewsTitle: string;            // « BM2 » : titre du bloc captures clients (photos = proofImages)
  bmFaqTitle: string;
  bmBuyText: string;
  bmFormPlus: boolean;
  bmDemoVideo: string;               // « BM2 » : courte vidéo (mp4) à la place de la photo du haut — chargée après la page
  bmDemoPoster: string;              // « BM2 » : image affichée avant la vidéo (vide = photo du haut)
  bmChips: string;                   // « BM2 » : avantages courts sous la photo/vidéo (séparés par |)               // « BM2 » : formulaire simplifié (total sur le bouton, contrôle du téléphone, aide ville)
  bmValue: string;                   // « BM2 » : phrase de valeur sous le prix
  bmCompare: string;                 // « BM2 » : tableau comparatif — 1re ligne = titre|colonne A|colonne B, puis critère|A|B                 // « BM2 » : texte du bouton vert du formulaire
  formFrame: boolean;                // formulaire encadré (bordure verte + bandeau titre)
  formFrameTitle: string;                // texte du bouton commander (court) — le prix s'affiche en petit dessous             // bloc « المجموع » au-dessus du bouton (le total est déjà sur le bouton)        // quantité sous les champs nom / téléphone / ville
  showStoreHeader: boolean;          // logo + menu « القائمة »
  crossAtBottom: boolean;            // autres produits toujours tout en bas (la page reste centrée sur LE produit — mieux pour Meta)
  showBumps: boolean;                // upsells « أضف لطلبك » dans le formulaire
  showTopBar: boolean;               // barre noire en haut
  showBadge: boolean;
  showDiscount: boolean;
  showOldPrice: boolean;
  showCodBar: boolean;
  freeShip: boolean;                 // grand bandeau « livraison gratuite » juste au-dessus du formulaire
  freeShipText: string;
  trust3: boolean;                   // bloc 3 garanties (paiement / livraison / retour) sous le bouton commander
  trust3Text: string;                // « titre|sous-titre ; titre|sous-titre ; titre|sous-titre » — seulement des infos VRAIES
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
  bulletGroups: string;              // listes de points : « Titre » puis « - point » par ligne, ligne vide entre 2 listes
  bulletCta: string;                 // texte du bouton après chaque liste
  abSlug: string;                    // test A/B : slug de la 2e version (même lien pub) — vide = pas de test
  abPct: number;                     // % des visiteurs envoyés vers la 2e version
  angles: { codes: string; headline: string; sub: string; image: string; page?: string }[]; // titre + photo hero selon la pub (?cr=V009 ou ?av=couple) → même message pub ↔ page ; page = slug d'une LP complète dédiée à cet avatar
};

export const DEFAULT_LP_DESIGN: LpDesign = {
  blocks: LP_BLOCKS.map((b) => ({ key: b.key, on: true })),
  heroSource: "product", heroImage: "", heroPosition: "top", heroRatio: "auto", heroMaxH: 310, formFirst: true, stickyAlways: true, offerThumbs: true, offersAfterFields: true, showTotalBox: false, submitText: "اطلب الآن", clarityId: "", template: "classic", bmNote: "التوصيل بالمجان والدفع عند الاستلام", bmBadges: "الدفع عند الاستلام|توصيل مجاني|شوف المنتج قبل ما تخلص|توصيل آمن", bmStars: false, bmTitleColor: "#3aa0b4", bmReviewsTitle: "آراء زبنائنا", bmFaqTitle: "الأسئلة الشائعة", bmBuyText: "إضغط هنا للشراء", bmFormPlus: false, bmDemoVideo: "", bmDemoPoster: "", bmChips: "", bmValue: "", bmCompare: "", formFrame: true, formFrameTitle: "👇 للطلب عمّر المعلومات ديالك", crossAtBottom: true, showBumps: true, showStoreHeader: true, showTopBar: true, showBadge: true, showDiscount: true,
  showOldPrice: true, showCodBar: true, freeShip: true, freeShipText: "🚚 التوصيل مجاني لجميع المدن", trust3: true, trust3Text: "الدفع|عند الاستلام ; التوصيل|24-72h ; إرجاع|خلال 7 أيام", askAddress: true, addressRequired: false, showWhatsapp: true, showWhatsappFloat: true,
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
  bulletGroups: "", bulletCta: "👈 اضغط هنا للطلب — الدفع عند الاستلام", abSlug: "", abPct: 50,
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
    .map((a) => ({ codes: str(a?.codes), headline: str(a?.headline), sub: str(a?.sub), image: str((a as { image?: unknown })?.image), page: str((a as { page?: unknown })?.page).trim().replace(/[^\w\u0600-\u06FF-]/g, "") })).filter((a) => a.codes || a.headline || a.image || a.page);
  const heroPosition = d.heroPosition === "after_form" || d.heroPosition === "hidden" ? d.heroPosition : "top";
  const heroRatio = (["1/1", "4/5", "9/16", "auto"] as const).includes(d.heroRatio as never) ? d.heroRatio : "auto";
  const abPct = Math.min(100, Math.max(0, Math.round(Number(d.abPct) || 0)));
  const abSlug = str(d.abSlug).trim().replace(/[^\w\u0600-\u06FF-]/g, "");
  const heroMaxH = Math.min(700, Math.max(200, Math.round(Number(d.heroMaxH) || 310)));
  return { ...d, abPct, abSlug, heroPosition, heroRatio, heroMaxH, blocks, tiles, galleryImages, proofImages, angles };
}

