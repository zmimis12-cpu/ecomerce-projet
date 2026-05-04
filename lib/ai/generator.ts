/**
 * lib/ai/generator.ts — Server-side only.
 * Generates UNIQUE storytelling content per product using the Research Engine.
 */
import type { TemplateKey, LPSection } from "@/lib/templates";
import { analyzeProduct } from "./analyzer";
import type { ProductAnalysis } from "./analyzer";

export interface ProductContext {
  id: string; name: string; description: string | null;
  sale_price_mad: number; sku: string;
}

export interface GeneratedContent {
  title:            string;
  subtitle:         string;
  hero_headline:    string;
  hero_subheadline: string;
  offer_text:       string;
  price_text:       string;
  old_price_text:   string;
  stock_text:       string;
  cta_text:         string;
  whatsapp_number:  string;
  template_key:     TemplateKey;
  ai_generated:     boolean;
  sections:         LPSection[];
  bundle_1_price:   number;
  bundle_2_price:   number;
  bundle_3_price:   number;
  ai_analysis:      ProductAnalysis;
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
  return generateFromResearch(product, templateKey, analysis);
}

// ─── Research-based generator — unique storytelling per product ───────────────
function generateFromResearch(
  product: ProductContext,
  templateKey: TemplateKey,
  a: ProductAnalysis
): GeneratedContent {
  const { name, sale_price_mad: price } = product;
  const fp   = a.fingerprint;
  const copy = COPY[fp];

  const b1 = price;
  const b2 = parseFloat((price * 2 * 0.9).toFixed(2));
  const b3 = parseFloat((price * 3 * 0.8).toFixed(2));

  const sections = buildSections(name, templateKey, a, copy);

  return {
    title:            `${name} — ${copy.badge}`,
    subtitle:         a.main_benefit,
    hero_headline:    copy.headline(name),
    hero_subheadline: copy.subheadline,
    offer_text:       copy.offer,
    price_text:       `${price.toFixed(0)} درهم`,
    old_price_text:   `${(price * 1.3).toFixed(0)} درهم`,
    stock_text:       copy.stock,
    cta_text:         copy.cta,
    whatsapp_number:  "",
    template_key:     templateKey,
    ai_generated:     false,
    sections,
    bundle_1_price:   b1,
    bundle_2_price:   b2,
    bundle_3_price:   b3,
    ai_analysis:      a,
  };
}

// ─── Section builder — story flow ─────────────────────────────────────────────
function buildSections(
  name: string, templateKey: TemplateKey,
  a: ProductAnalysis,
  copy: CopySet
): LPSection[] {
  const c = copy;

  const allSections: Record<string, LPSection> = {
    hero: {
      type: "hero", enabled: true,
      headline:    c.headline(name),
      subheadline: c.subheadline,
      story_hook:  a.story_hook,
      trust_bullets: ["الدفع عند الاستلام", "توصيل 2-4 أيام", "ضمان الجودة", "دعم هاتفي"],
    },
    problem: {
      type: "problem_solution", enabled: true,
      section_style: "problem_only",
      title:         c.problem_title,
      points:        c.problem_points,
      before_title:  c.problem_title,
      after_title:   c.solution_title(name),
      before_points: c.problem_points,
      after_points:  c.solution_points(name),
    },
    solution: {
      type: "problem_solution", enabled: false, // merged with problem
      title:  c.solution_title(name),
      points: c.solution_points(name),
    },
    lifestyle: {
      type: "lifestyle", enabled: true,
      title:     c.lifestyle_title,
      scenarios: c.scenarios,
    },
    benefits: {
      type: "benefits", enabled: true,
      items: c.benefits,
    },
    gallery: { type: "gallery", enabled: true },
    reviews: {
      type: "reviews", enabled: true,
      rating: 4.8, count: 200,
      items: c.reviews(name),
    },
    faq: {
      type: "faq", enabled: true,
      items: c.faq,
    },
    order_form: {
      type: "order_form", enabled: true,
      headline: `اطلب الآن — الدفع عند الاستلام`,
      sub: `${a.target_audience} — فريقنا يتصل بك للتأكيد`,
      reassurance: "معلوماتك آمنة · الدفع عند الاستلام فقط · لا دفع مسبق",
    },
  };

  const orders: Record<TemplateKey, string[]> = {
    gadget_viral:         ["hero","problem","lifestyle","benefits","gallery","reviews","faq","order_form"],
    problem_solution_cod: ["hero","problem","benefits","gallery","reviews","faq","order_form"],
    beauty_health:        ["hero","problem","benefits","lifestyle","reviews","faq","order_form"],
    home_family:          ["hero","benefits","lifestyle","gallery","reviews","order_form"],
  };

  return (orders[templateKey] ?? orders.gadget_viral)
    .map((k) => allSections[k])
    .filter(Boolean);
}

// ─── Claude API (when OPENAI_API_KEY is set) ──────────────────────────────────
async function generateWithClaudeAPI(
  product: ProductContext, templateKey: TemplateKey, a: ProductAnalysis
): Promise<GeneratedContent> {
  const base = generateFromResearch(product, templateKey, a);
  try {
    const prompt = `You are a top Moroccan COD e-commerce copywriter specializing in Darija Arabic.

Product: "${product.name}"
Description: "${product.description ?? "N/A"}"  
Price: ${product.sale_price_mad} MAD
Product type: ${a.product_type}
Main problem: ${a.main_problem}
Main benefit: ${a.main_benefit}
Emotional angle: ${a.emotional_angle}
Story hook: ${a.story_hook}
Target audience: ${a.target_audience}

Generate ONLY valid JSON with these 4 fields:
{
  "hero_headline": "max 2 lines, emotional, specific to this product, uses Darija",
  "hero_subheadline": "1 line, confirms main benefit, mentions COD",
  "offer_text": "urgency promo bar text, max 8 words",
  "cta_text": "button text, max 5 words, action-oriented"
}

CRITICAL RULES:
- Write in Moroccan Darija (not MSA)
- Be SPECIFIC to this exact product (not generic)
- Emotional storytelling, not technical specs
- For projector: mention cinema/screen/family/films
- For metal detector: mention gold/search/discovery/adventure  
- For anti-insect: mention mosquito/sleep/children/comfort
- No more than 2 emojis total across all fields`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.OPENAI_API_KEY! },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (res.ok) {
      const data = await res.json() as { content: { type: string; text: string }[] };
      const text = data.content.find((b) => b.type === "text")?.text ?? "";
      const m    = text.match(/\{[\s\S]*\}/);
      if (m) {
        const p = JSON.parse(m[0]) as Partial<GeneratedContent>;
        return {
          ...base,
          hero_headline:    p.hero_headline    ?? base.hero_headline,
          hero_subheadline: p.hero_subheadline ?? base.hero_subheadline,
          offer_text:       p.offer_text       ?? base.offer_text,
          cta_text:         p.cta_text         ?? base.cta_text,
          ai_generated: true,
        };
      }
    }
  } catch (e) { console.error("[ai] API failed:", e); }
  return base;
}

// ─── Copy sets per fingerprint ────────────────────────────────────────────────
type CopySet = {
  badge: string;
  headline:       (name: string) => string;
  subheadline:    string;
  offer:          string;
  cta:            string;
  stock:          string;
  problem_title:  string;
  problem_points: string[];
  solution_title: (name: string) => string;
  solution_points:(name: string) => string[];
  lifestyle_title: string;
  scenarios:      { icon: string; title: string; desc: string }[];
  benefits:       { icon: string; title: string; desc: string }[];
  reviews:        (name: string) => { name: string; city: string; stars: number; text: string }[];
  faq:            { q: string; a: string }[];
};

import type { ProductFingerprint } from "./analyzer";

const COPY: Record<ProductFingerprint, CopySet> = {

  projector: {
    badge:      "سينما في بيتك",
    headline:   (n) => `حوّل دارك لسينما حقيقية مع ${n}`,
    subheadline:"شاشة عملاقة · أفلام · مباريات · ألعاب — الدفع عند الاستلام",
    offer:      "توصيل مجاني اليوم",
    cta:        "اطلب الآن",
    stock:      "الكمية محدودة",
    problem_title:  "واش كتعيش هاد المشكل؟",
    problem_points: [
      "شاشة الهاتف صغيرة وتتعب عينيك",
      "التلفاز العادي ما يعطيش إحساس السينما",
      "الخروج للسينما مكلف ومتعب كل مرة",
      "ليالي الويكاند ممل بدون ترفيه حقيقي",
    ],
    solution_title: (n) => `${n} — الحل وصل`,
    solution_points: (n) => [
      `${n} يعطيك شاشة تصل لـ 200 بوصة في بيتك`,
      "Netflix وYouTube وكل تطبيقاتك المفضلة",
      "صوت واضح وقوي يكمل تجربة السينما",
      "تجربة عائلية ما تتعوضش كل ليلة",
    ],
    lifestyle_title: "كيفاش يغير حياتك؟",
    scenarios: [
      { icon: "🎬", title: "ليلة سينما عائلية",     desc: "كل الجو يتجمعو — فيلم على شاشة عملاقة بدون خروج" },
      { icon: "⚽", title: "مباريات بدون فوتاج",    desc: "شوف المباراة على شاشة 150 بوصة مع رفاقك" },
      { icon: "🎮", title: "تجربة ألعاب لا تُنسى",  desc: "العب على شاشة كبيرة — إحساس مختلف تماماً" },
      { icon: "🍿", title: "حفلات وسهرات مميزة",    desc: "كل سهرة تبقى في الذاكرة" },
    ],
    benefits: [
      { icon: "📽️", title: "صورة HD واضحة",        desc: "تقنية حديثة لألوان حية وصورة نقية" },
      { icon: "🔊", title: "صوت قوي مدمج",          desc: "تجربة صوت كاملة بدون إضافات" },
      { icon: "📱", title: "WiFi + HDMI",            desc: "وصّلو بأي جهاز في ثانية" },
      { icon: "🔧", title: "تركيب في 5 دقائق",      desc: "أخرجو من الصندوق وشغّلو مباشرة" },
    ],
    reviews: (n) => [
      { name: "يوسف المرابط",  city: "الدار البيضاء", stars: 5, text: `${n} غيّر ليالينا كاملاً. كل جمعة سينما في البيت مع العائلة. الصورة واضحة والأطفال فرحانين بزاف 🎬` },
      { name: "سمية الراضي",   city: "الرباط",         stars: 5, text: `كنت متردد نشري منو. جربته وما ندمت. شاشة 120 بوصة في صالوني! الدفع عند الاستلام راحني كثير.` },
      { name: "محمد الفاسي",   city: "فاس",            stars: 5, text: `شوف المباريات مع رفاقي على شاشة عملاقة. إحساس ما تشريه بالفلوس. المنتج ممتاز 100%.` },
    ],
    faq: [
      { q: "واش يشتغل في الضوء؟",            a: "يشتغل أحسن في الضوء الخافت أو الظلام. في النهار ممكن تسدّ الستارة." },
      { q: "شحال الشاشة اللي يقدر يعطيها؟",  a: "من 30 حتى 200 بوصة — حسب المسافة من الحيط." },
      { q: "واش يشتغل مع Netflix؟",           a: "نعم — WiFi مدمج أو HDMI من هاتفك أو اللاب توب." },
      { q: "واش فيه ضمان؟",                  a: "ضمان سنة كاملة مع دعم فني متاح." },
      { q: "فين يوصل التوصيل؟",              a: "لجميع مدن المغرب خلال 2-4 أيام." },
    ],
  },

  metal_detector: {
    badge:      "للمغامرين وعشاق الاكتشاف",
    headline:   (n) => `${n} — اكشف الذهب والكنوز المدفونة`,
    subheadline:"دقة عالية حتى متر تحت الأرض — الدفع عند الاستلام",
    offer:      "عرض المغامر — توصيل مجاني",
    cta:        "ابدأ مغامرتك",
    stock:      "كمية محدودة للمغامرين",
    problem_title:  "واش كتعيش هاد المشكل؟",
    problem_points: [
      "البحث العشوائي في التربة ما يعطيش نتيجة",
      "الأجهزة الرخيصة ما تحسش بالمعادن العميقة",
      "تضيع ساعات بدون أي اكتشاف حقيقي",
      "ما تعرفش وين بالضبط تبحث",
    ],
    solution_title: (n) => `${n} يوجهك مباشرة للهدف`,
    solution_points: (n) => [
      `${n} يحس بالمعادن حتى متر تحت الأرض`,
      "يميز بين الذهب والفضة والنحاس والحديد",
      "صوت وإشارة فورية عند الاكتشاف",
      "شاشة رقمية تحدد نوع وعمق المعدن",
    ],
    lifestyle_title: "وين تقدر تستعملو؟",
    scenarios: [
      { icon: "🌾", title: "الحقول والأراضي",    desc: "اكتشف ما خفي في التربة منذ آلاف السنين" },
      { icon: "🏖️", title: "الشواطئ والأودية",  desc: "مقاوم للماء — يشتغل في الرمل والشطآن" },
      { icon: "🏔️", title: "المناطق الجبلية",   desc: "معادن قيمة تنتظرك في الأماكن البعيدة" },
      { icon: "🏛️", title: "مناطق أثرية",      desc: "قطع تاريخية نادرة في انتظار من يكتشفها" },
    ],
    benefits: [
      { icon: "🔍", title: "كشف حتى متر عمق",  desc: "يصل لما لا تراه العين" },
      { icon: "🎯", title: "تمييز المعادن",     desc: "يفرق بين الذهب والحديد والفضة" },
      { icon: "🌊", title: "مقاوم للماء",       desc: "يشتغل في الشواطئ والأماكن الرطبة" },
      { icon: "🔋", title: "بطارية 10 ساعات",  desc: "يوم كامل من البحث بدون انقطاع" },
    ],
    reviews: (n) => [
      { name: "محمد الأمازيغي", city: "ورززات",   stars: 5, text: `أول استعمال للـ ${n} وجدت قطعة نحاس قديمة. الجهاز حساس جداً ودقيق. إحساس المغامرة حقيقي!` },
      { name: "حسن الجبلي",    city: "الحسيمة",   stars: 5, text: `جربت أجهزة كثيرة من قبل. ${n} هو الأفضل في هاد الثمن بدون مزايدة. يحس بالمعادن الصغيرة بسهولة.` },
      { name: "عبدالله",        city: "العيون",    stars: 5, text: `للمغامرين الحقيقيين. متين يشتغل في أي نوع تربة. الدفع عند الاستلام راحني. أنصح به.` },
    ],
    faq: [
      { q: "كيفاش يميز بين المعادن؟",           a: "يعطي صوت مختلف لكل نوع معدن — الذهب، الفضة، النحاس، الحديد." },
      { q: "واش يشتغل في الشاطئ؟",             a: "نعم، الملف الكاشف مقاوم للماء ومناسب للشواطئ والأماكن الرطبة." },
      { q: "شحال عمق الكشف بالضبط؟",           a: "من 20 سم حتى متر كامل حسب نوع المعدن وحجمه ونوع التربة." },
      { q: "هل يحتاج خبرة للاستخدام؟",          a: "لا إطلاقاً — التعليمات بالعربية في الصندوق ويشتغل من أول استخدام." },
      { q: "ما مدة الضمان؟",                   a: "ضمان سنة كاملة مع دعم فني متاح في أي وقت." },
    ],
  },

  anti_insect: {
    badge:      "نوم هادئ بدون حشرات",
    headline:   (n) => `${n} — وداعاً للناموس إلى الأبد`,
    subheadline:"حماية آمنة للعائلة بدون مواد كيميائية — الدفع عند الاستلام",
    offer:      "توصيل مجاني + حماية فورية",
    cta:        "احمِ عائلتك الآن",
    stock:      "عرض محدود",
    problem_title:  "واش كتعيش هاد المشكل؟",
    problem_points: [
      "الناموسة الوحيدة تمنعك من النوم طول الليل",
      "المبيدات الكيميائية خطيرة على الأطفال والرضع",
      "الصيف كابوس بسبب الحشرات والناموس",
      "المراهم والبخاخات مؤقتة وما تنفعش",
    ],
    solution_title: (n) => `${n} — نومك راحتك حقك`,
    solution_points: (n) => [
      `${n} يطرد الحشرات بدون رائحة ولا دخان`,
      "آمن 100% للأطفال والرضع والحيوانات الأليفة",
      "يشتغل صامت طول الليل بدون ما توقفو",
      "يغطي الغرفة كاملة — ناموسة ما تدخلش",
    ],
    lifestyle_title: "تخيل هاد الليلة...",
    scenarios: [
      { icon: "😴", title: "نوم عميق كل ليلة",    desc: "أطفالك نايمين بسلام بدون قلق" },
      { icon: "🏠", title: "بيت نظيف وآمن",         desc: "الصالون والمطبخ وكل غرفة محمية" },
      { icon: "☀️", title: "صيف مريح بلا هموم",    desc: "استمتع بالصيف بدون ناموس ولا حشرات" },
      { icon: "👶", title: "أطفالك في أمان",       desc: "ما تقلقش على صحتهم — الحماية مضمونة" },
    ],
    benefits: [
      { icon: "😴", title: "نوم هادئ مضمون",     desc: "لا ناموس لا ضجيج لا قلق — نوم عميق" },
      { icon: "🌿", title: "بدون كيماويات",        desc: "آمن 100% للأطفال والرضع" },
      { icon: "🔇", title: "صامت تماماً",          desc: "يشتغل بدون أي صوت يزعج نومك" },
      { icon: "💡", title: "سهل وتلقائي",          desc: "شغّله وانسَه — يحمي من تلقاء نفسه" },
    ],
    reviews: (n) => [
      { name: "أمينة الحسيني",  city: "الدار البيضاء", stars: 5, text: `من وقت اشتريت ${n} ما شفت ناموسة في بيتي. ولادي بدؤوا ينامو بدون أي مشكل. منتج رائع يستحق كل درهم!` },
      { name: "رشيد المنصوري", city: "أكادير",          stars: 5, text: `كنت مشكّل في المبيدات الكيميائية بسبب بنتي الصغيرة. ${n} حل المشكلة — آمن وفعال ومريح.` },
      { name: "فاطمة الزهراء", city: "فاس",             stars: 5, text: `الصيف كان كابوس قبل. ${n} غيّر كل شيء من أول ليلة. شكراً كثير!` },
    ],
    faq: [
      { q: "واش آمن للرضع والأطفال الصغار؟",    a: "نعم آمن 100% — بدون أي مواد كيميائية أو رائحة." },
      { q: "كم مساحة يغطي؟",                    a: "يغطي غرفة عادية حتى 40 متر مربع بشكل فعال." },
      { q: "هل يشتغل طول الليل؟",               a: "نعم، يشتغل بدون انقطاع — ما كاين مشكلة في الحرارة." },
      { q: "هل له رائحة؟",                      a: "لا — بدون أي رائحة أو دخان." },
      { q: "فين يوصل التوصيل؟",                 a: "لجميع مدن المغرب خلال 2-4 أيام." },
    ],
  },

  air_purifier: {
    badge: "هواء نقي لعائلتك",
    headline: (n) => `${n} — تنفّس بحرية في بيتك`,
    subheadline: "يزيل 99% من الغبار والروائح والجراثيم — الدفع عند الاستلام",
    offer: "توصيل مجاني + ضمان سنة",
    cta: "اطلب الآن", stock: "عرض محدود",
    problem_title: "واش كتعيش هاد المشكل؟",
    problem_points: ["الغبار والأبواغ تسبب الحساسية والعطس","روائح المطبخ والتدخين تبقى ساعات","أطفالك يعانون من تهيج الجهاز التنفسي","هواء البيت ملوث أكثر من الخارج"],
    solution_title: (n) => `${n} — هواء نقي في ثوانٍ`,
    solution_points: (n) => [`${n} يصفي الهواء من 99.9% من الملوثات`,"يقضي على الروائح في دقائق","يحمي العائلة من الجراثيم والفيروسات","هواء نقي طول اليوم بدون توقف"],
    lifestyle_title: "أين تستعمله؟",
    scenarios: [
      { icon: "🛏️", title: "غرف النوم", desc: "نوم هادئ بهواء نقي كل ليلة" },
      { icon: "🧒", title: "غرفة الأطفال", desc: "حماية صحة أطفالك من أول يوم" },
      { icon: "🏢", title: "مكتب العمل", desc: "تركيز أفضل وإنتاجية أعلى" },
      { icon: "🛋️", title: "الصالون", desc: "هواء نقي لجميع أفراد الأسرة" },
    ],
    benefits: [
      { icon: "💨", title: "تصفية 99.9%", desc: "فلتر HEPA معتمد طبياً" },
      { icon: "🌸", title: "يزيل الروائح", desc: "مطبخ وسجائر وحيوانات — تختفي فوراً" },
      { icon: "🔇", title: "صامت وهادئ", desc: "لا يزعج النوم ولا العمل" },
      { icon: "⚡", title: "يشتغل تلقائياً", desc: "يحس بالتلوث ويشتغل من نفسو" },
    ],
    reviews: (n) => [
      { name: "نوال الشرقاوي", city: "الرباط", stars: 5, text: `ابني عنده حساسية من الغبار. منذ اشترينا ${n} انخفضت النوبات بشكل واضح. منتج غيّر حياتنا!` },
      { name: "توفيق المغاري", city: "مراكش", stars: 5, text: `الروائح كانت مشكلة كبيرة. ${n} حلها من أول تشغيلة. الهواء أصبح خفيف ونقي.` },
      { name: "هند بوعزة", city: "الجديدة", stars: 5, text: `منتج ممتاز للعائلات. الدفع عند الاستلام أرياح. أنصح به لكل بيت.` },
    ],
    faq: [
      { q: "كم متر مربع يغطي؟", a: "يغطي من 20 إلى 50 متر حسب الموديل." },
      { q: "متى يجب تغيير الفلتر؟", a: "كل 6 أشهر تقريباً — سهل التغيير." },
      { q: "هل آمن للأطفال؟", a: "نعم آمن 100% ولا يطلق أي مواد ضارة." },
      { q: "كم يستهلك كهرباء؟", a: "استهلاك منخفض جداً — مثل لمبة عادية." },
      { q: "هل له ضمان؟", a: "ضمان سنة كاملة." },
    ],
  },

  cleaning_device: {
    badge: "نظافة احترافية في دقائق",
    headline: (n) => `${n} — بيتك نظيف كل يوم بدون تعب`,
    subheadline: "تنظيف عميق يوفر 70% من وقتك وجهدك — الدفع عند الاستلام",
    offer: "توصيل مجاني لجميع المدن", cta: "اطلب الآن", stock: "عرض محدود",
    problem_title: "واش كتعيش هاد المشكل؟",
    problem_points: ["التنظيف اليدوي يأخذ ساعات ويسبب آلام الظهر","الأوساخ العميقة تبقى رغم كل الجهد","ما تقدريش تنظفي كل يوم من التعب","المنزل ما يبقاش نظيفاً طول اليوم"],
    solution_title: (n) => `${n} — التنظيف أصبح متعة`,
    solution_points: (n) => [`${n} ينظف عمق الأسطح في دقائق`,"يوفر 70% من وقت التنظيف","لا تعب لا آلام — يشتغل عنك","نتائج احترافية في كل مرة"],
    lifestyle_title: "أين تستعمله؟",
    scenarios: [
      { icon: "🏠", title: "الأرضيات", desc: "بلاط لامع في أقل من 20 دقيقة" },
      { icon: "🛋️", title: "السجاد والموكيت", desc: "تنظيف عميق يزيل كل الأتربة" },
      { icon: "🍳", title: "المطبخ", desc: "شحوم وبقع تختفي بسهولة" },
      { icon: "🚗", title: "السيارة", desc: "تنظيف داخلي احترافي في المنزل" },
    ],
    benefits: [
      { icon: "⚡", title: "سريع وقوي", desc: "ينهي في دقائق ما يأخذ ساعات يدوياً" },
      { icon: "💧", title: "تنظيف عميق", desc: "يصل لأعمق الأوساخ والتراكمات" },
      { icon: "🤸", title: "خفيف وسهل", desc: "لا ضغط على الظهر والركبتين" },
      { icon: "🔧", title: "سهل التنظيف", desc: "ملحقات قابلة للفك والغسيل" },
    ],
    reviews: (n) => [
      { name: "سعاد الغزالي", city: "مراكش", stars: 5, text: `${n} غيّر حياتي في البيت. في 30 دقيقة كل شيء لامع. ما توقعتش يكون بهاد الجودة!` },
      { name: "كريم الحيان", city: "الدار البيضاء", stars: 5, text: `للسجاد والأرضيات والمطبخ. ${n} يغطي كل شيء. الجودة تستحق كل درهم.` },
      { name: "ليلى بنيوب", city: "طنجة", stars: 5, text: `الدفع عند الاستلام راحني. المنتج أسهل بكثير مما توقعت. شكراً للتوصيل السريع.` },
    ],
    faq: [
      { q: "هل يشتغل على الباركيه؟", a: "نعم مناسب للبلاط والباركيه والسجاد." },
      { q: "هل يصدر صوتاً عالياً؟", a: "صوت طبيعي أقل من المكانس العادية." },
      { q: "كيف أنظفه بعد الاستخدام؟", a: "الملحقات تنفصل وتغسل بسهولة." },
      { q: "هل له ضمان؟", a: "ضمان سنة كاملة." },
      { q: "فين يوصل التوصيل؟", a: "لجميع مدن المغرب خلال 2-4 أيام." },
    ],
  },

  surveillance_camera: {
    badge: "أمن بيتك من هاتفك",
    headline: (n) => `${n} — راقب بيتك من أي مكان`,
    subheadline: "رؤية ليلية · إشعارات فورية · مراقبة 24/7 — الدفع عند الاستلام",
    offer: "عرض الأمان — توصيل مجاني", cta: "امنح بيتك الأمان", stock: "كمية محدودة",
    problem_title: "واش كتعيش هاد المشكل؟",
    problem_points: ["لا تعرف ما يحدث في بيتك عند خروجك","الكاميرات الرخيصة صورتها مظلمة ليلاً","لا إشعارات عند حركة مشبوهة","قلق دائم على البيت والعائلة"],
    solution_title: (n) => `${n} — عينك الدائمة`,
    solution_points: (n) => [`${n} يرسل إشعاراً فورياً لهاتفك`,"رؤية ليلية واضحة بأشعة تحت الحمراء","شاهد بيتك مباشرة من هاتفك في أي مكان","تسجيل مستمر في السحابة"],
    lifestyle_title: "من يحتاجها؟",
    scenarios: [
      { icon: "🏠", title: "أصحاب المنازل", desc: "راقب بيتك وأنت في العمل أو السفر" },
      { icon: "🏪", title: "أصحاب المحلات", desc: "حماية متجرك 24/7 بدون حارس" },
      { icon: "👶", title: "الآباء والأمهات", desc: "راقب أطفالك مع الخادمة بسلام" },
      { icon: "🏢", title: "المكاتب", desc: "أمن مكتبك من أي مكان" },
    ],
    benefits: [
      { icon: "📱", title: "مراقبة من هاتفك", desc: "شاهد في أي وقت من أي مكان" },
      { icon: "🌙", title: "رؤية ليلية واضحة", desc: "صورة واضحة حتى في الظلام التام" },
      { icon: "🔔", title: "إشعارات فورية", desc: "تنبيه لحظي عند أي حركة" },
      { icon: "🔧", title: "تركيب في 10 دقائق", desc: "بدون تقني وبدون تعقيد" },
    ],
    reviews: (n) => [
      { name: "محمد الكتاني", city: "الدار البيضاء", stars: 5, text: `اشتريت ${n} وتغيرت حياتي. أشوف المحل من هاتفي وأنا في البيت. جودة فاقت توقعاتي.` },
      { name: "وفاء التامني", city: "أكادير", stars: 5, text: `للأمهات — راقبي أطفالك مع الخادمة بسلام. ${n} أعطاني راحة البال الكاملة.` },
      { name: "إبراهيم الحاج", city: "الرباط", stars: 5, text: `رؤية ليلية واضحة وتركيب سهل جداً. الدفع عند الاستلام ريّحني كثيراً.` },
    ],
    faq: [
      { q: "هل تحتاج إنترنت؟", a: "نعم، WiFi للمراقبة عن بعد من هاتفك." },
      { q: "كيف أشاهد التسجيلات؟", a: "عبر تطبيق مجاني على iOS وAndroid." },
      { q: "هل تشتغل ليلاً؟", a: "نعم، رؤية ليلية بأشعة تحت الحمراء حتى 10 أمتار." },
      { q: "هل التركيب صعب؟", a: "لا — 10 دقائق والتعليمات بالعربية في الصندوق." },
      { q: "ما مدة الضمان؟", a: "ضمان سنة كاملة." },
    ],
  },

  sports_fitness: {
    badge: "جسمك المثالي في بيتك",
    headline: (n) => `${n} — النادي ولا جاء لبيتك`,
    subheadline: "تمرين احترافي في 20 دقيقة — نتائج في 30 يوماً",
    offer: "ابدأ رحلتك اليوم — توصيل مجاني", cta: "اطلب الآن", stock: "كمية محدودة",
    problem_title: "واش كتعيش هاد المشكل؟",
    problem_points: ["اشتراك النادي غالي وبعيد","ما عندكش وقت تخرج تتمرن كل يوم","الكسل يبدأ بعذر واحد ويكبر","الرياضة في البيت بدون معدات ما تنفعش"],
    solution_title: (n) => `${n} — لا عذر بعد اليوم`,
    solution_points: (n) => [`${n} متاح في بيتك 24/7 — بلا مواعيد`,"20 دقيقة يومياً تكفي لنتائج حقيقية","مناسب لجميع المستويات من مبتدئ لمحترف","وفّر اشتراك النادي كل شهر"],
    lifestyle_title: "كيفاش يتناسب مع يومك؟",
    scenarios: [
      { icon: "🌅", title: "الصباح الباكر", desc: "20 دقيقة قبل الفطور تغيّر يومك كاملاً" },
      { icon: "🌙", title: "بعد العمل", desc: "فرّغ ضغط اليوم بتمرين سريع" },
      { icon: "🏠", title: "بدون خروج", desc: "لا ترفيه لا سيارة لا تنقل — كل شيء في البيت" },
      { icon: "👨‍👩‍👧", title: "مع العائلة", desc: "الكل يتمرن معاً — مرح وصحة" },
    ],
    benefits: [
      { icon: "💪", title: "بناء عضلي فعال", desc: "استهداف جميع مجموعات العضلات" },
      { icon: "🏃", title: "حرق دهون سريع", desc: "كارديو مكثف في وقت قصير" },
      { icon: "⏱️", title: "20 دقيقة يومياً", desc: "لا وقت ضائع لا عذر ممكن" },
      { icon: "📈", title: "نتائج سريعة", desc: "تحس بالفرق من الأسبوع الأول" },
    ],
    reviews: (n) => [
      { name: "رضوان الجراري", city: "الدار البيضاء", stars: 5, text: `ما اشتركتش في النادي من 6 أشهر. ${n} غنّى عنه. نتائج ملموسة في أقل من شهر. أنصح به.` },
      { name: "سلوى الفاسي", city: "الرباط", stars: 5, text: `للأمهات اللواتي ليس لديهن وقت. ${n} يناسب جدول أي شخص. ممتاز جداً.` },
      { name: "عمر الحمودي", city: "طنجة", stars: 5, text: `جودة ممتازة وسعر معقول. الدفع عند الاستلام ريّحني. أنصح به بشدة.` },
    ],
    faq: [
      { q: "هل يناسب المبتدئين؟", a: "نعم، مناسب لجميع المستويات." },
      { q: "كيف أعرف طريقة الاستخدام؟", a: "فيديوهات شرح مجانية مع كل طلب." },
      { q: "هل يحتاج مساحة كبيرة؟", a: "لا — يمكن استخدامه في أي غرفة عادية." },
      { q: "كم وقت يستغرق التمرين؟", a: "20-30 دقيقة يومياً تكفي للنتائج." },
      { q: "ما مدة الضمان؟", a: "ضمان سنة كاملة." },
    ],
  },

  beauty_hair: {
    badge: "شعر صالون في بيتك",
    headline: (n) => `${n} — شعرك مثالي كل يوم`,
    subheadline: "ناعم لامع صحي — في 10 دقائق بدون ثمن الصالون",
    offer: "عرض الجمال — توصيل مجاني", cta: "اطلبيه الآن", stock: "كمية محدودة",
    problem_title: "واش كتعيشي هاد المشكل؟",
    problem_points: ["الصالون غالي وما دايم متاح","الشعر الجاف والمتكسر مشكلة كل يوم","ساعة في الصالون وتعبت وما خلصتيش","كل الإطلالة تبدأ من الشعر"],
    solution_title: (n) => `${n} — إطلالتك في يديك`,
    solution_points: (n) => [`${n} يعطي نتيجة صالون في 10 دقائق`,"شعر ناعم لامع يدوم أياماً","حماية الشعر من الحرارة الزائدة","لجميع أنواع الشعر — مجعد ومستقيم"],
    lifestyle_title: "متى تستعمليه؟",
    scenarios: [
      { icon: "☀️", title: "كل صباح", desc: "إطلالة مثالية في 10 دقائق قبل الخروج" },
      { icon: "💍", title: "المناسبات", desc: "احجزي موعد الصالون لشيء آخر" },
      { icon: "✈️", title: "السفر", desc: "خفيف وسهل الحمل في أي مكان" },
      { icon: "📸", title: "صور لا تُنسى", desc: "شعرك مثالي في كل لحظة" },
    ],
    benefits: [
      { icon: "✨", title: "لمعة فورية", desc: "شعر لامع من أول استخدام" },
      { icon: "💧", title: "ترطيب عميق", desc: "لا جفاف ولا تكسر" },
      { icon: "🌡️", title: "درجة حرارة مضبوطة", desc: "حماية الشعر من التلف" },
      { icon: "🎀", title: "لجميع أنواع الشعر", desc: "مجعد مستقيم ناعم وكثيف" },
    ],
    reviews: (n) => [
      { name: "مي الإدريسي", city: "الدار البيضاء", stars: 5, text: `كنت نمشي للصالون كل أسبوع. منذ اشتريت ${n} ما رجعت. نتيجة أحسن وأوفر بزاف!` },
      { name: "حنان الوزاني", city: "مراكش", stars: 5, text: `شعري ناعم من أول استخدام. ${n} أحسن منتج اشتريته هاد العام.` },
      { name: "زينب الحيان", city: "الرباط", stars: 5, text: `للبنات اللواتي يبحثن عن نتائج حقيقية. ${n} هو الجواب. أنصح به.` },
    ],
    faq: [
      { q: "هل يناسب الشعر المجعد؟", a: "نعم مناسب لجميع أنواع الشعر." },
      { q: "كيف أحمي شعري من الحرارة؟", a: "استخدمي سيروم الحماية الحرارية قبله." },
      { q: "كم مرة يمكن استخدامه أسبوعياً؟", a: "2-3 مرات للحصول على أفضل النتائج." },
      { q: "هل آمن للشعر المصبوغ؟", a: "نعم مناسب للشعر المصبوغ والمعالج." },
      { q: "ما مدة الضمان؟", a: "ضمان سنة كاملة." },
    ],
  },

  beauty_skin: {
    badge: "بشرة مشرقة طبيعية",
    headline: (n) => `${n} — بشرتك تستحق أحسن`,
    subheadline: "نتائج طبيعية واضحة في 7 أيام — مكونات معتمدة",
    offer: "عرض الإطلالة — توصيل مجاني", cta: "اطلبيه الآن", stock: "كمية محدودة",
    problem_title: "واش كتعيشي هاد المشكل؟",
    problem_points: ["البشرة الباهتة تأثر على ثقتك بنفسك","المنتجات الغالية ما تعطيش نتيجة حقيقية","الكيمياء تتلف البشرة على المدى البعيد","ما عندكش روتين عناية فعال"],
    solution_title: (n) => `${n} — جمالك الطبيعي يبدأ هنا`,
    solution_points: (n) => [`${n} يغذي البشرة من العمق بمكونات طبيعية`,"إشراق طبيعي يظهر من أول أسبوع","آمن لجميع أنواع البشرة حتى الحساسة","روتين يومي بسيط وفعال"],
    lifestyle_title: "كيف تستخدمينه؟",
    scenarios: [
      { icon: "🌅", title: "الروتين الصباحي", desc: "دقيقتان كل صباح — بشرة مشرقة طول اليوم" },
      { icon: "🌙", title: "العناية الليلية", desc: "تجديد البشرة أثناء النوم" },
      { icon: "💄", title: "قبل المكياج", desc: "أساس مثالي لمكياج يدوم أطول" },
      { icon: "☀️", title: "حماية يومية", desc: "بشرة محمية من التلوث والأشعة" },
    ],
    benefits: [
      { icon: "✨", title: "إشراق فوري", desc: "بشرة مشرقة من أول استخدام" },
      { icon: "💧", title: "ترطيب عميق", desc: "رطوبة تدوم 24 ساعة" },
      { icon: "🌿", title: "مكونات طبيعية", desc: "آمن لجميع أنواع البشرة" },
      { icon: "🕐", title: "نتائج في 7 أيام", desc: "فرق واضح وحقيقي" },
    ],
    reviews: (n) => [
      { name: "أسماء بناني", city: "الدار البيضاء", stars: 5, text: `جربت ${n} بعد توصية صديقة. من الأسبوع الأول بشرتي أصبحت مشرقة. منتج رائع حقاً!` },
      { name: "رجاء الكوهن", city: "مراكش", stars: 5, text: `بشرتي حساسة وخفت. استعملت ${n} وما ظهرت أي مشكلة. العكس — إشراق جميل طبيعي.` },
      { name: "نادية الطيبي", city: "فاس", stars: 5, text: `المنتج يستحق كل درهم. نتائج حقيقية مش مبالغة. أنصح به.` },
    ],
    faq: [
      { q: "هل يناسب البشرة الحساسة؟", a: "نعم، مكونات طبيعية آمنة حتى للبشرة الحساسة." },
      { q: "كيف أستخدمه؟", a: "صباحاً ومساءً على بشرة نظيفة ومجففة." },
      { q: "متى تظهر النتائج؟", a: "فرق واضح خلال 7 أيام من الاستخدام المنتظم." },
      { q: "هل يسبب حساسية؟", a: "مختبر طبياً ولا يسبب حساسية." },
      { q: "هل التوصيل سري؟", a: "نعم، في علبة أنيقة بدون كتابة." },
    ],
  },

  home_kitchen: {
    badge: "مطبخ ذكي أسرع",
    headline: (n) => `${n} — الطبخ ولا كان سريع ومريح`,
    subheadline: "وجبات احترافية في نصف الوقت — الدفع عند الاستلام",
    offer: "توصيل مجاني + ضمان سنة", cta: "اطلب الآن", stock: "عرض محدود",
    problem_title: "واش كتعيشي هاد المشكل؟",
    problem_points: ["التحضير اليدوي يأخذ ساعات ويسبب التعب","الأطفال ينتظرون والطعام ما زال في المرحلة الأولى","ما تقدريش تطبخي وجبة كاملة في وقت محدود","الإرهاق في المطبخ يفقد متعة الطبخ"],
    solution_title: (n) => `${n} — الطبخ أصبح متعة`,
    solution_points: (n) => [`${n} يسرّع كل مرحلة من مراحل الطبخ`,"وجبات احترافية في 30 دقيقة","نتائج منتظمة وجودة كل مرة","وفّري ساعتين يومياً للعائلة"],
    lifestyle_title: "ماذا تحضرين معه؟",
    scenarios: [
      { icon: "🥗", title: "وجبات يومية سريعة", desc: "كوجين مغربي كامل في 30 دقيقة" },
      { icon: "🧁", title: "حلويات وعجائن", desc: "حلويات عيد بدون تعب" },
      { icon: "🥤", title: "عصائر طازجة", desc: "صحة يومية في ثانية" },
      { icon: "🍲", title: "وجبات عائلية", desc: "من أجل كل الجو بسرعة وبجودة" },
    ],
    benefits: [
      { icon: "⚡", title: "10 أضعاف أسرع", desc: "ما يأخذ ساعة يخلص في 6 دقائق" },
      { icon: "👨‍🍳", title: "نتائج احترافية", desc: "كما في المطاعم المتخصصة" },
      { icon: "🔧", title: "سهل التنظيف", desc: "قابل للفك وغسله بسهولة" },
      { icon: "💪", title: "قوة عالية", desc: "يتعامل مع أصعب المكونات" },
    ],
    reviews: (n) => [
      { name: "فاطمة الزيان", city: "مراكش", stars: 5, text: `${n} غيّر حياتي في المطبخ. العجين والتقطيع في دقائق. لا أتخيل الطبخ بدونه!` },
      { name: "زهرة بنعلي", city: "الدار البيضاء", stars: 5, text: `مع ${n} أصبح الطبخ متعة. التوصيل سريع والمنتج فاق توقعاتي.` },
      { name: "حفيظة المرابط", city: "أكادير", stars: 5, text: `للأمهات المشغولات. ${n} وفّر ساعة يومياً. استثمار يستحق.` },
    ],
    faq: [
      { q: "هل يناسب الأكل المغربي؟", a: "نعم، مثالي للكسكس والطاجين والمسمن وكل شيء." },
      { q: "كيف يُنظَّف؟", a: "الأجزاء تنفصل وتغسل في الغسالة." },
      { q: "كم تدوم الضمانة؟", a: "ضمان سنة كاملة." },
      { q: "هل يستهلك كثير كهرباء؟", a: "استهلاك معقول — مذكور في المواصفات." },
      { q: "فين يوصل التوصيل؟", a: "لجميع مدن المغرب خلال 2-4 أيام." },
    ],
  },

  home_decor: {
    badge: "بيت أكثر أناقة",
    headline: (n) => `${n} — اللمسة اللي كان ناقصة بيتك`,
    subheadline: "ديكور راقي بسعر معقول — يُدهش كل زائر",
    offer: "توصيل مجاني + تغليف هدية مجاناً", cta: "اطلب الآن", stock: "قطع محدودة",
    problem_title: "واش كتحس بهاد الشيء؟",
    problem_points: ["البيت ما فيه شيء يلفت النظر","الزوار يدخلوا وما يلاحظوا شيء","الديكورات الجيدة غالية وصعبة الإيجاد","بيتك يستحق لمسة جمال"],
    solution_title: (n) => `${n} يضيف روح لبيتك`,
    solution_points: (n) => [`${n} يحوّل أي ركن لتحفة فنية`,"إعجاب الزوار مضمون من أول نظرة","جمال يدوم سنوات بدون عناية","هدية مثالية لأي مناسبة"],
    lifestyle_title: "أين تضعه؟",
    scenarios: [
      { icon: "🛋️", title: "الصالون", desc: "البؤرة البصرية التي يلاحظها الجميع" },
      { icon: "🛏️", title: "غرفة النوم", desc: "أجواء راقية تريحك قبل النوم" },
      { icon: "🚪", title: "المدخل", desc: "أول ما يراه الزائر — اجعله مميزاً" },
      { icon: "🎁", title: "هدية مميزة", desc: "هدية تُذكر في كل مناسبة" },
    ],
    benefits: [
      { icon: "✨", title: "جمال فوري", desc: "يحوّل المكان من اللحظة الأولى" },
      { icon: "💎", title: "جودة راقية", desc: "مواد متينة تدوم سنوات" },
      { icon: "🎁", title: "هدية مثالية", desc: "تغليف أنيق جاهز للتقديم" },
      { icon: "🏠", title: "سهل التركيب", desc: "لا أدوات ولا خبرة مطلوبة" },
    ],
    reviews: (n) => [
      { name: "نسرين البرهامي", city: "الرباط", stars: 5, text: `اشتريت ${n} هدية وأعجبت صديقتي جداً. الجودة ممتازة والتغليف أنيق.` },
      { name: "ليلى الطيبي", city: "طنجة", stars: 5, text: `${n} أضاف جمالاً حقيقياً للصالون. كل من يزورنا يسأل عنه.` },
      { name: "سهيلة الرامي", city: "مراكش", stars: 5, text: `بثمن معقول حصلت على منتج راقي. التوصيل سريع والتغليف ممتاز.` },
    ],
    faq: [
      { q: "هل يأتي جاهزاً؟", a: "يأتي شبه جاهز — التركيب بسيط جداً." },
      { q: "هل يمكن إرجاعه؟", a: "نعم إرجاع مجاني خلال 7 أيام." },
      { q: "هل يناسب الهدايا؟", a: "نعم، نقدم تغليف هدية مجانياً." },
      { q: "ما أبعاده الدقيقة؟", a: "مذكورة في وصف المنتج بالتفصيل." },
      { q: "فين يوصل التوصيل؟", a: "لجميع مدن المغرب خلال 2-4 أيام." },
    ],
  },

  power_tool: {
    badge: "قوة احترافية في يديك",
    headline: (n) => `${n} — ما عادكش محتاج حرفي`,
    subheadline: "أنجز أي عمل بدقة احترافية — الدفع عند الاستلام",
    offer: "عرض الحرفي — توصيل مجاني", cta: "احصل عليه الآن", stock: "كمية محدودة",
    problem_title: "واش كتعيش هاد المشكل؟",
    problem_points: ["الحرفي يجي متأخر ويكلف غالي","الأعمال اليدوية تأخذ ساعات وتسبب الإرهاق","الأدوات الرخيصة تتعطل من أول استعمال","ما تقدرش تنجز مشاريعك بنفسك"],
    solution_title: (n) => `${n} — أنجز بنفسك بجودة احترافية`,
    solution_points: (n) => [`${n} ينجز أي عمل في دقائق`,"دقة احترافية بدون خبرة مسبقة","متين وصامد — يدوم سنوات","وفّر تكلفة الحرفيين للأبد"],
    lifestyle_title: "أين تستعمله؟",
    scenarios: [
      { icon: "🏠", title: "صيانة المنزل", desc: "أي إصلاح في دقائق بدون انتظار" },
      { icon: "🪑", title: "تركيب الأثاث", desc: "تركيب مثالي بدون مساعدة" },
      { icon: "🔨", title: "مشاريع DIY", desc: "حوّل أفكارك لواقع بنفسك" },
      { icon: "🏗️", title: "أعمال احترافية", desc: "جودة تضاهي المحترفين" },
    ],
    benefits: [
      { icon: "⚡", title: "قوة فائقة", desc: "يتعامل مع أصعب المواد" },
      { icon: "🎯", title: "دقة احترافية", desc: "نتائج مثالية في كل مرة" },
      { icon: "🔋", title: "بطارية طويلة", desc: "2-4 ساعات استمرارية" },
      { icon: "💪", title: "متين وصامد", desc: "مصنوع للاستخدام المكثف" },
    ],
    reviews: (n) => [
      { name: "عبدالرحمان الكوهن", city: "الدار البيضاء", stars: 5, text: `اشتريت ${n} للأعمال المنزلية وفاق كل توقعاتي. قوي ودقيق ومريح في اليد.` },
      { name: "مصطفى الجراري", city: "فاس", stars: 5, text: `للحرفيين والهواة. ${n} من أحسن ما اشتريت. الجودة تستحق.` },
      { name: "رشيد الطيبي", city: "طنجة", stars: 5, text: `التوصيل في اليوم الثالث والمنتج ممتاز. الدفع عند الاستلام راحني.` },
    ],
    faq: [
      { q: "كم تدوم البطارية؟", a: "2-4 ساعات حسب شدة العمل." },
      { q: "هل يأتي بملحقات؟", a: "نعم، يأتي بطقم كامل من الملحقات." },
      { q: "هل للمبتدئين؟", a: "نعم، مناسب للهواة والمحترفين." },
      { q: "كيف أصونه؟", a: "ينظف بعد كل استخدام والتعليمات مرفقة." },
      { q: "ما مدة الضمان؟", a: "ضمان سنة كاملة." },
    ],
  },

  general_gadget: {
    badge: "تقنية ذكية لحياتك",
    headline: (n) => `${n} — الأداة الذكية التي تغير يومك`,
    subheadline: "تقنية عصرية تحل مشكلتك فوراً — الدفع عند الاستلام",
    offer: "توصيل مجاني — عرض محدود", cta: "اطلب الآن", stock: "كمية محدودة",
    problem_title: "واش كتعيش هاد المشكل؟",
    problem_points: ["الحلول التقليدية بطيئة وغير فعالة","المنتجات الرخيصة تتعطل بسرعة","وقت وجهد يضيع بدون نتيجة","الثمن الغالي ما دايم يعني الجودة"],
    solution_title: (n) => `${n} — القيمة الحقيقية`,
    solution_points: (n) => [`${n} يحل مشكلتك من أول استخدام`,"جودة تدوم — استثمار حقيقي","سهل وسريع — يوفر وقتك وجهدك","سعر عادل لجودة استثنائية"],
    lifestyle_title: "كيف يغير يومك؟",
    scenarios: [
      { icon: "🏠", title: "في البيت", desc: "راحة وعملية كل يوم" },
      { icon: "💼", title: "في العمل", desc: "إنتاجية أعلى وجهد أقل" },
      { icon: "✈️", title: "في السفر", desc: "خفيف وعملي في أي مكان" },
      { icon: "👨‍👩‍👧", title: "مع العائلة", desc: "الكل يستفيد" },
    ],
    benefits: [
      { icon: "⚡", title: "فعال وسريع", desc: "نتائج فورية من أول استخدام" },
      { icon: "💪", title: "متين ومضمون", desc: "جودة تدوم سنوات" },
      { icon: "📦", title: "جاهز للاستخدام", desc: "افتحه وابدأ مباشرة" },
      { icon: "🛡️", title: "ضمان سنة", desc: "دعم فني مضمون" },
    ],
    reviews: (n) => [
      { name: "عثمان الجبلي", city: "الدار البيضاء", stars: 5, text: `اشتريت ${n} وأنا راضٍ جداً. الجودة ممتازة والسعر معقول.` },
      { name: "مليكة الحسيني", city: "الرباط", stars: 5, text: `الدفع عند الاستلام راحني. ${n} يستحق كل درهم.` },
      { name: "يونس التازي", city: "فاس", stars: 5, text: `منتج يستحق كل درهم. أنصح به لكل من يبحث عن جودة بسعر معقول.` },
    ],
    faq: [
      { q: "كيف نستخدمو؟", a: "التعليمات بالعربية في الصندوق." },
      { q: "واش فيه ضمان؟", a: "نعم، ضمان سنة كاملة." },
      { q: "فين يوصل التوصيل؟", a: "لجميع مدن المغرب خلال 2-4 أيام." },
      { q: "واش ممكن نرجعو؟", a: "نعم إرجاع مجاني خلال 7 أيام." },
      { q: "كيفاش نتواصل؟", a: "عبر الهاتف أو واتساب — فريقنا متاح." },
    ],
  },

  general_problem: {
    badge: "حل نهائي مضمون",
    headline: (n) => `${n} — خلاص للمشكلة نهائياً`,
    subheadline: "حل فعال وآمن من أول استخدام — الدفع عند الاستلام",
    offer: "اطلب اليوم — توصيل مجاني", cta: "احصل على الحل الآن", stock: "عرض محدود",
    problem_title: "واش كتعيش هاد المشكل؟",
    problem_points: ["المشكلة تكررت رغم كل المحاولات","الحلول الأخرى مؤقتة وغير فعالة","وقت ومال يضيعان بدون حل حقيقي","المشكلة تأثر على راحتك يومياً"],
    solution_title: (n) => `${n} — الحل الحقيقي`,
    solution_points: (n) => [`${n} يحل المشكلة من جذورها`,"مفعول دائم مع الاستخدام الصحيح","آمن ومجرب على آلاف العملاء","ضمان الرضا الكامل"],
    lifestyle_title: "تخيل بعد الحل...",
    scenarios: [
      { icon: "😌", title: "راحة نفسية حقيقية", desc: "لا قلق لا متابعة — حل دائم" },
      { icon: "⏰", title: "وقت توفره", desc: "ساعات كانت تضيع — أصبحت لك" },
      { icon: "💰", title: "مال توفره", desc: "حل واحد يغني عن مصاريف كثيرة" },
      { icon: "😊", title: "حياة أفضل", desc: "جودة الحياة ترتفع فعلاً" },
    ],
    benefits: [
      { icon: "✅", title: "فعال 100%", desc: "نتائج مضمونة من أول استخدام" },
      { icon: "🌿", title: "آمن وطبيعي", desc: "مكونات معتمدة آمنة" },
      { icon: "⚡", title: "سريع وفوري", desc: "نتيجة تظهر فوراً" },
      { icon: "🛡️", title: "ضمان الرضا", desc: "راضٍ أو مستردّ ثمنك" },
    ],
    reviews: (n) => [
      { name: "حسناء المزيان", city: "الدار البيضاء", stars: 5, text: `جربت كل شيء قبل ${n}. هذا الوحيد الذي نجح معي. ممتاز!` },
      { name: "بدر الدين الحاج", city: "مراكش", stars: 5, text: `نتائج واضحة من أول يوم. ${n} يستحق كل درهم.` },
      { name: "زكرياء العلوي", city: "الرباط", stars: 5, text: `الدفع عند الاستلام راحني. المنتج فعال جداً. أنصح به.` },
    ],
    faq: [
      { q: "متى تظهر النتائج؟", a: "من أول استخدام — نتيجة كاملة خلال أيام." },
      { q: "هل آمن للاستخدام اليومي؟", a: "نعم آمن تماماً." },
      { q: "هل له ضمان؟", a: "نعم، ضمان سنة + ضمان الرضا." },
      { q: "فين يوصل التوصيل؟", a: "لجميع مدن المغرب خلال 2-4 أيام." },
      { q: "واش ممكن ترجعو؟", a: "نعم إرجاع مجاني إذا ما رضيتش." },
    ],
  },

  general_home: {
    badge: "حياة أسهل وأجمل",
    headline: (n) => `${n} — بيتك يستحق أحسن`,
    subheadline: "عملي وأنيق — يوفر وقتك وجهدك كل يوم",
    offer: "توصيل مجاني لجميع المدن", cta: "اطلب الآن", stock: "عرض محدود",
    problem_title: "واش كتحس بهاد الشيء؟",
    problem_points: ["الحلول التقليدية ما تعطيش النتيجة المطلوبة","وقت يضيع في أشياء ممكن تكون أسهل","البيت يستحق حلولاً أكثر ذكاءً","ما فيش حل عملي ومريح في نفس الوقت"],
    solution_title: (n) => `${n} — الحل العملي اللي كنت تدور عليه`,
    solution_points: (n) => [`${n} يوفر وقتك وجهدك من أول استخدام`,"نتيجة واضحة ومباشرة","سهل الاستخدام لجميع أفراد الأسرة","يدوم طويلاً — استثمار يستحق"],
    lifestyle_title: "كيف يدمج في حياتك؟",
    scenarios: [
      { icon: "🏠", title: "كل يوم", desc: "جزء من روتينك اليومي بشكل طبيعي" },
      { icon: "👨‍👩‍👧", title: "للعائلة كاملاً", desc: "الكل يستفيد — كبار وصغار" },
      { icon: "⏰", title: "يوفر الوقت", desc: "وقت كان يضيع — أصبح للعائلة" },
      { icon: "😊", title: "راحة يومية", desc: "حياة أسهل وأكثر راحة كل يوم" },
    ],
    benefits: [
      { icon: "🏠", title: "مناسب للبيت", desc: "صمم للاستخدام المنزلي اليومي" },
      { icon: "⚡", title: "سريع وعملي", desc: "يوفر وقتك وجهدك" },
      { icon: "💎", title: "جودة ممتازة", desc: "مواد متينة تدوم طويلاً" },
      { icon: "🛡️", title: "ضمان سنة", desc: "خدمة ما بعد البيع مضمونة" },
    ],
    reviews: (n) => [
      { name: "أحمد الشرقاوي", city: "مراكش", stars: 5, text: `${n} من أحسن ما اشتريت للبيت. سهل الاستخدام والجودة ممتازة.` },
      { name: "نعيمة الغزالي", city: "الدار البيضاء", stars: 5, text: `جربت وما ندمت. الدفع عند الاستلام راحني. أنصح به.` },
      { name: "عزيز الكتاني", city: "الرباط", stars: 5, text: `منتج يستحق كل درهم. أنصح به لكل أسرة.` },
    ],
    faq: [
      { q: "هل التركيب سهل؟", a: "نعم — جاهز أو تركيب بسيط في دقائق." },
      { q: "هل له ضمان؟", a: "نعم، ضمان سنة كاملة." },
      { q: "كيف أتواصل بعد الشراء؟", a: "هاتف أو واتساب — دعم فني دائماً." },
      { q: "فين يوصل التوصيل؟", a: "لجميع مدن المغرب خلال 2-4 أيام." },
      { q: "واش ممكن أرجعو؟", a: "نعم إرجاع مجاني خلال 7 أيام." },
    ],
  },
};
