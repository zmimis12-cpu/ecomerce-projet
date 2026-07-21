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
  | "lifestyle"
  | "gallery"
  | "benefits"
  | "how_to_use"
  | "guarantees"
  | "stats_bar"
  | "comparison_table"
  | "suitable_for"
  | "before_after"
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
  gadget_viral:         ["hero", "stats_bar", "benefits", "how_to_use", "suitable_for", "gallery", "before_after", "comparison_table", "guarantees", "reviews", "faq", "order_form"],
  problem_solution_cod: ["hero", "stats_bar", "problem_solution", "benefits", "how_to_use", "suitable_for", "gallery", "before_after", "comparison_table", "guarantees", "reviews", "faq", "order_form"],
  beauty_health:        ["hero", "stats_bar", "benefits", "how_to_use", "suitable_for", "before_after", "comparison_table", "guarantees", "reviews", "faq", "order_form"],
  home_family:          ["hero", "stats_bar", "benefits", "how_to_use", "suitable_for", "gallery", "comparison_table", "guarantees", "reviews", "order_form"],
};

export function getTemplateSections(key: TemplateKey): SectionType[] {
  return TEMPLATE_SECTIONS[key] ?? TEMPLATE_SECTIONS.gadget_viral;
}

export function buildDefaultSections(key: TemplateKey, productName = "المنتج"): LPSection[] {
  const defaults: Record<string, Record<string, unknown>> = {
    hero: {
      headline: productName,
      subheadline: "توصيل سريع · الدفع عند الاستلام · ضمان الجودة",
    },
    stats_bar: {
      items: [
        { percent: "98%", label: "من العملاء راضين على النتيجة" },
        { percent: "+2000", label: "طلبية توصلت بنجاح" },
        { percent: "24/48h", label: "مدة التوصيل" },
      ],
    },
    problem_solution: {
      before_title: "واش كتعاني من هاد المشاكل؟",
      before_points: ["المشكل الأول", "المشكل الثاني", "المشكل الثالث"],
      after_title: `${productName} — الحل الحقيقي`,
      after_points: ["فائدة أولى", "فائدة ثانية", "فائدة ثالثة"],
    },
    benefits: {
      items: [
        { icon: "✅", title: "جودة عالية", desc: "منتج مفحوص قبل الشحن" },
        { icon: "🚚", title: "توصيل سريع", desc: "2 إلى 4 أيام" },
        { icon: "💵", title: "الدفع عند الاستلام", desc: "ما تخلصش حتى توصلك السلعة" },
        { icon: "🛡️", title: "ضمان", desc: "استبدال في حالة مشكل" },
      ],
    },
    how_to_use: {
      title: `كيفاش تستعمل ${productName}`,
      steps: [
        { number: 1, title: "افتح العبوة", desc: "التغليف آمن ومحكم" },
        { number: 2, title: "اتبع التعليمات", desc: "خطوات بسيطة" },
        { number: 3, title: "استمتع بالنتيجة", desc: "من أول استعمال" },
      ],
    },
    guarantees: {
      title: "ليه تثق فينا؟",
      items: [
        { icon: "💵", title: "الدفع عند الاستلام", desc: "ما تخلصش حتى توصلك السلعة" },
        { icon: "🚚", title: "توصيل سريع", desc: "2 إلى 4 أيام لكل المدن" },
        { icon: "🛡️", title: "ضمان الجودة", desc: "منتج مفحوص قبل الشحن" },
        { icon: "📞", title: "دعم هاتفي", desc: "فريقنا معاك قبل وبعد الطلب" },
      ],
    },
    suitable_for: {
      title: "مناسب للجميع",
      items: [
        { icon: "👨‍💼", label: "الموظفين" },
        { icon: "👩‍🏠", label: "ربات البيوت" },
        { icon: "🎓", label: "الطلبة" },
        { icon: "👨‍👩‍👧", label: "العائلات" },
        { icon: "🎮", label: "محبي الألعاب" },
        { icon: "👴", label: "كبار السن" },
      ],
    },
    comparison_table: {
      title: `لماذا ${productName} هو الأفضل؟`,
      ours_label: "منتجنا",
      theirs_label: "الحلول العادية",
      rows: [
        { feature: "جودة عالية", ours: true, theirs: false },
        { feature: "ضمان استبدال", ours: true, theirs: false },
        { feature: "الدفع عند الاستلام", ours: true, theirs: false },
        { feature: "دعم بعد البيع", ours: true, theirs: false },
        { feature: "سعر مناسب مقابل الجودة", ours: true, theirs: false },
      ],
    },
    reviews: { items: [] },
    faq: { items: [] },
    gallery: {},
    order_form: { headline: "أدخل معلوماتك لتأكيد الطلب", sub: "سيتصل بك فريقنا للتأكيد" },
  };

  return getTemplateSections(key).map((type) => ({
    type,
    enabled: true,
    ...(defaults[type] ?? {}),
  }));
}
