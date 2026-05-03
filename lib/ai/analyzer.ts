/**
 * lib/ai/analyzer.ts
 * Product analyzer — determines product type, audience, emotional triggers.
 * Pure function, no API calls, runs server-side.
 */

import type { TemplateKey } from "@/lib/templates";

export interface ProductAnalysis {
  type:        "gadget_viral" | "problem_solution" | "beauty_health" | "home_family";
  templateKey: TemplateKey;
  audience:    string;
  problem:     string;
  benefit:     string;
  emotion:     string;
  price_level: "low" | "mid" | "high";
  keywords:    string[];
  cta_style:   "urgency" | "transformation" | "aspiration" | "value";
}

interface ProductInput {
  name:         string;
  description:  string | null;
  sale_price_mad: number;
  sku?:         string;
}

// ─── Keyword taxonomy ─────────────────────────────────────────────────────────
const GADGET_KEYWORDS    = ["detector","detecteur","projecteur","scanner","laser","wifi","bluetooth","camera","drone","robot","tracker","gps","usb","charge","power","lumiere","led","smart","digital","electronique","electronic","tool","outil","machine","appareil","device","gadget","capteur","sensor","solar","solaire","alarm","alarme","scale","balance","thermometre","ventilateur","fan","speaker","enceinte","casque","cable","chargeur","batterie","battery","lampe","torch","torch","lampe","projector"];

const PROBLEM_KEYWORDS   = ["anti","contre","traitement","traiter","eliminer","repousser","nettoyer","cleaning","cleaner","nettoyage","insecte","insecticide","moustique","cafard","souris","rat","nuisible","pest","humidite","moisture","moisissure","odeur","odor","tache","stain","rouille","rust","calcaire","limescale","deboucheur","drain","filtre","filter","purifier","purificateur","douleur","pain","soulager","relieve","soin","care","guerir","heal","detox","protection"];

const BEAUTY_KEYWORDS    = ["beaute","beauty","soin","serum","creme","cream","masque","mask","huile","oil","cheveux","hair","peau","skin","visage","face","corps","body","parfum","perfume","maquillage","makeup","rouge","lipstick","mascara","sourcil","eyebrow","cils","lashes","anti-age","antiride","wrinkle","collagen","hydrat","moisture","eclat","glow","teint","complexion","nail","ongle","epilation","wax","laser","lisse","smooth","brillant","shine","volume","keratin","keratine"];

const HOME_KEYWORDS      = ["maison","home","cuisine","kitchen","rangement","storage","organisation","decor","decoration","luminaire","light","rideau","curtain","tapis","carpet","coussin","pillow","housse","cover","serviette","towel","literie","bedding","draps","sheet","oreiller","pillow","plante","plant","jardin","garden","outdoor","terrasse","balcon","salle bain","bathroom","menage","cleaning","aspirateur","vacuum","fer","iron","cuisine","cook","four","oven","mixer","blender","cafetiere","coffee"];

// ─── Main analyzer ─────────────────────────────────────────────────────────────
export function analyzeProduct(product: ProductInput): ProductAnalysis {
  const text = `${product.name} ${product.description ?? ""}`.toLowerCase();
  const words = text.split(/\s+/);
  const price = product.sale_price_mad;

  // Score each category
  const scores = {
    gadget_viral:    countMatches(words, GADGET_KEYWORDS),
    problem_solution:countMatches(words, PROBLEM_KEYWORDS),
    beauty_health:   countMatches(words, BEAUTY_KEYWORDS),
    home_family:     countMatches(words, HOME_KEYWORDS),
  };

  // Determine winner
  const type = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)[0][0] as ProductAnalysis["type"];

  // Extract matched keywords for copy generation
  const allKeywords = [...GADGET_KEYWORDS, ...PROBLEM_KEYWORDS, ...BEAUTY_KEYWORDS, ...HOME_KEYWORDS];
  const keywords = words.filter((w) => allKeywords.includes(w)).slice(0, 5);

  // Price level
  const price_level: ProductAnalysis["price_level"] =
    price < 150 ? "low" : price < 500 ? "mid" : "high";

  // Map type → template key
  const templateMap: Record<ProductAnalysis["type"], TemplateKey> = {
    gadget_viral:     "gadget_viral",
    problem_solution: "problem_solution_cod",
    beauty_health:    "beauty_health",
    home_family:      "home_family",
  };

  // Audience, problem, benefit, emotion by type
  const profiles = PRODUCT_PROFILES[type];

  return {
    type,
    templateKey: templateMap[type],
    audience:    profiles.audience,
    problem:     profiles.problem,
    benefit:     profiles.benefit,
    emotion:     profiles.emotion,
    price_level,
    keywords,
    cta_style:   profiles.cta_style,
  };
}

function countMatches(words: string[], keywords: string[]): number {
  return words.reduce((count, w) =>
    keywords.some((k) => w.includes(k) || k.includes(w)) ? count + 1 : count, 0);
}

// ─── Profile data per type ────────────────────────────────────────────────────
const PRODUCT_PROFILES: Record<ProductAnalysis["type"], {
  audience: string; problem: string; benefit: string;
  emotion: string; cta_style: ProductAnalysis["cta_style"];
}> = {
  gadget_viral: {
    audience:  "الشباب والمهتمون بالتقنية",
    problem:   "الطرق التقليدية مكلفة وبطيئة",
    benefit:   "نتائج احترافية سريعة بسعر معقول",
    emotion:   "الإثارة والرغبة في الامتلاك",
    cta_style: "urgency",
  },
  problem_solution: {
    audience:  "كل من يعاني من هذه المشكلة",
    problem:   "المشكلة تأثر على جودة الحياة اليومية",
    benefit:   "حل نهائي آمن وفعال من أول استخدام",
    emotion:   "الارتياح والتحرر من المشكلة",
    cta_style: "transformation",
  },
  beauty_health: {
    audience:  "النساء المهتمات بالعناية بالجمال",
    problem:   "المنتجات الاعتيادية ما تعطيش نتائج",
    benefit:   "نتائج واضحة وطبيعية خلال أيام",
    emotion:   "الثقة بالنفس والجمال الطبيعي",
    cta_style: "aspiration",
  },
  home_family: {
    audience:  "ربات البيوت والعائلات",
    problem:   "المنزل يحتاج حلولاً عملية واقتصادية",
    benefit:   "يسهل الحياة اليومية ويوفر وقت وجهد",
    emotion:   "الراحة والاطمئنان العائلي",
    cta_style: "value",
  },
};
