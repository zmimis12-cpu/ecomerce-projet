/**
 * lib/ai/generator.ts — Server-side only
 * AI content generator for landing pages.
 *
 * Architecture:
 *  1. If AI_PROVIDER + API key set → calls real AI (OpenAI / Gemini)
 *  2. Otherwise → deterministic mock generator using product data
 *
 * To add real AI later: implement the provider functions below.
 * The interface stays identical.
 */

import type { TemplateKey, LandingPageData, LPSection } from "@/lib/templates";
import { buildDefaultSections } from "@/lib/templates";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProductContext {
  id: string;
  name: string;
  description: string | null;
  sale_price_mad: number;
  sku: string;
}

export interface GeneratedContent extends LandingPageData {
  whatsapp_number: string;
  template_key: TemplateKey;
  ai_generated: boolean;
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export async function generateLandingPageContent(
  product: ProductContext,
  templateKey: TemplateKey
): Promise<GeneratedContent> {
  const provider = process.env.AI_PROVIDER?.toLowerCase();

  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return generateWithOpenAI(product, templateKey);
  }
  if (provider === "gemini" && process.env.GEMINI_API_KEY) {
    return generateWithGemini(product, templateKey);
  }

  // Default: deterministic mock (works without API key)
  return generateMock(product, templateKey);
}

// ─── Mock generator (deterministic, no API key needed) ────────────────────────
function generateMock(product: ProductContext, templateKey: TemplateKey): GeneratedContent {
  const price    = product.sale_price_mad;
  const name     = product.name;
  const desc     = product.description ?? "";

  const sections = buildDefaultSections(templateKey).map((s): LPSection => {
    switch (s.type) {
      case "hero":
        return {
          ...s,
          headline:    HERO_HEADLINES[templateKey]?.(name) ?? `${name} — الأفضل في السوق`,
          subheadline: desc.slice(0, 100) || `احصل على ${name} بأفضل سعر مع توصيل سريع`,
          trust_bullets: [
            "✅ الدفع عند الاستلام",
            "🚀 توصيل خلال 2-4 أيام",
            "🔒 ضمان الجودة",
          ],
        };

      case "problem_solution":
        return {
          ...s,
          before_title: PROBLEM_BEFORE[templateKey] ?? "قبل: المشكلة التي تعاني منها",
          after_title:  PROBLEM_AFTER[templateKey]  ?? `بعد: ${name} يحل المشكلة نهائياً`,
          before_points: ["❌ جهد كبير وقت طويل", "❌ نتائج غير مضمونة", "❌ تكلفة عالية"],
          after_points:  ["✅ نتائج فورية وسريعة", "✅ سهل الاستخدام", "✅ اقتصادي ومضمون"],
        };

      case "benefits":
        return {
          ...s,
          items: BENEFITS[templateKey]?.map((b) => ({
            icon: b.icon,
            title: b.title,
            desc: b.desc,
          })) ?? [
            { icon: "⚡", title: "سريع وفعال",      desc: "نتائج فورية بدون تعقيد" },
            { icon: "💪", title: "متين وصامد",       desc: "مصنوع من مواد عالية الجودة" },
            { icon: "🎯", title: "دقيق ومضمون",      desc: "أداء احترافي لكل الحالات" },
            { icon: "🔋", title: "عمر بطارية طويل",  desc: "يشتغل ساعات طويلة بدون انقطاع" },
            { icon: "📦", title: "جاهز للاستخدام",   desc: "كل الملحقات موجودة في الصندوق" },
            { icon: "🛡️", title: "ضمان سنة كاملة",  desc: "خدمة ما بعد البيع مضمونة" },
          ],
        };

      case "reviews":
        return {
          ...s,
          rating: 4.9,
          count: 200,
          items: REVIEWS.map((r) => ({ ...r })),
        };

      case "faq":
        return {
          ...s,
          items: FAQ_ITEMS[templateKey] ?? FAQ_ITEMS.gadget_viral,
        };

      case "order_form":
        return {
          ...s,
          headline: "🛒 اطلب الآن — الدفع عند الاستلام",
          sub: "أملا البيانات وفريقنا كيتصل بيك للتأكيد",
        };

      default:
        return s;
    }
  });

  return {
    title:            `${name} — ${HERO_BADGES[templateKey] ?? "عرض حصري"}`,
    subtitle:         desc.slice(0, 80) || `أفضل ${name} في المغرب`,
    hero_headline:    HERO_HEADLINES[templateKey]?.(name) ?? `احصل على ${name} الآن`,
    hero_subheadline: `🚀 توصيل سريع + الدفع عند الاستلام + ضمان سنة`,
    offer_text:       OFFER_TEXTS[templateKey] ?? "عرض محدود — الكميات تنفد بسرعة!",
    price_text:       `${price.toFixed(0)} درهم`,
    old_price_text:   `${(price * 1.3).toFixed(0)} درهم`,
    stock_text:       "⚠️ المخزون محدود — أقل من 10 قطع",
    cta_text:         CTA_TEXTS[templateKey] ?? "🛒 اطلب الآن",
    whatsapp_number:  "",
    template_key:     templateKey,
    ai_generated:     false,
    sections,
  };
}

// ─── OpenAI stub (ready to implement) ─────────────────────────────────────────
async function generateWithOpenAI(
  product: ProductContext,
  templateKey: TemplateKey
): Promise<GeneratedContent> {
  // TODO: implement when OPENAI_API_KEY is provided
  // const { OpenAI } = await import("openai");
  // const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  // const prompt = buildPrompt(product, templateKey);
  // const response = await client.chat.completions.create({ ... });
  // return parseAIResponse(response, product, templateKey);
  console.log("[ai] OpenAI provider selected but not implemented — falling back to mock");
  return generateMock(product, templateKey);
}

// ─── Gemini stub (ready to implement) ─────────────────────────────────────────
async function generateWithGemini(
  product: ProductContext,
  templateKey: TemplateKey
): Promise<GeneratedContent> {
  // TODO: implement when GEMINI_API_KEY is provided
  console.log("[ai] Gemini provider selected but not implemented — falling back to mock");
  return generateMock(product, templateKey);
}

// ─── Copy data ────────────────────────────────────────────────────────────────
const HERO_HEADLINES: Partial<Record<TemplateKey, (name: string) => string>> = {
  gadget_viral:         (n) => `${n} — التقنية اللي كنت تبحث عليها 🔥`,
  problem_solution_cod: (n) => `خلصت من المشكلة نهائياً مع ${n} ✅`,
  beauty_health:        (n) => `${n} — جمالك يستاهل الأحسن 💄`,
  home_family:          (n) => `${n} — البيت ديالك يستاهل الأحسن 🏠`,
};

const HERO_BADGES: Partial<Record<TemplateKey, string>> = {
  gadget_viral:         "أحدث تقنية 2025",
  problem_solution_cod: "حل فعال ومضمون",
  beauty_health:        "جودة احترافية",
  home_family:          "للبيت المثالي",
};

const OFFER_TEXTS: Partial<Record<TemplateKey, string>> = {
  gadget_viral:         "🔥 عرض إطلاق — خصم 30% لفترة محدودة!",
  problem_solution_cod: "⚡ اطلب اليوم واحصل على هدية مجانية!",
  beauty_health:        "💄 عرض خاص — 2 بثمن 1 لهذا الأسبوع فقط!",
  home_family:          "🏠 توصيل مجاني + ضمان سنة مع كل طلب!",
};

const CTA_TEXTS: Partial<Record<TemplateKey, string>> = {
  gadget_viral:         "🛒 اطلب الآن بسعر خاص",
  problem_solution_cod: "✅ جرب الحل الآن",
  beauty_health:        "💄 اطلبي الآن",
  home_family:          "🏠 اطلب لبيتك الآن",
};

const PROBLEM_BEFORE: Partial<Record<TemplateKey, string>> = {
  problem_solution_cod: "قبل: المشكلة تأثر على يومك كل يوم",
  gadget_viral:         "قبل: تضيع وقت وجهد بدون نتيجة",
};

const PROBLEM_AFTER: Partial<Record<TemplateKey, string>> = {
  problem_solution_cod: "بعد: المنتج حل المشكلة نهائياً في دقائق",
  gadget_viral:         "بعد: نتائج احترافية في أقل من دقيقة",
};

const BENEFITS: Partial<Record<TemplateKey, { icon: string; title: string; desc: string }[]>> = {
  gadget_viral: [
    { icon: "⚡", title: "سرعة فائقة",       desc: "نتائج احترافية في ثوانٍ" },
    { icon: "🎯", title: "دقة عالية",         desc: "تقنية متطورة للنتائج المثالية" },
    { icon: "🔋", title: "بطارية قوية",       desc: "10+ ساعات استمرارية" },
    { icon: "💪", title: "متين وصامد",        desc: "مصنوع ليدوم سنوات" },
    { icon: "📦", title: "طقم كامل",          desc: "كل الملحقات في الصندوق" },
    { icon: "🛡️", title: "ضمان سنة",        desc: "نحن نضمن جودتنا" },
  ],
  problem_solution_cod: [
    { icon: "✅", title: "نتائج فورية",      desc: "يحل المشكلة من أول استخدام" },
    { icon: "🌿", title: "آمن تماماً",       desc: "مواد طبيعية وآمنة للعائلة" },
    { icon: "💰", title: "اقتصادي",          desc: "يوفر عليك الكثير على المدى البعيد" },
    { icon: "⚡", title: "سهل الاستخدام",   desc: "لا يحتاج خبرة أو تقنية" },
    { icon: "🔄", title: "متعدد الاستخدام", desc: "يحل أكثر من مشكلة واحدة" },
    { icon: "🛡️", title: "ضمان مضمون",     desc: "راضٍ أو مستردّ ثمنك" },
  ],
};

const REVIEWS = [
  { name: "فاطمة الزهراء", city: "الدار البيضاء", stars: 5, text: "منتج رائع جداً! توصل في يومين والجودة ممتازة. شكراً لفريقكم ❤️" },
  { name: "محمد أمين",     city: "مراكش",          stars: 5, text: "استعملته وحصلت على نتائج مذهلة. يستحق كل درهم! سأطلب مرة أخرى." },
  { name: "خديجة بنعلي",   city: "فاس",            stars: 5, text: "الدفع عند الاستلام أحسن شيء. وصل في الوقت المحدد بدون أي مشكلة ✅" },
  { name: "يوسف العلوي",   city: "أكادير",          stars: 5, text: "جودة ممتازة وسعر معقول. أنصح به لجميع أصدقائي 👍" },
];

const FAQ_ITEMS: Record<string, { q: string; a: string }[]> = {
  gadget_viral: [
    { q: "كيفاش كيتصل بالبطارية؟",     a: "يتشحن عبر كابل USB المرفق خلال ساعتين." },
    { q: "واش كيخدم مع جميع الأجهزة؟", a: "نعم يتوافق مع جميع الأجهزة والأنظمة الحديثة." },
    { q: "شحال يدوم الضمان؟",           a: "ضمان سنة كاملة مع دعم فني متاح." },
    { q: "فين يوصل التوصيل؟",           a: "لجميع مدن المغرب خلال 2-4 أيام عمل." },
  ],
  problem_solution_cod: [
    { q: "هل هو آمن على الأطفال والحيوانات الأليفة؟", a: "نعم آمن تماماً، مواد طبيعية معتمدة." },
    { q: "كيفاش كتستعمله؟",  a: "سهل جداً، التعليمات موجودة في الصندوق بالعربية." },
    { q: "شحال يدوم المفعول؟", a: "مفعول دائم مع الاستخدام الصحيح." },
    { q: "واش كاين توصيل لجميع المدن؟", a: "نعم لجميع مدن المغرب." },
  ],
  beauty_health: [
    { q: "هل هو مناسب لجميع أنواع البشرة؟", a: "نعم، مناسب لجميع أنواع البشرة." },
    { q: "متى تظهر النتائج؟", a: "تظهر نتائج واضحة خلال أسبوع من الاستخدام المنتظم." },
    { q: "هل له آثار جانبية؟", a: "لا، مكونات طبيعية 100% بدون آثار جانبية." },
    { q: "كيفاش يجي التوصيل؟", a: "في علبة سرية وبدون أي كتابة على الغلاف." },
  ],
  home_family: [
    { q: "هل التركيب سهل؟", a: "نعم، يتركب في 5 دقائق بدون أدوات خاصة." },
    { q: "ما هي مقاسات المنتج؟", a: "المقاسات موجودة في الوصف، مناسبة لجميع البيوت." },
    { q: "هل يمكن إعادة الإرجاع؟", a: "نعم، إرجاع مجاني خلال 7 أيام إذا لم تكن راضياً." },
    { q: "ما مدة الضمان؟", a: "ضمان سنة كاملة على كل عيوب التصنيع." },
  ],
};
