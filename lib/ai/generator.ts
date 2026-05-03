/**
 * lib/ai/generator.ts — Server-side only. Never import in client components.
 *
 * Pipeline:
 *  analyzeProduct() → pick template → generateMock() | OpenAI | Gemini
 */
import type { TemplateKey, LandingPageData, LPSection } from "@/lib/templates";
import { analyzeProduct } from "./analyzer";

export interface ProductContext {
  id: string; name: string; description: string | null;
  sale_price_mad: number; sku: string;
}

export interface GeneratedContent extends LandingPageData {
  whatsapp_number: string;
  template_key:    TemplateKey;
  ai_generated:    boolean;
  bundle_1_price:  number;
  bundle_2_price:  number;
  bundle_3_price:  number;
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export async function generateLandingPageContent(
  product: ProductContext,
  templateKeyOverride?: TemplateKey
): Promise<GeneratedContent> {
  // Step 1: analyze product → auto-select template
  const analysis   = analyzeProduct(product);
  const templateKey = templateKeyOverride ?? analysis.templateKey;

  const provider = process.env.AI_PROVIDER?.toLowerCase();
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return generateWithOpenAI(product, templateKey, analysis.cta_style);
  }
  if (provider === "gemini" && process.env.GEMINI_API_KEY) {
    return generateWithGemini(product, templateKey, analysis.cta_style);
  }
  return generateIntelligentMock(product, templateKey, analysis);
}

// ─── Intelligent mock ─────────────────────────────────────────────────────────
function generateIntelligentMock(
  product: ProductContext,
  templateKey: TemplateKey,
  analysis: ReturnType<typeof analyzeProduct>
): GeneratedContent {
  const { name, sale_price_mad: price, description } = product;
  const desc = description ?? "";

  // Price display
  const oldPrice = (price * 1.3).toFixed(0);
  const b1 = price;
  const b2 = parseFloat((price * 2 * 0.9).toFixed(2));
  const b3 = parseFloat((price * 3 * 0.8).toFixed(2));

  // Hero copy — style based on cta_style
  const heroHeadlines: Record<string, string> = {
    urgency:        `🔥 ${name} — العرض اللي كنت تستنى! لا تفوتو`,
    transformation: `خلصت من المشكلة نهائياً مع ${name} ✅`,
    aspiration:     `${name} — الجمال الطبيعي اللي تستاهليه 💄`,
    value:          `${name} — حل ذكي للبيت الحديث 🏠`,
  };

  const heroSubs: Record<string, string> = {
    urgency:        `⚡ ${analysis.benefit} — الدفع عند الاستلام + توصيل مجاني`,
    transformation: `✅ ${analysis.benefit} — جرب بدون مخاطرة`,
    aspiration:     `✨ ${analysis.benefit} — نتائج واضحة خلال أيام`,
    value:          `🏠 ${analysis.benefit} — وفّر وقتك وجهدك`,
  };

  const offerTexts: Record<string, string> = {
    urgency:        `🔥 عرض اليوم فقط — خصم 30% + توصيل مجاني!`,
    transformation: `⚡ اطلب اليوم واحصل على هدية مجانية!`,
    aspiration:     `💄 عرض خاص — 2 بثمن 1 لهذا الأسبوع!`,
    value:          `🏠 توصيل مجاني + ضمان سنة مع كل طلب!`,
  };

  const headline    = heroHeadlines[analysis.cta_style];
  const subheadline = heroSubs[analysis.cta_style];
  const offerText   = offerTexts[analysis.cta_style];

  // Benefits tailored to type
  const benefits = BENEFITS_BY_TYPE[analysis.type];

  // Reviews — varied per type
  const reviews = REVIEWS_BY_TYPE[analysis.type];

  // FAQ — per template
  const faq = FAQ_BY_TEMPLATE[templateKey] ?? FAQ_BY_TEMPLATE.gadget_viral;

  // Build sections
  const sections: LPSection[] = buildSections(templateKey, {
    headline, subheadline, analysis, benefits, reviews, faq, desc,
  });

  return {
    title:            `${name} — ${BADGE_BY_TYPE[analysis.type]}`,
    subtitle:         desc.slice(0, 80) || `${analysis.benefit}`,
    hero_headline:    headline,
    hero_subheadline: subheadline,
    offer_text:       offerText,
    price_text:       `${price.toFixed(0)} درهم`,
    old_price_text:   `${oldPrice} درهم`,
    stock_text:       "⚠️ المخزون محدود — أقل من 10 قطع",
    cta_text:         CTA_BY_STYLE[analysis.cta_style],
    whatsapp_number:  "",
    template_key:     templateKey,
    ai_generated:     false,
    sections,
    bundle_1_price:   b1,
    bundle_2_price:   b2,
    bundle_3_price:   b3,
  };
}

// ─── Section builder ─────────────────────────────────────────────────────────
function buildSections(
  templateKey: TemplateKey,
  data: {
    headline: string; subheadline: string;
    analysis: ReturnType<typeof analyzeProduct>;
    benefits: { icon: string; title: string; desc: string }[];
    reviews:  { name: string; city: string; stars: number; text: string }[];
    faq:      { q: string; a: string }[];
    desc:     string;
  }
): LPSection[] {
  const { headline, subheadline, analysis, benefits, reviews, faq } = data;

  const allSections: Record<string, LPSection> = {
    hero: {
      type: "hero", enabled: true,
      headline, subheadline,
      trust_bullets: ["✅ الدفع عند الاستلام", "🚀 توصيل 2-4 أيام", "🔒 ضمان الجودة", "📞 دعم مستمر"],
    },
    problem_solution: {
      type: "problem_solution", enabled: true,
      before_title:  `قبل: ${analysis.problem}`,
      after_title:   `بعد: ${analysis.benefit}`,
      before_points: ["❌ جهد كبير وقت ضايع", "❌ نتائج مؤقتة وغير مضمونة", "❌ تكلفة عالية بدون فائدة"],
      after_points:  ["✅ نتائج فورية من أول استخدام", "✅ سهل وسريع وبدون تعقيد", "✅ اقتصادي ومضمون 100%"],
    },
    gallery: { type: "gallery", enabled: true },
    benefits: { type: "benefits", enabled: true, items: benefits },
    reviews:  { type: "reviews", enabled: true, rating: 4.9, count: 200, items: reviews },
    faq:      { type: "faq",     enabled: true, items: faq },
    order_form: {
      type: "order_form", enabled: true,
      headline: "🛒 اطلب الآن — الدفع عند الاستلام",
      sub:      `${analysis.audience} — فريقنا كيتصل بيك للتأكيد`,
    },
  };

  // Order by template
  const orders: Record<TemplateKey, string[]> = {
    gadget_viral:         ["hero","benefits","gallery","reviews","faq","order_form"],
    problem_solution_cod: ["hero","problem_solution","benefits","gallery","reviews","faq","order_form"],
    beauty_health:        ["hero","benefits","reviews","gallery","faq","order_form"],
    home_family:          ["hero","benefits","gallery","reviews","order_form"],
  };

  return (orders[templateKey] ?? orders.gadget_viral)
    .map((key) => allSections[key])
    .filter(Boolean);
}

// ─── OpenAI — ready to implement ─────────────────────────────────────────────
async function generateWithOpenAI(
  product: ProductContext,
  templateKey: TemplateKey,
  ctaStyle: string
): Promise<GeneratedContent> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: buildAIPrompt(product, templateKey, ctaStyle),
        }],
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json() as { content: { type: string; text: string }[] };
    const text  = data.content.find((b) => b.type === "text")?.text ?? "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<GeneratedContent>;
      const base   = generateIntelligentMock(product, templateKey, analyzeProduct(product));
      return { ...base, ...parsed, ai_generated: true };
    }
  } catch (err) {
    console.error("[ai] OpenAI generation failed:", err);
  }
  return generateIntelligentMock(product, templateKey, analyzeProduct(product));
}

// ─── Gemini stub ──────────────────────────────────────────────────────────────
async function generateWithGemini(
  product: ProductContext,
  templateKey: TemplateKey,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ctaStyle: string
): Promise<GeneratedContent> {
  console.log("[ai] Gemini not implemented yet — using mock");
  return generateIntelligentMock(product, templateKey, analyzeProduct(product));
}

function buildAIPrompt(product: ProductContext, templateKey: TemplateKey, ctaStyle: string): string {
  return `You are an expert Moroccan COD e-commerce copywriter. 
Generate high-converting Arabic/Darija landing page content for this product.

Product: ${product.name}
Description: ${product.description ?? "N/A"}
Price: ${product.sale_price_mad} MAD
Template: ${templateKey}
CTA Style: ${ctaStyle}

Return ONLY valid JSON with these fields:
{
  "hero_headline": "...",
  "hero_subheadline": "...", 
  "offer_text": "...",
  "cta_text": "..."
}

Rules:
- Use Moroccan Darija (mix of Arabic + Darija)
- Be persuasive, human, conversational
- Focus on benefits not features
- Create urgency naturally
- Max 15 words per headline`;
}

// ─── Static copy data ─────────────────────────────────────────────────────────
const BADGE_BY_TYPE: Record<string, string> = {
  gadget_viral:     "أحدث تقنية 2025 🔥",
  problem_solution: "حل فعال ومضمون ✅",
  beauty_health:    "جمال طبيعي احترافي 💄",
  home_family:      "للبيت المثالي 🏠",
};

const CTA_BY_STYLE: Record<string, string> = {
  urgency:        "🛒 اطلب الآن قبل نفاد الكمية",
  transformation: "✅ جرب الحل الآن",
  aspiration:     "💄 اطلبي الآن",
  value:          "🏠 اطلب لبيتك الآن",
};

const BENEFITS_BY_TYPE: Record<string, { icon: string; title: string; desc: string }[]> = {
  gadget_viral: [
    { icon: "⚡", title: "سرعة فائقة",        desc: "نتائج احترافية في ثوانٍ" },
    { icon: "🎯", title: "دقة عالية",          desc: "تقنية متطورة للنتائج المثالية" },
    { icon: "🔋", title: "بطارية قوية",        desc: "10+ ساعات استمرارية بشحن واحد" },
    { icon: "💪", title: "متين وصامد",         desc: "مصنوع ليدوم سنوات طويلة" },
    { icon: "📦", title: "طقم كامل جاهز",      desc: "كل الملحقات موجودة في الصندوق" },
    { icon: "🛡️", title: "ضمان سنة كاملة",   desc: "دعم فني مستمر مضمون" },
  ],
  problem_solution: [
    { icon: "✅", title: "نتائج من أول استخدام", desc: "يحل المشكلة فوراً بدون انتظار" },
    { icon: "🌿", title: "آمن للعائلة",         desc: "مواد طبيعية ومعتمدة 100%" },
    { icon: "💰", title: "اقتصادي جداً",        desc: "يوفر عليك الكثير على المدى البعيد" },
    { icon: "⚡", title: "سهل الاستخدام",       desc: "ما يحتاجش خبرة أو تقنية" },
    { icon: "🔄", title: "متعدد الاستخدام",     desc: "يحل أكثر من مشكلة في آن واحد" },
    { icon: "🛡️", title: "ضمان الرضا",         desc: "راضٍ أو نرجعو ليك الثمن كامل" },
  ],
  beauty_health: [
    { icon: "✨", title: "نتائج واضحة",         desc: "تحس بالفرق من أول أسبوع" },
    { icon: "🌿", title: "مكونات طبيعية",       desc: "آمن على جميع أنواع البشرة" },
    { icon: "💧", title: "ترطيب عميق",          desc: "يرطب ويغذي من الداخل" },
    { icon: "⏱️", title: "سريع الامتصاص",      desc: "ما يخليش دهون أو أثار" },
    { icon: "🌸", title: "رائحة منعشة",         desc: "عطر خفيف وجميل طول اليوم" },
    { icon: "🛡️", title: "معتمد طبياً",        desc: "فحوصات سريرية مضمونة" },
  ],
  home_family: [
    { icon: "🏠", title: "عملي ومريح",          desc: "يسهل الحياة اليومية كثيراً" },
    { icon: "⚡", title: "سريع وفعال",           desc: "يوفر وقتك وجهدك كل يوم" },
    { icon: "💎", title: "جودة ممتازة",         desc: "مواد عالية الجودة تدوم طويلاً" },
    { icon: "🔧", title: "سهل التركيب",         desc: "جاهز للاستخدام في دقائق" },
    { icon: "🌍", title: "صديق للبيئة",         desc: "مواد آمنة للعائلة والطبيعة" },
    { icon: "💰", title: "قيمة ممتازة",         desc: "سعر معقول لجودة استثنائية" },
  ],
};

const REVIEWS_BY_TYPE: Record<string, { name: string; city: string; stars: number; text: string }[]> = {
  gadget_viral: [
    { name: "يوسف المرابط",   city: "الدار البيضاء", stars: 5, text: "غادي المنتج شي حاجة بالزاف! الجودة ممتازة والتوصيل سريع. شكراً 👍" },
    { name: "سمية الراضي",    city: "الرباط",         stars: 5, text: "اشتريتو لأخويا وكيبغيه بزاف. يخدم مزيان ومزيان التعبئة ❤️" },
    { name: "محمد الفاسي",    city: "فاس",            stars: 5, text: "نسبة للثمن هو الأحسن ف السوق. الدفع عند الاستلام راحتني بزاف ✅" },
  ],
  problem_solution: [
    { name: "حنان الوزاني",   city: "الدار البيضاء", stars: 5, text: "المشكلة حلّات من أول استخدام! ما توقعتش يكون فعّال بهاد الشكل 😍" },
    { name: "كريم التازي",    city: "مراكش",          stars: 5, text: "جربت منتجات كثيرة وهذا هو الوحيد اللي خدم معي. نصح به 100%" },
    { name: "نجوى بنسعيد",    city: "أكادير",          stars: 5, text: "توصل في يومين والنتيجة ممتازة من أول استعمال. الدفع عند الاستلام مريح ✅" },
  ],
  beauty_health: [
    { name: "إيمان الحسيني",  city: "الدار البيضاء", stars: 5, text: "البشرة تغيرت بشكل واضح من أول أسبوع! المنتج رائع وطبيعي 💄✨" },
    { name: "سارة المسعودي",  city: "الرباط",         stars: 5, text: "استعملتو لأسبوعين والنتيجة مذهلة. أنصح به لكل واحدة تبغي جمالها الطبيعي" },
    { name: "فاطمة الزياتي",  city: "مراكش",          stars: 5, text: "أخيراً منتج يعطي نتيجة حقيقية! التعبئة أنيقة والرائحة رائعة ❤️" },
  ],
  home_family: [
    { name: "الحسن الدراوي",  city: "مراكش",          stars: 5, text: "اشتريتو للبيت وكولشي فرحو. يخدم مزيان ويوفر الوقت كثير 👍" },
    { name: "سعاد الغزالي",   city: "الجديدة",         stars: 5, text: "جودة ممتازة بثمن معقول. التوصيل في اليوم الثاني والخدمة رائعة ✅" },
    { name: "عبد الله الصقلي",city: "طنجة",           stars: 5, text: "كل ما طلبت من هاد المتجر جاء في الوقت المحدد وبجودة ممتازة 🌟" },
  ],
};

const FAQ_BY_TEMPLATE: Record<string, { q: string; a: string }[]> = {
  gadget_viral: [
    { q: "كيفاش كيتشحن المنتج؟",          a: "يتشحن عبر كابل USB المرفق خلال ساعتين فقط." },
    { q: "واش يتوافق مع جميع الأجهزة؟",   a: "نعم يتوافق مع جميع الأجهزة والأنظمة الحديثة." },
    { q: "شحال يدوم الضمان؟",              a: "ضمان سنة كاملة مع دعم فني متاح 24/7." },
    { q: "فين يوصل التوصيل؟",              a: "نوصلو لجميع مدن المغرب خلال 2-4 أيام عمل." },
    { q: "واش ممكن نرجع المنتج؟",          a: "نعم إرجاع مجاني خلال 7 أيام إذا ما رضيتيش." },
  ],
  problem_solution_cod: [
    { q: "هل آمن على الأطفال والحيوانات؟", a: "نعم آمن تماماً، مكونات طبيعية معتمدة." },
    { q: "كيفاش نستعملو؟",                 a: "سهل جداً، التعليمات موجودة بالعربية في الصندوق." },
    { q: "شحال يدوم المفعول؟",             a: "مفعول دائم مع الاستخدام المنتظم الصحيح." },
    { q: "واش كاين توصيل لجميع المدن؟",   a: "نعم نوصلو لجميع مدن المغرب خلال 2-4 أيام." },
    { q: "واش ممكن نرجعو؟",               a: "نعم، راضٍ أو مستردّ ثمنك كاملاً." },
  ],
  beauty_health: [
    { q: "مناسب لأي نوع بشرة؟",            a: "نعم مناسب لجميع أنواع البشرة حتى الحساسة." },
    { q: "متى تظهر النتائج؟",               a: "تلاحظين فرق واضح من أول أسبوع استعمال منتظم." },
    { q: "هل له آثار جانبية؟",              a: "لا إطلاقاً، مكونات طبيعية 100% معتمدة طبياً." },
    { q: "كيفاش يجي التوصيل؟",             a: "في علبة أنيقة وسرية بدون أي كتابة على الغلاف." },
    { q: "واش تقدري ترجعيه؟",              a: "نعم إرجاع مجاني خلال 7 أيام." },
  ],
  home_family: [
    { q: "هل التركيب سهل؟",                a: "نعم يتركب في 5 دقائق بدون أدوات خاصة." },
    { q: "ما هي المواد المستخدمة؟",         a: "مواد عالية الجودة آمنة للعائلة والبيئة." },
    { q: "ما مدة الضمان؟",                 a: "ضمان سنة كاملة على جميع عيوب التصنيع." },
    { q: "واش التوصيل مجاني؟",             a: "نعم التوصيل مجاني لجميع مدن المغرب." },
    { q: "واش ممكن نرجعو إذا ما عجبنيش؟", a: "نعم إرجاع مجاني خلال 7 أيام مضمون." },
  ],
};
