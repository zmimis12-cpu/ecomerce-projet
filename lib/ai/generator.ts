/**
 * lib/ai/generator.ts — Server-side only.
 * Generates UNIQUE product-specific content using granular fingerprints.
 */
import type { TemplateKey, LPSection } from "@/lib/templates";
import { analyzeProduct } from "./analyzer";
import type { ProductAnalysis, ProductFingerprint } from "./analyzer";

export interface ProductContext {
  id: string; name: string; description: string | null;
  sale_price_mad: number; sku: string;
}

export interface GeneratedContent {
  title: string; subtitle: string;
  hero_headline: string; hero_subheadline: string;
  offer_text: string; price_text: string; old_price_text: string;
  stock_text: string; cta_text: string;
  whatsapp_number: string; template_key: TemplateKey;
  ai_generated: boolean; sections: LPSection[];
  bundle_1_price: number; bundle_2_price: number; bundle_3_price: number;
  ai_analysis: ProductAnalysis;
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export async function generateLandingPageContent(
  product: ProductContext,
  templateKeyOverride?: TemplateKey
): Promise<GeneratedContent> {
  const analysis    = analyzeProduct(product);
  const templateKey = templateKeyOverride ?? analysis.templateKey;

  const provider = process.env.AI_PROVIDER?.toLowerCase();
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return generateWithClaudeAPI(product, templateKey, analysis);
  }
  return generateFromFingerprint(product, templateKey, analysis);
}

// ─── Fingerprint-based generator — unique copy per product ────────────────────
function generateFromFingerprint(
  product: ProductContext,
  templateKey: TemplateKey,
  analysis: ProductAnalysis
): GeneratedContent {
  const { name, sale_price_mad: price } = product;
  const fp  = analysis.fingerprint;
  const copy = COPY_BY_FINGERPRINT[fp];

  const b1 = price;
  const b2 = parseFloat((price * 2 * 0.9).toFixed(2));
  const b3 = parseFloat((price * 3 * 0.8).toFixed(2));

  // Hero copy — uses product name + fingerprint-specific text
  const heroHeadline    = copy.headline(name);
  const heroSubheadline = copy.subheadline(analysis.main_benefit);
  const offerText       = copy.offer_text;
  const ctaText         = copy.cta;
  const badge           = copy.badge;

  // Benefits — product-specific
  const benefits = copy.benefits;

  // Reviews — product-specific names and context
  const reviews = copy.reviews(name);

  // FAQ — product-specific questions
  const faq = copy.faq;

  // Problem/solution — product-specific
  const beforePoints = copy.before_points;
  const afterPoints  = copy.after_points(name);
  const beforeTitle  = copy.before_title;
  const afterTitle   = copy.after_title(name);

  // Build sections
  const sections = buildSections(templateKey, {
    heroHeadline, heroSubheadline, analysis, benefits, reviews, faq,
    beforePoints, afterPoints, beforeTitle, afterTitle,
    formSub: `${analysis.target_audience}`,
  });

  return {
    title:            `${name} — ${badge}`,
    subtitle:         analysis.main_benefit,
    hero_headline:    heroHeadline,
    hero_subheadline: heroSubheadline,
    offer_text:       offerText,
    price_text:       `${price.toFixed(0)} درهم`,
    old_price_text:   `${(price * 1.3).toFixed(0)} درهم`,
    stock_text:       copy.stock_text,
    cta_text:         ctaText,
    whatsapp_number:  "",
    template_key:     templateKey,
    ai_generated:     false,
    sections,
    bundle_1_price:   b1,
    bundle_2_price:   b2,
    bundle_3_price:   b3,
    ai_analysis:      analysis,
  };
}

// ─── Section builder ──────────────────────────────────────────────────────────
function buildSections(
  templateKey: TemplateKey,
  d: {
    heroHeadline: string; heroSubheadline: string;
    analysis: ProductAnalysis;
    benefits: { icon: string; title: string; desc: string }[];
    reviews: { name: string; city: string; stars: number; text: string }[];
    faq: { q: string; a: string }[];
    beforePoints: string[]; afterPoints: string[];
    beforeTitle: string; afterTitle: string;
    formSub: string;
  }
): LPSection[] {
  const allSections: Record<string, LPSection> = {
    hero: {
      type: "hero", enabled: true,
      headline: d.heroHeadline, subheadline: d.heroSubheadline,
      trust_bullets: ["الدفع عند الاستلام", "توصيل 2-4 أيام", "ضمان الجودة", "دعم مستمر"],
    },
    problem_solution: {
      type: "problem_solution", enabled: true,
      before_title: d.beforeTitle, after_title: d.afterTitle,
      before_points: d.beforePoints, after_points: d.afterPoints,
    },
    gallery:    { type: "gallery",    enabled: true },
    benefits:   { type: "benefits",   enabled: true, items: d.benefits },
    reviews:    { type: "reviews",    enabled: true, rating: 4.9, count: 200, items: d.reviews },
    faq:        { type: "faq",        enabled: true, items: d.faq },
    order_form: {
      type: "order_form", enabled: true,
      headline: "اطلب الآن — الدفع عند الاستلام",
      sub: d.formSub,
    },
  };

  const orders: Record<TemplateKey, string[]> = {
    gadget_viral:         ["hero", "benefits", "problem_solution", "gallery", "reviews", "faq", "order_form"],
    problem_solution_cod: ["hero", "problem_solution", "benefits", "gallery", "reviews", "faq", "order_form"],
    beauty_health:        ["hero", "benefits", "reviews", "gallery", "faq", "order_form"],
    home_family:          ["hero", "benefits", "gallery", "reviews", "order_form"],
  };

  return (orders[templateKey] ?? orders.gadget_viral)
    .map((k) => allSections[k])
    .filter(Boolean);
}

// ─── Claude API ────────────────────────────────────────────────────────────────
async function generateWithClaudeAPI(
  product: ProductContext,
  templateKey: TemplateKey,
  analysis: ProductAnalysis
): Promise<GeneratedContent> {
  try {
    const base = generateFromFingerprint(product, templateKey, analysis);
    const prompt = `You are a Moroccan COD e-commerce copywriter expert in Darija Arabic.
Product: "${product.name}"
Description: "${product.description ?? "N/A"}"
Price: ${product.sale_price_mad} MAD
Product type: ${analysis.product_type}
Main problem it solves: ${analysis.main_problem}
Main benefit: ${analysis.main_benefit}

Generate ONLY a JSON object with these fields for a high-converting Moroccan landing page:
{
  "hero_headline": "2-line max, uses product name, very catchy in Darija",
  "hero_subheadline": "1 line, confirms main benefit + COD/delivery",
  "offer_text": "urgency promo text, max 10 words",
  "cta_text": "button text, max 6 words"
}
Rules: Moroccan Darija, persuasive, human, no excessive emojis, product-specific.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.OPENAI_API_KEY! },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (response.ok) {
      const data = await response.json() as { content: { type: string; text: string }[] };
      const text = data.content.find((b) => b.type === "text")?.text ?? "";
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as Partial<GeneratedContent>;
        return {
          ...base,
          hero_headline:    parsed.hero_headline    ?? base.hero_headline,
          hero_subheadline: parsed.hero_subheadline ?? base.hero_subheadline,
          offer_text:       parsed.offer_text       ?? base.offer_text,
          cta_text:         parsed.cta_text         ?? base.cta_text,
          ai_generated: true,
        };
      }
    }
  } catch (e) { console.error("[ai] Claude API failed:", e); }
  return generateFromFingerprint(product, templateKey, analysis);
}

// ─── Per-fingerprint copy data ────────────────────────────────────────────────
type CopyData = {
  headline:      (name: string) => string;
  subheadline:   (benefit: string) => string;
  offer_text:    string;
  cta:           string;
  badge:         string;
  stock_text:    string;
  before_title:  string;
  after_title:   (name: string) => string;
  before_points: string[];
  after_points:  (name: string) => string[];
  benefits: { icon: string; title: string; desc: string }[];
  reviews: (name: string) => { name: string; city: string; stars: number; text: string }[];
  faq: { q: string; a: string }[];
};

const COPY_BY_FINGERPRINT: Record<ProductFingerprint, CopyData> = {

  projector: {
    headline:      (n) => `${n} — سينما حقيقية في بيتك`,
    subheadline:   () => `شاشة عملاقة للأفلام والمباريات والألعاب — الدفع عند الاستلام`,
    offer_text:    `عرض محدود — توصيل مجاني لجميع المدن`,
    cta:           `اطلب الآن`,
    badge:         `تجربة سينما في بيتك`,
    stock_text:    `الكمية محدودة — اطلب الآن`,
    before_title:  `قبل: شاشة صغيرة وليالي مملة`,
    after_title:   (n) => `بعد: ${n} — سينما حقيقية كل ليلة`,
    before_points: [
      `شاشة الهاتف صغيرة ومؤلمة للعيون`,
      `التلفاز العادي ما يعطيش إحساس السينما`,
      `الخروج للسينما غالي ومتعب`,
    ],
    after_points: (n) => [
      `${n} يعطيك شاشة تصل لـ 200 بوصة`,
      `صورة واضحة وألوان حية بتقنية HD`,
      `سينما في بيتك كل يوم بدون تكلفة إضافية`,
    ],
    benefits: [
      { icon: "🎬", title: "شاشة عملاقة",       desc: "صورة واضحة تصل لـ 200 بوصة" },
      { icon: "🎮", title: "تجربة ألعاب مذهلة", desc: "العب ألعابك المفضلة على شاشة كبيرة" },
      { icon: "📺", title: "أفلام وسيريالات",   desc: "Netflix وYouTube وكل التطبيقات" },
      { icon: "🔊", title: "صوت قوي وواضح",     desc: "مكبر صوت مدمج بجودة عالية" },
      { icon: "📱", title: "اتصال بالهاتف",     desc: "انقل الصورة من هاتفك في ثانية" },
      { icon: "🔋", title: "سهل التنقل",        desc: "استعمله في أي مكان بدون تعقيد" },
    ],
    reviews: (n) => [
      { name: "يوسف الإدريسي",  city: "الدار البيضاء", stars: 5, text: `اشتريت ${n} وما ندمت. الصورة واضحة وكبيرة، الأطفال مبسوطون جداً. التوصيل جاء في يومين.` },
      { name: "مريم الفيلالي",  city: "الرباط",         stars: 5, text: `كنت خايفة نشري من النت بس الدفع عند الاستلام راحتني. المنتج ممتاز وما توقعته يكون بهاد الجودة!` },
      { name: "خالد بنعيسى",   city: "مراكش",          stars: 5, text: `مبدل التلفاز بـ ${n} وما رجعتش نتبع التلفاز. السينما في البيت حلم أصبح حقيقة.` },
    ],
    faq: [
      { q: "كيفاش يتوصل الصوت والصورة؟",     a: "عبر HDMI أو WiFi أو Bluetooth — كلهم موجودين." },
      { q: "واش يخدم في الضوء؟",              a: "يخدم أحسن في الظلام أو الضوء الخافت." },
      { q: "شحال الشاشة اللي يقدر يعطيها؟",  a: "من 30 حتى 200 بوصة حسب المسافة." },
      { q: "واش فيه ضمان؟",                  a: "نعم، ضمان سنة كاملة مع دعم فني." },
      { q: "فين يوصل التوصيل؟",              a: "لجميع مدن المغرب خلال 2-4 أيام." },
    ],
  },

  metal_detector: {
    headline:      (n) => `${n} — اكشف الذهب والكنوز المدفونة`,
    subheadline:   () => `دقة عالية في الكشف حتى متر تحت الأرض — الدفع عند الاستلام`,
    offer_text:    `عرض المغامر — توصيل مجاني`,
    cta:           `ابدأ مغامرتك الآن`,
    badge:         `للمغامرين وعشاق الاكتشاف`,
    stock_text:    `كمية محدودة — اطلب قبل النفاد`,
    before_title:  `قبل: البحث العشوائي بدون نتيجة`,
    after_title:   (n) => `بعد: ${n} يوجهك مباشرة للهدف`,
    before_points: [
      `البحث اليدوي مستحيل وغير دقيق`,
      `تضيع ساعات بدون أي نتيجة`,
      `الأجهزة الرخيصة ما تحسش بالمعادن العميقة`,
    ],
    after_points: (n) => [
      `${n} يكشف المعادن حتى عمق متر تحت الأرض`,
      `يميز بين الذهب والفضة والنحاس والحديد`,
      `صوت وإشارة واضحة عند اكتشاف أي معدن`,
    ],
    benefits: [
      { icon: "🔍", title: "كشف عميق",          desc: "يصل حتى متر تحت التربة والرمل" },
      { icon: "⚡", title: "استجابة فورية",      desc: "صوت وإشارة فورية عند الاكتشاف" },
      { icon: "🎯", title: "تمييز المعادن",      desc: "يفرق بين الذهب والحديد والفضة" },
      { icon: "🌊", title: "مقاوم للماء",        desc: "يشتغل في الشواطئ والمناطق الرطبة" },
      { icon: "🔋", title: "بطارية طويلة",       desc: "يشتغل 10 ساعات على شحن واحد" },
      { icon: "📦", title: "طقم كامل",           desc: "كل الملحقات جاهزة في الصندوق" },
    ],
    reviews: (n) => [
      { name: "محمد الأمازيغي",  city: "ورززات",         stars: 5, text: `اشتريت ${n} ووجدت قطعة نحاس قديمة في أول استعمال. الجهاز حساس جداً وسهل الاستخدام.` },
      { name: "حسن الجبلي",     city: "الحسيمة",         stars: 5, text: `جربت أجهزة كثيرة ولكن ${n} هو الأحسن في هاد الثمن. يحس بالمعادن الصغيرة بدون مشكلة.` },
      { name: "عبد الله الصحراوي", city: "العيون",       stars: 5, text: `للمغامرين حقيقيين. الجهاز متين ويشتغل في أي نوع تربة. الدفع عند الاستلام مريح بزاف.` },
    ],
    faq: [
      { q: "كيفاش يميز بين المعادن؟",           a: "يعطي صوت مختلف لكل نوع معدن + شاشة رقمية." },
      { q: "واش يشتغل في الشاطئ؟",             a: "نعم، الملف مقاوم للماء ومناسب للشواطئ." },
      { q: "شحال عمق الكشف؟",                  a: "من 20 سم حتى متر حسب نوع المعدن والتربة." },
      { q: "هل يحتاج خبرة لاستخدامه؟",         a: "لا، سهل جداً والتعليمات بالعربية في الصندوق." },
      { q: "واش فيه ضمان؟",                    a: "ضمان سنة كاملة مع دعم فني." },
    ],
  },

  anti_insect: {
    headline:      (n) => `${n} — وداعاً للناموس والحشرات إلى الأبد`,
    subheadline:   () => `حماية 24/7 بدون مواد كيميائية — آمن للأطفال والحيوانات`,
    offer_text:    `عرض العائلة — توصيل مجاني`,
    cta:           `احمِ عائلتك الآن`,
    badge:         `نوم هادئ بدون حشرات`,
    stock_text:    `الكمية محدودة`,
    before_title:  `قبل: الناموس يسرق نومك ويهدد صحتك`,
    after_title:   (n) => `بعد: ${n} — نوم هادئ وبيت نظيف`,
    before_points: [
      `الناموس يمنعك من النوم كل ليلة`,
      `الأدوية الكيميائية خطيرة على الأطفال`,
      `الملابس والأضواء ما تنفعش مع الكثافة العالية`,
    ],
    after_points: (n) => [
      `${n} يطرد الحشرات بدون رائحة أو دخان`,
      `آمن 100% للأطفال والحيوانات الأليفة`,
      `يشتغل طول الليل بهدوء تام`,
    ],
    benefits: [
      { icon: "😴", title: "نوم هادئ كل ليلة",   desc: "لا ناموس لا صوت لا قلق — فقط نوم عميق" },
      { icon: "🌿", title: "آمن 100%",             desc: "بدون مواد كيميائية — مثالي للأطفال" },
      { icon: "🏠", title: "يغطي كل المنزل",      desc: "يحمي الغرفة والصالون والمطبخ" },
      { icon: "🔇", title: "صامت تماماً",          desc: "لا صوت ولا رائحة أثناء الاستخدام" },
      { icon: "💡", title: "سهل الاستخدام",        desc: "شغّله ونسَه — يشتغل تلقائياً" },
      { icon: "💰", title: "اقتصادي جداً",         desc: "أوفر بكثير من الرذاذ والسموم" },
    ],
    reviews: (n) => [
      { name: "أمينة الحسيني",  city: "الدار البيضاء", stars: 5, text: `من وقت اشتريت ${n} ما شفت ناموس في البيت. الأطفال بدؤوا ينامون بدون مشاكل. منتج ممتاز!` },
      { name: "رشيد المنصوري",  city: "أكادير",         stars: 5, text: `كنت مشتت بين المبيدات. جربت ${n} وما رجعتش. آمن وفعال وما فيه رائحة.` },
      { name: "فاطمة الزهراء",  city: "فاس",            stars: 5, text: `الصيف كان كابوس بسبب الناموس. ${n} حل المشكلة من أول ليلة. شكراً!` },
    ],
    faq: [
      { q: "هل هو آمن للأطفال الصغار؟",           a: "نعم آمن 100% — لا مواد كيميائية ولا رائحة." },
      { q: "كم مدة عمله بالكهرباء في الليلة؟",   a: "يشتغل طول الليل بدون انقطاع." },
      { q: "واش يقدر يغطي غرفة كبيرة؟",          a: "يغطي حتى 40 متر مربع بفعالية تامة." },
      { q: "هل يشتغل على البطارية؟",              a: "بعض الأنواع نعم، التفاصيل في وصف المنتج." },
      { q: "فين يوصل التوصيل؟",                  a: "لجميع مدن المغرب خلال 2-4 أيام." },
    ],
  },

  air_purifier: {
    headline:      (n) => `${n} — هواء نقي وصحي في كل ركن من بيتك`,
    subheadline:   () => `يقضي على الغبار والروائح والجراثيم — الدفع عند الاستلام`,
    offer_text:    `توصيل مجاني + ضمان سنة`,
    cta:           `احصل على هواء نقي الآن`,
    badge:         `للصحة وجودة الهواء`,
    stock_text:    `عرض محدود`,
    before_title:  `قبل: هواء ملوث وحساسيات مستمرة`,
    after_title:   (n) => `بعد: ${n} — تنفس بحرية كل يوم`,
    before_points: [`الغبار والأبواغ تسبب الحساسية`, `روائح المطبخ والتدخين تبقى ساعات`, `الجراثيم والفيروسات تنتشر بسهولة`],
    after_points: (n) => [`${n} يصفي الهواء 99.9%`, `يقضي على الروائح في دقائق`, `يحمي العائلة من الجراثيم والفيروسات`],
    benefits: [
      { icon: "💨", title: "هواء نقي 99.9%",     desc: "يزيل الغبار والأبواغ والجراثيم" },
      { icon: "🌸", title: "يزيل الروائح",        desc: "مطبخ وسجائر وحيوانات — كلها تختفي" },
      { icon: "😤", title: "يقلل الحساسية",       desc: "مثالي لمرضى الربو والحساسية" },
      { icon: "🔇", title: "صامت وهادئ",          desc: "لا يزعج النوم ولا العمل" },
      { icon: "💡", title: "تلقائي وذكي",         desc: "يشغل نفسه عند الحاجة" },
      { icon: "🛡️", title: "حماية يومية",        desc: "24 ساعة يومياً بدون توقف" },
    ],
    reviews: (n) => [
      { name: "نوال الشرقاوي",  city: "الرباط",   stars: 5, text: `ابني عنده حساسية من الغبار. منذ اشترينا ${n} انخفضت نوبات الحساسية بشكل ملحوظ. شكراً!` },
      { name: "توفيق المغاري",  city: "مراكش",    stars: 5, text: `الروائح كانت مشكلة. ${n} حلها من أول يوم. الهواء أصبح نقياً وخفيفاً.` },
      { name: "هند بوعزة",      city: "الجديدة",  stars: 5, text: `منتج ممتاز، خاصة للعائلات. الدفع عند الاستلام راحة كبيرة. أنصح به.` },
    ],
    faq: [
      { q: "كم متر مربع يغطي؟",          a: "يغطي من 20 إلى 50 متر مربع حسب الموديل." },
      { q: "متى يجب تغيير الفلتر؟",      a: "كل 6 أشهر تقريباً حسب الاستخدام." },
      { q: "هل هو آمن للأطفال؟",         a: "نعم آمن 100% ولا يطلق أي مواد ضارة." },
      { q: "كم يستهلك من الكهرباء؟",    a: "استهلاك منخفض جداً — مثل لمبة عادية." },
      { q: "واش فيه ضمان؟",             a: "ضمان سنة كاملة." },
    ],
  },

  cleaning_device: {
    headline:      (n) => `${n} — نظافة احترافية في نصف الوقت`,
    subheadline:   () => `تنظيف عميق لكل ركن — يوفر ساعات من الجهد اليومي`,
    offer_text:    `توصيل مجاني لجميع المدن`,
    cta:           `اطلب الآن`,
    badge:         `للنظافة الاحترافية`,
    stock_text:    `عرض محدود`,
    before_title:  `قبل: ساعات من التنظيف اليدوي`,
    after_title:   (n) => `بعد: ${n} ينظف بدقة احترافية في دقائق`,
    before_points: [`التنظيف اليدوي متعب ويأخذ ساعات`, `الأوساخ العميقة تبقى رغم الجهد`, `الفرشاة والمكنسة ما تنفعش للتنظيف العميق`],
    after_points: (n) => [`${n} ينظف عمق الأسطح بضغط قوي`, `يوفر 70% من وقت التنظيف`, `نتائج احترافية في كل استخدام`],
    benefits: [
      { icon: "🌊", title: "تنظيف عميق",      desc: "يصل لأعمق الأوساخ والتراكمات" },
      { icon: "⚡", title: "سريع وقوي",        desc: "ينجز في دقائق ما يأخذ ساعات يدوياً" },
      { icon: "💧", title: "موفر للماء",        desc: "يستهلك ماء أقل بنتيجة أفضل" },
      { icon: "🏠", title: "متعدد الاستخدام", desc: "أرضيات وأثاث وسيارة ومطبخ" },
      { icon: "🤸", title: "خفيف وسهل",        desc: "لا جهد ولا ضغط على الظهر والركبتين" },
      { icon: "💰", title: "اقتصادي",           desc: "يغني عن خدمات التنظيف الغالية" },
    ],
    reviews: (n) => [
      { name: "سعاد الغزالي",   city: "مراكش",  stars: 5, text: `اشتريت ${n} وأصبح التنظيف متعة. في 30 دقيقة ينتهي ما كان يأخذ 3 ساعات. ممتاز!` },
      { name: "كريم الحيان",    city: "الدار البيضاء", stars: 5, text: `للمطبخ والسجاد والأرضيات. ${n} يغطي كل شيء. الجودة تستحق كل درهم.` },
      { name: "ليلى بنيوب",     city: "طنجة",   stars: 5, text: `الدفع عند الاستلام راحني. المنتج ممتاز وأسهل مما توقعت. شكراً للتوصيل السريع.` },
    ],
    faq: [
      { q: "هل يشتغل على أنواع أرضيات مختلفة؟", a: "نعم مناسب للبلاط والباركيه والسجاد." },
      { q: "كيف يتم تنظيف الجهاز نفسه؟",       a: "سهل، ملحقات قابلة للفك والغسيل." },
      { q: "هل له ضوضاء عالية؟",               a: "صوت طبيعي أقل من المكانس العادية." },
      { q: "كم يدوم الضمان؟",                 a: "ضمان سنة كاملة." },
      { q: "فين يوصل التوصيل؟",               a: "لجميع مدن المغرب خلال 2-4 أيام." },
    ],
  },

  surveillance_camera: {
    headline:      (n) => `${n} — راقب بيتك من أي مكان في العالم`,
    subheadline:   () => `مراقبة 24/7 من هاتفك — رؤية ليلية واضحة`,
    offer_text:    `عرض الأمان — توصيل مجاني`,
    cta:           `امنح بيتك الأمان الآن`,
    badge:         `للأمن والمراقبة`,
    stock_text:    `عرض محدود`,
    before_title:  `قبل: لا تعرف ما يحدث في غيابك`,
    after_title:   (n) => `بعد: ${n} عينك الدائمة على بيتك`,
    before_points: [`لا تعرف من يدخل بيتك في غيابك`, `الكاميرات الرخيصة صورتها مظلمة ليلاً`, `لا إشعارات عند حركة مشبوهة`],
    after_points: (n) => [`${n} يرسل إشعاراً فورياً لهاتفك`, `رؤية ليلية واضحة بتقنية الأشعة تحت الحمراء`, `تسجيل مستمر وتخزين في السحابة`],
    benefits: [
      { icon: "📱", title: "مراقبة من هاتفك",   desc: "شاهد بيتك في أي وقت من أي مكان" },
      { icon: "🌙", title: "رؤية ليلية",         desc: "صورة واضحة حتى في الظلام التام" },
      { icon: "🔔", title: "إشعارات فورية",      desc: "تنبيه لحظي عند أي حركة مشبوهة" },
      { icon: "☁️", title: "تخزين سحابي",        desc: "احتفظ بالتسجيلات بأمان" },
      { icon: "🔧", title: "تركيب سهل",          desc: "جاهز في 10 دقائق بدون تقني" },
      { icon: "🌦️", title: "مقاوم للعوامل",     desc: "يشتغل في الحرارة والبرد والمطر" },
    ],
    reviews: (n) => [
      { name: "محمد الكتاني",  city: "الدار البيضاء", stars: 5, text: `اشتريت ${n} وتغيرت حياتي. أراقب المحل من هاتفي وأنا في البيت. جودة رائعة وسعر معقول.` },
      { name: "وفاء التامني",  city: "أكادير",         stars: 5, text: `للأمهات اللواتي يتركن الأطفال مع الخادمة. ${n} أعطاني راحة البال التامة.` },
      { name: "إبراهيم الحاج", city: "الرباط",         stars: 5, text: `صورة واضحة ليلاً ونهاراً. تركيب سهل جداً. الدفع عند الاستلام راحني كثيراً.` },
    ],
    faq: [
      { q: "هل يحتاج إنترنت للعمل؟",     a: "نعم، WiFi للمراقبة عن بعد من هاتفك." },
      { q: "كيف أشاهد التسجيلات؟",       a: "عبر تطبيق مجاني على هاتفك iOS وAndroid." },
      { q: "هل يشتغل ليلاً؟",            a: "نعم، رؤية ليلية تصل لـ 10 أمتار." },
      { q: "هل التركيب صعب؟",            a: "لا، يتركب في 10 دقائق والتعليمات بالعربية." },
      { q: "ما مدة الضمان؟",             a: "ضمان سنة كاملة." },
    ],
  },

  sports_fitness: {
    headline:      (n) => `${n} — جسم مثالي بدون الحاجة للنادي الرياضي`,
    subheadline:   () => `تمرين احترافي في بيتك — نتائج في 30 يوماً`,
    offer_text:    `ابدأ رحلتك الرياضية اليوم`,
    cta:           `اطلب الآن`,
    badge:         `للياقة البدنية في البيت`,
    stock_text:    `كمية محدودة`,
    before_title:  `قبل: الكسل والعذر بالوقت والثمن`,
    after_title:   (n) => `بعد: ${n} — تمرين كل يوم بدون أعذار`,
    before_points: [`الاشتراك في النادي مكلف وبعيد`, `لا وقت للخروج للرياضة كل يوم`, `التمرين المنزلي بدون معدات غير فعال`],
    after_points: (n) => [`${n} متاح في بيتك 24 ساعة`, `تمرين احترافي في 20-30 دقيقة يومياً`, `نتائج ملموسة في أسبوعين`],
    benefits: [
      { icon: "💪", title: "بناء العضلات",     desc: "تمرين فعال يستهدف كل مجموعة عضلية" },
      { icon: "🏃", title: "حرق الدهون",       desc: "تمرين كارديو مكثف في وقت قصير" },
      { icon: "🏠", title: "في بيتك",           desc: "لا نادي لا تنقل لا مواعيد" },
      { icon: "⏱️", title: "20 دقيقة يومياً", desc: "برنامج فعال لا يأخذ وقتاً طويلاً" },
      { icon: "📈", title: "نتائج سريعة",       desc: "تحس بالفرق من الأسبوع الأول" },
      { icon: "🎯", title: "مناسب للجميع",      desc: "مبتدئ أو محترف — يتأقلم مع مستواك" },
    ],
    reviews: (n) => [
      { name: "رضوان الجراري",  city: "الدار البيضاء", stars: 5, text: `مشتركتش في النادي من 6 أشهر. اشتريت ${n} وما ندمت. نتائج ملموسة في أقل من شهر.` },
      { name: "سلوى الفاسي",   city: "الرباط",         stars: 5, text: `للأمهات اللواتي ليس لديهن وقت. ${n} يناسب جدول أي شخص. أنصح به بشدة.` },
      { name: "عمر الحمودي",   city: "طنجة",           stars: 5, text: `جودة ممتازة وسعر معقول مقارنة بالأجهزة الأخرى. الدفع عند الاستلام ريّحني.` },
    ],
    faq: [
      { q: "هل يناسب المبتدئين؟",           a: "نعم، مناسب لجميع المستويات." },
      { q: "كيف أعرف طريقة الاستخدام؟",    a: "فيديوهات شرح مجانية مع كل طلب." },
      { q: "هل يحتاج مساحة كبيرة؟",        a: "لا، يمكن استخدامه في أي غرفة عادية." },
      { q: "كم وقت يستغرق التمرين؟",       a: "20-30 دقيقة يومياً تكفي للنتائج." },
      { q: "ما مدة الضمان؟",               a: "ضمان سنة كاملة." },
    ],
  },

  beauty_hair: {
    headline:      (n) => `${n} — شعر صالون احترافي في بيتك`,
    subheadline:   () => `شعر ناعم ولامع وصحي — بدون أسعار الصالون`,
    offer_text:    `عرض الجمال — توصيل مجاني`,
    cta:           `اطلبيه الآن`,
    badge:         `لشعر احترافي في البيت`,
    stock_text:    `كمية محدودة`,
    before_title:  `قبل: شعر تالف وصالونات مكلفة`,
    after_title:   (n) => `بعد: ${n} — إطلالة مثالية كل يوم`,
    before_points: [`الصالون غالي وبعيد وما دايمًا متاح`, `المنتجات الرخيصة تتلف الشعر`, `الشعر الجاف والمتكسر مشكلة يومية`],
    after_points: (n) => [`${n} يعطي نتيجة صالون في البيت`, `شعر ناعم ولامع يدوم أياماً`, `حماية الشعر من الحرارة الزائدة`],
    benefits: [
      { icon: "✨", title: "لمعة فورية",         desc: "شعر لامع ومشرق من أول استخدام" },
      { icon: "💧", title: "ترطيب عميق",         desc: "لا جفاف ولا تكسر بعد الاستخدام" },
      { icon: "⚡", title: "سريع وعملي",          desc: "في 10 دقائق إطلالة مثالية" },
      { icon: "🌡️", title: "حرارة مضبوطة",      desc: "حماية الشعر من الحرارة الزائدة" },
      { icon: "💰", title: "وفّري المال",         desc: "جلسة صالون واحدة = ثمن الجهاز" },
      { icon: "🎀", title: "لجميع أنواع الشعر",  desc: "مجعد ومستقيم وناعم وكثيف" },
    ],
    reviews: (n) => [
      { name: "مي الإدريسي",   city: "الدار البيضاء", stars: 5, text: `كنت نمشي للصالون كل أسبوع. منذ اشتريت ${n} ما رجعت. نتيجة أحسن بكثير وأوفر بزاف.` },
      { name: "حنان الوزاني",  city: "مراكش",          stars: 5, text: `شعري ناعم ولامع منذ أول استخدام. ${n} أحسن منتج اشتريته هاد العام.` },
      { name: "زينب الحيان",   city: "الرباط",          stars: 5, text: `للبنات اللواتي يبحثن عن نتائج احترافية. ${n} هو الجواب. الدفع عند الاستلام مريح.` },
    ],
    faq: [
      { q: "هل يناسب الشعر المجعد؟",         a: "نعم مناسب لجميع أنواع الشعر." },
      { q: "كيف أحمي شعري من الحرارة؟",      a: "استخدمي سيروم الحماية الحرارية قبل الاستخدام." },
      { q: "كم مرة يمكن استخدامه أسبوعياً؟", a: "2-3 مرات أسبوعياً للحصول على أفضل النتائج." },
      { q: "هل هو آمن للشعر المصبوغ؟",       a: "نعم، مناسب للشعر المصبوغ والمعالج." },
      { q: "ما مدة الضمان؟",                 a: "ضمان سنة كاملة." },
    ],
  },

  beauty_skin: {
    headline:      (n) => `${n} — بشرة مشرقة وشابة بدون مصل خرافي الثمن`,
    subheadline:   () => `نتائج واضحة خلال 7 أيام — مكونات طبيعية معتمدة`,
    offer_text:    `عرض الإطلالة — توصيل مجاني`,
    cta:           `اطلبيه الآن`,
    badge:         `للبشرة المشرقة الطبيعية`,
    stock_text:    `كمية محدودة`,
    before_title:  `قبل: بشرة باهتة تحتاج عناية حقيقية`,
    after_title:   (n) => `بعد: ${n} — بشرة مشرقة وحيوية`,
    before_points: [`البشرة الباهتة والجافة تأثر على الثقة بالنفس`, `المنتجات الغالية ما تعطيش نتيجة`, `الحلول الكيميائية تلحق الضرر على المدى البعيد`],
    after_points: (n) => [`${n} يغذي البشرة من العمق`, `إشراق طبيعي يظهر من أول أسبوع`, `مكونات طبيعية آمنة للاستخدام اليومي`],
    benefits: [
      { icon: "✨", title: "إشراق فوري",         desc: "بشرة مشرقة وحيوية من أول استخدام" },
      { icon: "💧", title: "ترطيب عميق",         desc: "يحافظ على رطوبة البشرة طول اليوم" },
      { icon: "🌿", title: "مكونات طبيعية",      desc: "آمن لجميع أنواع البشرة حتى الحساسة" },
      { icon: "🕐", title: "نتائج سريعة",        desc: "فرق واضح خلال 7 أيام من الاستخدام" },
      { icon: "🛡️", title: "حماية يومية",       desc: "يحمي البشرة من التلوث والأشعة" },
      { icon: "💎", title: "جودة احترافية",      desc: "بسعر أقل بكثير من المنتجات المماثلة" },
    ],
    reviews: (n) => [
      { name: "أسماء بناني",   city: "الدار البيضاء", stars: 5, text: `جربت ${n} بعد توصية صديقة. من الأسبوع الأول بشرتي أصبحت أكثر إشراقاً. منتج رائع!` },
      { name: "رجاء الكوهن",   city: "مراكش",          stars: 5, text: `بشرتي حساسة وخيفت. استعملت ${n} وما ظهرت أي مشكلة. العكس — إشراق طبيعي جميل.` },
      { name: "نادية الطيبي",  city: "فاس",             stars: 5, text: `المنتج يستحق كل درهم. نتائج حقيقية وليست مبالغة. أنصح به بشدة.` },
    ],
    faq: [
      { q: "هل يناسب البشرة الحساسة؟",          a: "نعم، مكونات طبيعية آمنة حتى للبشرة الحساسة." },
      { q: "كيف أستخدمه يومياً؟",               a: "صباحاً ومساءً على بشرة نظيفة." },
      { q: "متى تظهر النتائج؟",                 a: "فرق واضح خلال 7 أيام من الاستخدام المنتظم." },
      { q: "هل يسبب حساسية؟",                   a: "مختبر طبياً ولا يسبب حساسية." },
      { q: "هل التوصيل سري؟",                   a: "نعم، في علبة أنيقة بدون كتابة." },
    ],
  },

  home_kitchen: {
    headline:      (n) => `${n} — الطبخ أصبح أسرع وأسهل وألذ`,
    subheadline:   () => `وفّري وقتك وقدّمي وجبات احترافية لعائلتك`,
    offer_text:    `توصيل مجاني + ضمان سنة`,
    cta:           `اطلبيه الآن`,
    badge:         `للمطبخ الذكي الحديث`,
    stock_text:    `عرض محدود`,
    before_title:  `قبل: التحضير اليدوي يستغرق ساعات`,
    after_title:   (n) => `بعد: ${n} ينجز في دقائق ما يأخذ ساعات`,
    before_points: [`التقطيع والعجن والطحن يأخذ وقتاً طويلاً`, `الإرهاق في المطبخ يفقد متعة الطبخ`, `النتائج اليدوية غير منتظمة أحياناً`],
    after_points: (n) => [`${n} يسرع التحضير 10 أضعاف`, `نتائج احترافية ومنتظمة كل مرة`, `وقت أكثر للعائلة وأقل إرهاق`],
    benefits: [
      { icon: "⚡", title: "سريع 10x",             desc: "ينهي في دقيقة ما يأخذ 10 دقائق يدوياً" },
      { icon: "👨‍🍳", title: "نتائج احترافية",    desc: "كما في المطاعم والحلويات المتخصصة" },
      { icon: "🔧", title: "سهل التنظيف",          desc: "قابل للفك وغسله في الغسالة" },
      { icon: "🔇", title: "صامت نسبياً",          desc: "صوت منخفض لا يزعج العائلة" },
      { icon: "🍳", title: "متعدد الوظائف",        desc: "يقوم بعدة مهام بجهاز واحد" },
      { icon: "💪", title: "طاقة قوية",            desc: "يتعامل مع أصعب المكونات بسهولة" },
    ],
    reviews: (n) => [
      { name: "فاطمة الزيان",  city: "مراكش",          stars: 5, text: `${n} غيّر حياتي في المطبخ. العجين والتقطيع والخلط كلهم في دقائق. لا أتخيل الطبخ بدونه!` },
      { name: "زهرة بنعلي",   city: "الدار البيضاء", stars: 5, text: `مع ${n} أصبح الطبخ متعة وليس عبئاً. التوصيل جاء سريعاً والمنتج فاق توقعاتي.` },
      { name: "حفيظة المرابط", city: "أكادير",         stars: 5, text: `للأمهات المشغولات. ${n} وفّر علي ساعة كل يوم. استثمار يستحق.` },
    ],
    faq: [
      { q: "ما هي قوة المحرك؟",                a: "قوة كافية للمهام اليومية — التفاصيل في الوصف." },
      { q: "هل يمكن غسله في الغسالة؟",        a: "الأجزاء القابلة للفك نعم، الجسم الرئيسي يمسح." },
      { q: "ما هي الوظائف المتاحة؟",           a: "حسب الموديل — مذكورة في الوصف الكامل." },
      { q: "هل يأتي بضمان؟",                  a: "نعم ضمان سنة كاملة." },
      { q: "فين يوصل التوصيل؟",               a: "لجميع مدن المغرب خلال 2-4 أيام." },
    ],
  },

  home_decor: {
    headline:      (n) => `${n} — أضف لمسة أناقة لبيتك اليوم`,
    subheadline:   () => `ديكور عصري راقي بسعر لا يصدق — الدفع عند الاستلام`,
    offer_text:    `توصيل مجاني + تغليف هدية مجاناً`,
    cta:           `اطلب الآن`,
    badge:         `لبيت أكثر أناقة وجمالاً`,
    stock_text:    `قطع محدودة`,
    before_title:  `قبل: بيت يفتقر للجمالية والتميز`,
    after_title:   (n) => `بعد: ${n} يضيف روحاً جديدة لمنزلك`,
    before_points: [`المنزل العادي يفتقر للأناقة والتميز`, `الديكورات الجيدة غالية وصعبة الإيجاد`, `الزوار لا يلاحظون جمال المنزل`],
    after_points: (n) => [`${n} يحوّل أي ركن لتحفة فنية`, `إعجاب الزوار مضمون من أول نظرة`, `جمال يدوم سنوات بلا عناية`],
    benefits: [
      { icon: "✨", title: "جمال فوري",         desc: "يحوّل المكان من لحظته" },
      { icon: "🎨", title: "تصميم عصري",        desc: "يناسب جميع أنماط الديكور" },
      { icon: "💎", title: "جودة راقية",        desc: "مواد متينة تدوم سنوات" },
      { icon: "🎁", title: "هدية مثالية",       desc: "هدية أنيقة لأي مناسبة" },
      { icon: "🏠", title: "سهل التركيب",       desc: "لا يحتاج خبرة أو أدوات خاصة" },
      { icon: "💰", title: "قيمة ممتازة",       desc: "أناقة بسعر معقول جداً" },
    ],
    reviews: (n) => [
      { name: "نسرين البرهامي",  city: "الرباط",          stars: 5, text: `اشتريت ${n} هدية لصديقتي وأعجبتها جداً. جودة ممتازة والتغليف أنيق. شكراً!` },
      { name: "ليلى الطيبي",    city: "طنجة",             stars: 5, text: `${n} أضاف جمالاً حقيقياً للصالون. كل من يزورنا يسأل عنه. منتج ممتاز.` },
      { name: "سهيلة الرامي",   city: "مراكش",             stars: 5, text: `بثمن معقول حصلت على منتج راقي. التوصيل سريع والتغليف جيد جداً.` },
    ],
    faq: [
      { q: "هل يأتي جاهزاً أم يحتاج تركيباً؟",  a: "يأتي شبه جاهز، التركيب بسيط جداً." },
      { q: "ما هي المقاسات الدقيقة؟",            a: "مذكورة في صفحة المنتج بالتفصيل." },
      { q: "هل يمكن إرجاعه إذا لم يعجبني؟",    a: "نعم إرجاع مجاني خلال 7 أيام." },
      { q: "هل يناسب الهدايا؟",                 a: "نعم، نقدم تغليف هدية مجانياً." },
      { q: "فين يوصل التوصيل؟",                 a: "لجميع مدن المغرب خلال 2-4 أيام." },
    ],
  },

  power_tool: {
    headline:      (n) => `${n} — قوة احترافية في يديك`,
    subheadline:   () => `أنجز أي عمل بسرعة ودقة — بدون تعب ولا حاجة لخبير`,
    offer_text:    `عرض الحرفي — توصيل مجاني`,
    cta:           `احصل عليه الآن`,
    badge:         `للمحترفين والهواة`,
    stock_text:    `كمية محدودة`,
    before_title:  `قبل: الأعمال اليدوية تأخذ وقتاً وجهداً كبيرين`,
    after_title:   (n) => `بعد: ${n} ينجز في دقائق بدقة احترافية`,
    before_points: [`الأعمال اليدوية تأخذ ساعات وتسبب الإرهاق`, `الاستعانة بحرفيين مكلفة وتأخذ وقتاً`, `الأدوات الرخيصة تتعطل بسرعة`],
    after_points: (n) => [`${n} ينجز أي عمل في دقائق`, `دقة احترافية بدون خبرة مسبقة`, `متين وصامد — استثمار يدوم سنوات`],
    benefits: [
      { icon: "⚡", title: "قوة فائقة",          desc: "يتعامل مع أصعب المواد بسهولة" },
      { icon: "🎯", title: "دقة احترافية",        desc: "نتائج مثالية في كل مرة" },
      { icon: "💪", title: "متين وصامد",          desc: "مصنوع من مواد تتحمل الاستخدام المكثف" },
      { icon: "🔧", title: "سهل الاستخدام",       desc: "لا يحتاج خبرة أو تدريب مسبق" },
      { icon: "🔋", title: "بطارية لاسلكية",      desc: "حرية الحركة بدون كابلات تعيقك" },
      { icon: "🛡️", title: "ضمان طويل",          desc: "ضمان سنة + دعم فني متاح" },
    ],
    reviews: (n) => [
      { name: "عبد الرحمان الكوهن", city: "الدار البيضاء", stars: 5, text: `اشتريت ${n} للأعمال المنزلية وفاق كل توقعاتي. قوي ودقيق ومريح في اليد.` },
      { name: "مصطفى الجراري",     city: "فاس",             stars: 5, text: `للحرفيين والهواة على حد سواء. ${n} من أحسن ما اشتريت. الجودة تستحق.` },
      { name: "رشيد الطيبي",       city: "طنجة",            stars: 5, text: `التوصيل في اليوم الثالث والمنتج ممتاز. الدفع عند الاستلام راحني كثيراً.` },
    ],
    faq: [
      { q: "كم تدوم البطارية بشحن واحد؟",   a: "تدوم 2-4 ساعات حسب شدة العمل." },
      { q: "هل يأتي بملحقات؟",              a: "نعم، يأتي بطقم كامل من الملحقات." },
      { q: "هل يناسب العمل الاحترافي؟",    a: "نعم، مناسب للهواة والمحترفين." },
      { q: "كيف أصون الجهاز؟",             a: "ينظف بعد كل استخدام والتعليمات مرفقة." },
      { q: "ما مدة الضمان؟",               a: "ضمان سنة كاملة مع دعم فني." },
    ],
  },

  general_gadget: {
    headline:      (n) => `${n} — الأداة الذكية التي كنت تبحث عنها`,
    subheadline:   () => `تقنية عصرية تحل مشكلتك فوراً — الدفع عند الاستلام`,
    offer_text:    `عرض محدود — توصيل مجاني`,
    cta:           `اطلب الآن`,
    badge:         `تقنية ذكية للحياة اليومية`,
    stock_text:    `كمية محدودة`,
    before_title:  `قبل: المشكلة بدون حل فعلي`,
    after_title:   (n) => `بعد: ${n} يحل المشكلة نهائياً`,
    before_points: [`الحلول التقليدية بطيئة وغير فعالة`, `المنتجات الرخيصة تعطل بسرعة`, `وقت وجهد ضائع بدون نتيجة`],
    after_points: (n) => [`${n} يعطي نتيجة من أول استخدام`, `جودة تدوم — استثمار حقيقي`, `سهل وسريع — يوفر وقتك`],
    benefits: [
      { icon: "⚡", title: "فعال وسريع",        desc: "نتائج فورية من أول استخدام" },
      { icon: "💪", title: "متين ومضمون",       desc: "جودة عالية تدوم سنوات" },
      { icon: "📦", title: "جاهز للاستخدام",    desc: "يفتحه وتشتغل فيه مباشرة" },
      { icon: "🛡️", title: "ضمان سنة",         desc: "دعم فني ما بعد البيع مضمون" },
      { icon: "💰", title: "سعر مناسب",         desc: "قيمة حقيقية مقارنة بالسوق" },
      { icon: "🚀", title: "توصيل سريع",        desc: "يصلك في 2-4 أيام لأي مدينة" },
    ],
    reviews: (n) => [
      { name: "عثمان الجبلي",   city: "الدار البيضاء", stars: 5, text: `اشتريت ${n} وأنا راضٍ جداً. الجودة ممتازة والسعر معقول. التوصيل جاء في وقته.` },
      { name: "مليكة الحسيني", city: "الرباط",          stars: 5, text: `كنت مترددة في الشراء عبر النت. الدفع عند الاستلام راحني. ${n} يستحق.` },
      { name: "يونس التازي",   city: "فاس",              stars: 5, text: `منتج يستحق كل درهم. أنصح به لكل من يبحث عن جودة بسعر معقول.` },
    ],
    faq: [
      { q: "كيفاش نستخدمو؟",              a: "التعليمات موجودة بالعربية في الصندوق." },
      { q: "واش فيه ضمان؟",              a: "نعم، ضمان سنة كاملة مع دعم فني." },
      { q: "فين يوصل التوصيل؟",          a: "لجميع مدن المغرب خلال 2-4 أيام." },
      { q: "واش ممكن نرجعو؟",            a: "نعم، إرجاع مجاني خلال 7 أيام." },
      { q: "كيفاش نتواصل معكم؟",         a: "عبر الهاتف أو واتساب — فريقنا متاح." },
    ],
  },

  general_problem: {
    headline:      (n) => `${n} — حلّ المشكلة نهائياً من أول استخدام`,
    subheadline:   () => `حل فعال وآمن — الدفع عند الاستلام`,
    offer_text:    `عرض محدود — اطلب اليوم`,
    cta:           `احصل على الحل الآن`,
    badge:         `حل نهائي مضمون`,
    stock_text:    `عرض محدود`,
    before_title:  `قبل: المشكلة تأثر على حياتك كل يوم`,
    after_title:   (n) => `بعد: ${n} — راحة حقيقية ودائمة`,
    before_points: [`المشكلة تكررت رغم كل المحاولات`, `الحلول الأخرى مؤقتة وغير فعالة`, `الوقت والمال يضيعان بدون حل حقيقي`],
    after_points: (n) => [`${n} يحل المشكلة من جذورها`, `مفعول دائم مع الاستخدام الصحيح`, `آمن ومجرب على آلاف العملاء`],
    benefits: [
      { icon: "✅", title: "فعال 100%",          desc: "نتائج مضمونة من أول استخدام" },
      { icon: "🌿", title: "آمن وطبيعي",         desc: "مكونات معتمدة آمنة للعائلة" },
      { icon: "💰", title: "اقتصادي",             desc: "يوفر عليك تكاليف الحلول الأخرى" },
      { icon: "⚡", title: "سريع وفوري",          desc: "نتيجة تظهر من أول استخدام" },
      { icon: "🔄", title: "مفعول دائم",          desc: "حل نهائي وليس مؤقتاً" },
      { icon: "🛡️", title: "ضمان الرضا",         desc: "راضٍ أو نرجع لك ثمنك" },
    ],
    reviews: (n) => [
      { name: "حسناء المزيان",  city: "الدار البيضاء", stars: 5, text: `جربت كل شيء قبل ${n}. هذا هو الحل الوحيد الذي نجح معي. ممتاز!` },
      { name: "بدر الدين الحاج", city: "مراكش",         stars: 5, text: `نتائج واضحة من أول يوم. ${n} يستحق كل درهم والتوصيل سريع.` },
      { name: "زكرياء العلوي",  city: "الرباط",          stars: 5, text: `الدفع عند الاستلام راحة كبيرة. المنتج فعال جداً. أنصح به لكل من يعاني.` },
    ],
    faq: [
      { q: "متى تظهر النتائج؟",             a: "من أول استخدام، والنتيجة الكاملة خلال أيام." },
      { q: "هل هو آمن للاستخدام اليومي؟",  a: "نعم، آمن تماماً مع الاستخدام الصحيح." },
      { q: "هل له ضمان؟",                  a: "نعم، ضمان سنة + ضمان الرضا." },
      { q: "فين يوصل التوصيل؟",            a: "لجميع مدن المغرب خلال 2-4 أيام." },
      { q: "واش ممكن ترجعو؟",              a: "نعم، إرجاع مجاني إذا ما رضيتش." },
    ],
  },

  general_home: {
    headline:      (n) => `${n} — أضف قيمة حقيقية لحياتك اليومية`,
    subheadline:   () => `عملي وأنيق وبسعر معقول — الدفع عند الاستلام`,
    offer_text:    `توصيل مجاني لجميع المدن`,
    cta:           `اطلب الآن`,
    badge:         `للبيت العصري والعملي`,
    stock_text:    `عرض محدود`,
    before_title:  `قبل: الحياة اليومية تحتاج حلولاً أذكى`,
    after_title:   (n) => `بعد: ${n} يجعل يومك أسهل وأجمل`,
    before_points: [`الحلول التقليدية ما تعطيش النتيجة المطلوبة`, `الوقت يضيع في أشياء ممكن تكون أسهل`, `البيت يستحق أفضل مما يجده الآن`],
    after_points: (n) => [`${n} يوفر وقتك وجهدك كل يوم`, `نتيجة واضحة من أول استخدام`, `منزل أكثر راحة وعملية`],
    benefits: [
      { icon: "🏠", title: "مناسب للبيت",       desc: "صمم خصيصاً للاستخدام المنزلي اليومي" },
      { icon: "⚡", title: "سريع وعملي",         desc: "يوفر وقتك وجهدك بشكل ملحوظ" },
      { icon: "💎", title: "جودة ممتازة",        desc: "مواد متينة تدوم سنوات طويلة" },
      { icon: "🔧", title: "سهل الاستخدام",      desc: "لا تعقيد ولا حاجة لخبرة" },
      { icon: "💰", title: "سعر معقول",          desc: "قيمة حقيقية بسعر مناسب للجميع" },
      { icon: "🛡️", title: "ضمان سنة",          desc: "خدمة ما بعد البيع مضمونة" },
    ],
    reviews: (n) => [
      { name: "أحمد الشرقاوي",  city: "مراكش",          stars: 5, text: `${n} من أحسن ما اشتريت للبيت. سهل الاستخدام والجودة ممتازة. شكراً للتوصيل السريع.` },
      { name: "نعيمة الغزالي",  city: "الدار البيضاء", stars: 5, text: `كنت خايفة من الشراء عبر النت. جربت وما ندمت. الدفع عند الاستلام راحني كثيراً.` },
      { name: "عزيز الكتاني",   city: "الرباط",          stars: 5, text: `منتج يستحق كل درهم. أنصح به لكل أسرة مهتمة بجودة حياتها.` },
    ],
    faq: [
      { q: "هل التركيب سهل؟",                  a: "نعم، جاهز للاستخدام أو تركيب سهل خلال دقائق." },
      { q: "هل يأتي بضمان؟",                  a: "نعم، ضمان سنة كاملة." },
      { q: "كيف أتواصل معكم بعد الشراء؟",     a: "عبر الهاتف أو واتساب — دعم فني متاح دائماً." },
      { q: "فين يوصل التوصيل؟",               a: "لجميع مدن المغرب خلال 2-4 أيام." },
      { q: "واش ممكن نرجعو؟",                 a: "نعم، إرجاع مجاني خلال 7 أيام." },
    ],
  },
};
