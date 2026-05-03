/**
 * lib/ai/analyzer.ts — Server-side only.
 * Granular product fingerprinting that generates UNIQUE profiles per product.
 * Each fingerprint produces different copy, benefits, FAQ, reviews.
 */
import type { TemplateKey } from "@/lib/templates";

// ─── Granular fingerprints (sub-types) ────────────────────────────────────────
export type ProductFingerprint =
  | "projector"
  | "metal_detector"
  | "anti_insect"
  | "air_purifier"
  | "cleaning_device"
  | "surveillance_camera"
  | "power_tool"
  | "sports_fitness"
  | "beauty_skin"
  | "beauty_hair"
  | "home_kitchen"
  | "home_decor"
  | "general_gadget"
  | "general_problem"
  | "general_home";

export interface ProductAnalysis {
  fingerprint:   ProductFingerprint;
  templateKey:   TemplateKey;
  product_type:  string;
  target_audience: string;
  main_problem:  string;
  main_benefit:  string;
  use_case:      string;
  emotional_angle: string;
  price_level:   "low" | "mid" | "high";
  cta_style:     "urgency" | "transformation" | "aspiration" | "value";
  color_accent:  string;   // primary color for this product type
}

interface ProductInput {
  name: string;
  description: string | null;
  sale_price_mad: number;
  sku?: string;
}

// ─── Fingerprint detection rules (order matters — most specific first) ────────
const FINGERPRINT_RULES: {
  fingerprint: ProductFingerprint;
  patterns: string[];
}[] = [
  { fingerprint: "projector",
    patterns: ["project","projecteur","cinema","hdmi","4k","lumens","lumen","screen","ecran","beamer","vid","home cinema","magcubic","native","wifi projector"] },
  { fingerprint: "metal_detector",
    patterns: ["detect","metal","metaux","méteaux","or ","gold","treasure","kenz","كنز","ذهب","معدن","بحث","underground","mine","mineral","pulse"] },
  { fingerprint: "anti_insect",
    patterns: ["insect","moustique","namous","cafard","mouche","rat","souris","nuisible","pest","anti-mouche","anti insect","repulsif","repell"] },
  { fingerprint: "air_purifier",
    patterns: ["purif","air pur","ioniseur","ozone","poussiere","allergies","pollen","odeur","filtre hepa","hepa","diffuseur","humidif"] },
  { fingerprint: "cleaning_device",
    patterns: ["nettoy","cleaning","cleaner","vapeur","karcher","aspirateur","balai","brosse","lavage","polish","clean"] },
  { fingerprint: "surveillance_camera",
    patterns: ["camera","cam ","cctv","securite","surveillance","spy","espion","vision nocturne","night vision","alarm"] },
  { fingerprint: "sports_fitness",
    patterns: ["sport","fitness","musculation","yoga","course","velo","cycling","gym","exercice","tapis roulant","haltere","band"] },
  { fingerprint: "beauty_hair",
    patterns: ["cheveux","hair","keratine","lisseur","seche","brushing","volume","boucle","curl","perruque","tresse","coiff"] },
  { fingerprint: "beauty_skin",
    patterns: ["peau","skin","visage","serum","creme","cream","masque","face","anti-age","ride","collagen","eclat","glow","teint","hydrat","soin visage"] },
  { fingerprint: "home_kitchen",
    patterns: ["cuisine","kitchen","mixer","robot culin","cafetiere","coffee","four","grill","friteuse","blender","bouilloire","expresso","thermo"] },
  { fingerprint: "home_decor",
    patterns: ["decor","lampe","rideau","tapis","coussin","tableau","vase","bougie","candle","miroir","cadre","horloge","rangement","organis"] },
  { fingerprint: "power_tool",
    patterns: ["perceuse","drill","scie","grinder","meuleuse","tournevis","outil","tool","vis","clé","wrench","compresseur","soudure","weld"] },
];

// ─── Main entry point ─────────────────────────────────────────────────────────
export function analyzeProduct(product: ProductInput): ProductAnalysis {
  const text  = `${product.name} ${product.description ?? ""}`.toLowerCase();
  const price = product.sale_price_mad;

  // Find best fingerprint match
  let bestFingerprint: ProductFingerprint = "general_gadget";
  let bestScore = 0;

  for (const rule of FINGERPRINT_RULES) {
    const score = rule.patterns.reduce((s, p) => s + (text.includes(p) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; bestFingerprint = rule.fingerprint; }
  }

  // Fallback: detect problem vs home vs general
  if (bestScore === 0) {
    const problemWords = ["anti","contre","eliminer","repousser","traiter","protection","soulager","nettoyer"];
    const homeWords    = ["maison","home","bureau","jardin","outdoor","interieur"];
    const hasProblem   = problemWords.some((w) => text.includes(w));
    const hasHome      = homeWords.some((w) => text.includes(w));
    if (hasProblem) bestFingerprint = "general_problem";
    else if (hasHome) bestFingerprint = "general_home";
  }

  const profile = PROFILES[bestFingerprint];
  const price_level: ProductAnalysis["price_level"] =
    price < 150 ? "low" : price < 500 ? "mid" : "high";

  return {
    fingerprint:    bestFingerprint,
    templateKey:    profile.templateKey,
    product_type:   profile.product_type,
    target_audience:profile.target_audience,
    main_problem:   profile.main_problem,
    main_benefit:   profile.main_benefit,
    use_case:       profile.use_case,
    emotional_angle:profile.emotional_angle,
    price_level,
    cta_style:      profile.cta_style,
    color_accent:   profile.color_accent,
  };
}

// ─── Per-fingerprint profiles ─────────────────────────────────────────────────
const PROFILES: Record<ProductFingerprint, {
  templateKey:    TemplateKey;
  product_type:   string;
  target_audience:string;
  main_problem:   string;
  main_benefit:   string;
  use_case:       string;
  emotional_angle:string;
  cta_style:      ProductAnalysis["cta_style"];
  color_accent:   string;
}> = {
  projector: {
    templateKey:    "gadget_viral",
    product_type:   "projector",
    target_audience:"الأسر والشباب المهتم بالترفيه والألعاب",
    main_problem:   "شاشة الهاتف صغيرة والتلفاز العادي ما يعطيش إحساس السينما",
    main_benefit:   "سينما حقيقية في بيتك بأقل من ثمن جهاز تلفاز",
    use_case:       "مشاهدة الأفلام والمباريات والألعاب على شاشة عملاقة",
    emotional_angle:"متعة الترفيه العائلي وإحساس السينما بدون الخروج",
    cta_style:      "urgency",
    color_accent:   "#1a1a2e",
  },
  metal_detector: {
    templateKey:    "gadget_viral",
    product_type:   "metal_detector",
    target_audience:"المغامرون والباحثون عن المعادن والكنوز",
    main_problem:   "البحث عن المعادن بالطرق التقليدية مستحيل وغير دقيق",
    main_benefit:   "اكشف المعادن والذهب والكنوز المدفونة بدقة عالية",
    use_case:       "البحث في التربة والشواطئ والأماكن الأثرية",
    emotional_angle:"شعور المغامرة والاكتشاف وإمكانية إيجاد كنز حقيقي",
    cta_style:      "urgency",
    color_accent:   "#78350f",
  },
  anti_insect: {
    templateKey:    "problem_solution_cod",
    product_type:   "anti_insect",
    target_audience:"الأسر والأمهات القلقات على صحة أطفالهن",
    main_problem:   "الناموس والحشرات تمنع النوم وتهدد صحة العائلة",
    main_benefit:   "نوم هادئ وبيت نظيف بدون حشرات بدون مواد كيميائية",
    use_case:       "الغرف والصالون والمطبخ وجميع أرجاء المنزل",
    emotional_angle:"الراحة النفسية والنوم العميق وحماية الأطفال",
    cta_style:      "transformation",
    color_accent:   "#14532d",
  },
  air_purifier: {
    templateKey:    "problem_solution_cod",
    product_type:   "air_purifier",
    target_audience:"المهتمون بالصحة وجودة الهواء في المنزل",
    main_problem:   "هواء البيت ملوث بالغبار والروائح والجراثيم",
    main_benefit:   "هواء نقي ونظيف في ثوانٍ ونوم أفضل كل ليلة",
    use_case:       "غرف النوم والمكتب وغرفة الأطفال",
    emotional_angle:"الصحة والعافية وجودة الحياة اليومية",
    cta_style:      "transformation",
    color_accent:   "#0c4a6e",
  },
  cleaning_device: {
    templateKey:    "problem_solution_cod",
    product_type:   "cleaning_device",
    target_audience:"ربات البيوت والمهتمون بنظافة المنزل",
    main_problem:   "التنظيف اليدوي يأخذ وقتاً طويلاً ولا يعطي نتائج مثالية",
    main_benefit:   "تنظيف عميق وسريع يوفر ساعات من الجهد اليومي",
    use_case:       "الأرضيات والأثاث والمطبخ والسجاد",
    emotional_angle:"الفخر بمنزل نظيف وتوفير وقت للعائلة",
    cta_style:      "value",
    color_accent:   "#1e3a5f",
  },
  surveillance_camera: {
    templateKey:    "gadget_viral",
    product_type:   "surveillance_camera",
    target_audience:"أصحاب المنازل والمحلات التجارية",
    main_problem:   "لا تعرف ما يحدث في بيتك أو محلك عند غيابك",
    main_benefit:   "مراقبة بيتك في أي مكان 24/7 من هاتفك",
    use_case:       "المنازل والمحلات والمكاتب والمستودعات",
    emotional_angle:"الأمان والطمأنينة على العائلة والممتلكات",
    cta_style:      "urgency",
    color_accent:   "#1e1e2e",
  },
  sports_fitness: {
    templateKey:    "beauty_health",
    product_type:   "sports_fitness",
    target_audience:"المهتمون بالرياضة واللياقة البدنية",
    main_problem:   "الاشتراك في النادي الرياضي مكلف وبعيد",
    main_benefit:   "تمرين احترافي في بيتك بثمن جلسة واحدة في النادي",
    use_case:       "الرياضة اليومية والتمرين في المنزل",
    emotional_angle:"اللياقة والثقة بالنفس والصحة الجيدة",
    cta_style:      "aspiration",
    color_accent:   "#dc2626",
  },
  beauty_hair: {
    templateKey:    "beauty_health",
    product_type:   "beauty_hair",
    target_audience:"النساء المهتمات بشعرهن وإطلالتهن",
    main_problem:   "الشعر التالف والجاف يحتاج مراكز تجميل مكلفة",
    main_benefit:   "شعر ناعم ولامع وصحي بتجربة صالون في بيتك",
    use_case:       "التصفيف اليومي والعناية الأسبوعية بالشعر",
    emotional_angle:"الجمال والأناقة والثقة بالنفس أمام الآخرين",
    cta_style:      "aspiration",
    color_accent:   "#9d174d",
  },
  beauty_skin: {
    templateKey:    "beauty_health",
    product_type:   "beauty_skin",
    target_audience:"النساء المهتمات بالعناية بالبشرة",
    main_problem:   "البشرة تحتاج عناية يومية لكن المنتجات الجيدة غالية",
    main_benefit:   "بشرة مشرقة وشابة بمكونات طبيعية فعالة",
    use_case:       "العناية اليومية والصباحية والليلية بالبشرة",
    emotional_angle:"الجمال الطبيعي والثقة بالنفس والشباب الدائم",
    cta_style:      "aspiration",
    color_accent:   "#be185d",
  },
  home_kitchen: {
    templateKey:    "home_family",
    product_type:   "home_kitchen",
    target_audience:"ربات البيوت والمهتمون بالطبخ",
    main_problem:   "التحضير اليدوي للطعام يستغرق وقتاً طويلاً",
    main_benefit:   "طبخ أسرع وأسهل وبنتائج احترافية في نصف الوقت",
    use_case:       "الطبخ اليومي وتحضير الوجبات والحلويات",
    emotional_angle:"الفخر بتقديم طعام لذيذ وتوفير وقت للعائلة",
    cta_style:      "value",
    color_accent:   "#92400e",
  },
  home_decor: {
    templateKey:    "home_family",
    product_type:   "home_decor",
    target_audience:"المهتمون بديكور المنزل وجمال الإطار المعيشي",
    main_problem:   "المنزل العادي يفتقر للجمالية والأناقة",
    main_benefit:   "منزل أكثر جمالاً وأناقة بتكلفة معقولة",
    use_case:       "الصالون وغرف النوم والمداخل",
    emotional_angle:"الفخر والرضا عن المنزل والإعجاب من الزوار",
    cta_style:      "value",
    color_accent:   "#4a1d96",
  },
  power_tool: {
    templateKey:    "gadget_viral",
    product_type:   "power_tool",
    target_audience:"أصحاب المنازل والمهنيون والحرفيون",
    main_problem:   "الأعمال اليدوية تستغرق وقتاً طويلاً وتحتاج خبرة",
    main_benefit:   "إنجاز أي عمل بسرعة ودقة احترافية بدون جهد",
    use_case:       "أعمال المنزل والورشة والبناء والصيانة",
    emotional_angle:"الفخر والاعتماد على النفس وإنجاز الأعمال بجودة",
    cta_style:      "urgency",
    color_accent:   "#1c1917",
  },
  general_gadget: {
    templateKey:    "gadget_viral",
    product_type:   "general_gadget",
    target_audience:"المهتمون بالتقنية والأدوات الذكية",
    main_problem:   "الحلول التقليدية بطيئة ومكلفة وغير فعالة",
    main_benefit:   "تقنية ذكية تحل مشكلتك بسرعة وبثمن معقول",
    use_case:       "الاستخدام اليومي في البيت والعمل",
    emotional_angle:"الذكاء والتطور والتميز عن الآخرين",
    cta_style:      "urgency",
    color_accent:   "#1e3a5f",
  },
  general_problem: {
    templateKey:    "problem_solution_cod",
    product_type:   "general_problem",
    target_audience:"كل من يعاني من هذه المشكلة",
    main_problem:   "المشكلة تأثر على راحتك ونوعية حياتك اليومية",
    main_benefit:   "حل نهائي وفعال من أول استخدام بدون مشاكل",
    use_case:       "الاستخدام اليومي في المنزل",
    emotional_angle:"الارتياح والتحرر من المشكلة نهائياً",
    cta_style:      "transformation",
    color_accent:   "#14532d",
  },
  general_home: {
    templateKey:    "home_family",
    product_type:   "general_home",
    target_audience:"الأسر والعائلات المهتمة بجودة حياتها",
    main_problem:   "الحياة اليومية تحتاج حلولاً عملية وذكية",
    main_benefit:   "يسهل حياتك اليومية ويوفر وقتك وجهدك",
    use_case:       "الاستخدام اليومي في المنزل",
    emotional_angle:"الراحة والاطمئنان والحياة العملية الهادئة",
    cta_style:      "value",
    color_accent:   "#1e3a5f",
  },
};
