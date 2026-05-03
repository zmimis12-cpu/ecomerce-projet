/**
 * lib/templates/index.ts
 * Landing page template definitions.
 * Each template defines default section order + copy structure.
 */

export type TemplateKey =
  | "gadget_viral"
  | "problem_solution_cod"
  | "beauty_health"
  | "home_family";

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  gadget_viral:          "🔧 Gadget Viral",
  problem_solution_cod:  "💡 Problème / Solution",
  beauty_health:         "💄 Beauté & Santé",
  home_family:           "🏠 Maison & Famille",
};

export const TEMPLATE_DESCRIPTIONS: Record<TemplateKey, string> = {
  gadget_viral:         "Projecteur, détecteur, électronique, outils",
  problem_solution_cod: "Anti-insectes, nettoyage, gadgets utiles",
  beauty_health:        "Cosmétiques, santé, bien-être",
  home_family:          "Produits maison, famille, cuisine",
};

export type SectionType =
  | "hero"
  | "problem_solution"
  | "gallery"
  | "benefits"
  | "reviews"
  | "faq"
  | "order_form";

export interface LPSection {
  type: SectionType;
  enabled: boolean;
  [key: string]: unknown;
}

export interface LandingPageData {
  title: string;
  subtitle: string;
  hero_headline: string;
  hero_subheadline: string;
  offer_text: string;
  price_text: string;
  old_price_text: string;
  stock_text: string;
  cta_text: string;
  sections: LPSection[];
}

/** Default section order per template */
const TEMPLATE_SECTIONS: Record<TemplateKey, SectionType[]> = {
  gadget_viral:         ["hero", "benefits", "gallery", "reviews", "faq", "order_form"],
  problem_solution_cod: ["hero", "problem_solution", "benefits", "gallery", "reviews", "faq", "order_form"],
  beauty_health:        ["hero", "benefits", "reviews", "faq", "order_form"],
  home_family:          ["hero", "benefits", "gallery", "reviews", "order_form"],
};

export function getTemplateSections(key: TemplateKey): SectionType[] {
  return TEMPLATE_SECTIONS[key] ?? TEMPLATE_SECTIONS.gadget_viral;
}

export function buildDefaultSections(key: TemplateKey): LPSection[] {
  return getTemplateSections(key).map((type) => ({ type, enabled: true }));
}
