/**
 * lib/ai/analyzer.ts — Server-side only.
 * Product Research Engine — deep analysis before content generation.
 * Returns product intelligence: type, audience, story angles, objections,
 * image strategy, AI image prompts.
 */
import type { TemplateKey } from "@/lib/templates";

export type ProductFingerprint =
  | "projector" | "metal_detector" | "anti_insect" | "air_purifier"
  | "cleaning_device" | "surveillance_camera" | "power_tool"
  | "sports_fitness" | "beauty_skin" | "beauty_hair"
  | "home_kitchen" | "home_decor"
  | "general_gadget" | "general_problem" | "general_home";

export interface ImagePrompt {
  section:     string;
  description: string;
  prompt_en:   string;  // for AI image generators (Midjourney / DALL-E)
  mood:        string;
}

export interface ProductAnalysis {
  fingerprint:      ProductFingerprint;
  templateKey:      TemplateKey;
  product_type:     string;
  target_audience:  string;
  main_problem:     string;
  main_benefit:     string;
  use_case:         string;
  use_cases:        string[];
  emotional_angle:  string;
  story_hook:       string;      // opening emotional sentence
  objections:       string[];    // common customer objections
  trust_elements:   string[];    // what builds trust for this product
  selling_angles:   string[];    // best angles to sell this product
  price_level:      "low" | "mid" | "high";
  cta_style:        "urgency" | "transformation" | "aspiration" | "value";
  color_accent:     string;
  image_strategy:   string[];    // types of images needed
  ai_image_prompts: ImagePrompt[];
}

interface ProductInput {
  name: string;
  description: string | null;
  sale_price_mad: number;
  sku?: string;
}

// ─── Detection rules ─────────────────────────────────────────────────────────
const RULES: { fp: ProductFingerprint; patterns: string[] }[] = [
  { fp: "projector",    patterns: ["project","projecteur","cinema","hdmi","4k","lumens","lumen","screen","ecran","beamer","home cinema","magcubic","native","wifi projector","dlp","lcd projector"] },
  { fp: "metal_detector", patterns: ["detect","metal","metaux","méteaux","détecteur","or ","gold","treasure","kenz","كنز","ذهب","معدن","underground","pulse induction","vlf","ground balance"] },
  { fp: "anti_insect",  patterns: ["insect","moustique","namous","cafard","mouche","rat ","souris","nuisible","pest","anti-mouche","anti insect","repulsif","repell","antimoustique","zapper","trap"] },
  { fp: "air_purifier", patterns: ["purif","air pur","ioniseur","ozone","poussiere","pollen","filtre hepa","hepa","diffuseur","humidif","air cleaner"] },
  { fp: "cleaning_device", patterns: ["nettoy","cleaning","cleaner","vapeur","karcher","aspirateur","balai","brosse","lavage","polish","clean","mop"] },
  { fp: "surveillance_camera", patterns: ["camera","cam ","cctv","securite","surveillance","spy","espion","vision nocturne","night vision","alarm"] },
  { fp: "sports_fitness", patterns: ["sport","fitness","musculation","yoga","course","velo","cycling","gym","exercice","tapis roulant","haltere","band"] },
  { fp: "beauty_hair",  patterns: ["cheveux","hair","keratine","lisseur","seche","brushing","volume","boucle","curl","coiff","straightener"] },
  { fp: "beauty_skin",  patterns: ["peau","skin","visage","serum","creme","cream","masque","face","anti-age","ride","collagen","eclat","glow","teint","hydrat","soin visage"] },
  { fp: "home_kitchen", patterns: ["cuisine","kitchen","mixer","robot culin","cafetiere","coffee","four","grill","friteuse","blender","bouilloire","expresso"] },
  { fp: "home_decor",   patterns: ["decor","lampe","rideau","tapis","coussin","tableau","vase","bougie","candle","miroir","cadre","horloge","rangement"] },
  { fp: "power_tool",   patterns: ["perceuse","drill","scie","grinder","meuleuse","tournevis","outil","tool","vis","clé","wrench","compresseur","soudure"] },
];

export function analyzeProduct(product: ProductInput): ProductAnalysis {
  const text  = `${product.name} ${product.description ?? ""}`.toLowerCase();
  const price = product.sale_price_mad;

  let fp: ProductFingerprint = "general_gadget";
  let best = 0;
  for (const rule of RULES) {
    const score = rule.patterns.reduce((s, p) => s + (text.includes(p) ? 1 : 0), 0);
    if (score > best) { best = score; fp = rule.fp; }
  }
  if (best === 0) {
    const problemWords = ["anti","contre","eliminer","repousser","traiter","protection","soulager","nettoyer"];
    const homeWords    = ["maison","home","bureau","jardin","outdoor","interieur"];
    if (problemWords.some((w) => text.includes(w))) fp = "general_problem";
    else if (homeWords.some((w) => text.includes(w))) fp = "general_home";
  }

  const p   = PROFILES[fp];
  const lvl = price < 150 ? "low" : price < 500 ? "mid" : "high" as "low"|"mid"|"high";

  return {
    fingerprint:      fp,
    templateKey:      p.templateKey,
    product_type:     p.product_type,
    target_audience:  p.audience,
    main_problem:     p.problem,
    main_benefit:     p.benefit,
    use_case:         p.use_cases[0],
    use_cases:        p.use_cases,
    emotional_angle:  p.emotion,
    story_hook:       p.story_hook,
    objections:       p.objections,
    trust_elements:   p.trust,
    selling_angles:   p.angles,
    price_level:      lvl,
    cta_style:        p.cta_style,
    color_accent:     p.color,
    image_strategy:   p.image_strategy,
    ai_image_prompts: p.image_prompts,
  };
}

// ─── Full profiles ────────────────────────────────────────────────────────────
type Profile = {
  templateKey: TemplateKey; product_type: string; audience: string;
  problem: string; benefit: string; emotion: string; story_hook: string;
  use_cases: string[]; objections: string[]; trust: string[]; angles: string[];
  cta_style: ProductAnalysis["cta_style"]; color: string;
  image_strategy: string[];
  image_prompts: ImagePrompt[];
};

const PROFILES: Record<ProductFingerprint, Profile> = {
  projector: {
    templateKey: "gadget_viral", product_type: "projector",
    audience: "الأسر والشباب — مشاهدو الأفلام والمباريات والألعاب",
    problem:  "شاشة الهاتف صغيرة والتلفاز ما يعطيش إحساس السينما",
    benefit:  "سينما حقيقية في بيتك بشاشة تصل لـ 200 بوصة",
    emotion:  "متعة الترفيه العائلي وإحساس السينما كل يوم",
    story_hook: "تخيل دارك تتحول لسينما حقيقية — أفلام، مباريات، ألعاب على شاشة عملاقة",
    use_cases: ["مشاهدة الأفلام مع العائلة","البث المباشر للمباريات","ألعاب الفيديو على شاشة كبيرة","حفلات وسهرات مميزة"],
    objections: ["هل الصورة واضحة في الضوء؟","هل التركيب صعب؟","هل يحتاج صوت خارجي؟","هل يشتغل مع Netflix/YouTube؟"],
    trust: ["ضمان سنة","صورة HD واضحة","سهل التركيب","يعمل مع جميع التطبيقات"],
    angles: ["سينما في البيت","توفير ثمن السينما","تجربة عائلية","جودة الصورة"],
    cta_style: "urgency", color: "#1a1a2e",
    image_strategy: ["hero product on white","family watching movie together","big screen wall projection","gaming setup","close-up lens","room cinema setup"],
    image_prompts: [
      { section:"hero", description:"المنتج على خلفية بيضاء نظيفة", prompt_en:"Professional product photo of a mini projector on clean white background, dramatic lighting, high quality", mood:"clean" },
      { section:"lifestyle", description:"عائلة مغربية تشاهد فيلم", prompt_en:"Moroccan family sitting together in dark cozy living room watching movie on large projected screen, warm light, cinematic atmosphere", mood:"warm" },
      { section:"use_case_gaming", description:"شاب يلعب على شاشة كبيرة", prompt_en:"Young man playing video games on large projected screen in dim room, excited expression, colorful game graphics", mood:"exciting" },
      { section:"before_after", description:"شاشة صغيرة vs شاشة كبيرة", prompt_en:"Split image: left side small phone screen showing movie, right side large wall projected cinema screen in home", mood:"contrast" },
    ],
  },

  metal_detector: {
    templateKey: "gadget_viral", product_type: "metal_detector",
    audience: "المغامرون والباحثون عن الكنوز والمعادن",
    problem:  "البحث العشوائي في التربة مستحيل وما يعطيش نتائج",
    benefit:  "اكشف المعادن والذهب حتى متر تحت الأرض بدقة عالية",
    emotion:  "شعور المغامرة والاكتشاف وإمكانية إيجاد كنز حقيقي",
    story_hook: "في كل متر من التربة قد يكون كنز — المشكلة كنت ما تعرفش وين تبحث",
    use_cases: ["البحث في التربة والحقول","استكشاف الشواطئ","مناطق أثرية","الحدائق والحقول المهجورة"],
    objections: ["هل يميز بين الذهب والحديد؟","كم عمق الكشف؟","هل يشتغل في الرمل؟","هل يحتاج خبرة؟"],
    trust: ["كشف حتى متر","تمييز المعادن","مقاوم للماء","سهل الاستخدام"],
    angles: ["كنز قد يكون تحت قدميك","مغامرة حقيقية","جهاز المحترفين","دقة لا مثيل لها"],
    cta_style: "urgency", color: "#78350f",
    image_strategy: ["product hero","person searching in field","beach detection","screen display closeup","found coin/metal","outdoor adventure"],
    image_prompts: [
      { section:"hero", description:"الجهاز منفرداً", prompt_en:"Professional photo of metal detector on clean background, dramatic studio lighting", mood:"clean" },
      { section:"lifestyle", description:"شخص يبحث في حقل", prompt_en:"Person using metal detector in open field at golden hour, sense of adventure and discovery, Moroccan landscape", mood:"adventurous" },
      { section:"discovery", description:"لحظة اكتشاف معدن", prompt_en:"Hand holding old coin found in dirt, metal detector nearby, excitement and discovery feeling", mood:"exciting" },
      { section:"technical", description:"شاشة الجهاز وهي تكشف", prompt_en:"Close-up of metal detector display screen showing signal detection, crisp technical detail", mood:"technical" },
    ],
  },

  anti_insect: {
    templateKey: "problem_solution_cod", product_type: "anti_insect",
    audience: "الأسر والأمهات القلقات على صحة أطفالهن",
    problem:  "الناموس والحشرات تمنع النوم وتهدد صحة العائلة",
    benefit:  "نوم هادئ وبيت نظيف بدون حشرات — آمن 100% للأطفال",
    emotion:  "الراحة النفسية والنوم العميق وحماية الأطفال",
    story_hook: "تنام وهادئ البال — ولادك نايمين بدون ناموسة واحدة",
    use_cases: ["غرف النوم","صالون البيت","المطبخ","الأماكن المفتوحة"],
    objections: ["هل آمن للأطفال والرضع؟","هل له رائحة؟","كم مساحة يغطي؟","هل يشتغل طول الليل؟"],
    trust: ["بدون مواد كيميائية","آمن للأطفال","صامت تماماً","فعال من أول ليلة"],
    angles: ["حماية العائلة","نوم هادئ","بدون كيماويات","فعالية فورية"],
    cta_style: "transformation", color: "#14532d",
    image_strategy: ["product hero","sleeping child safe","clean bedroom","before messy annoyed vs after peaceful","device in room"],
    image_prompts: [
      { section:"hero", description:"الجهاز منفرداً", prompt_en:"Anti-mosquito device product photo on clean white background, professional lighting", mood:"clean" },
      { section:"lifestyle", description:"طفل ينام بسلام", prompt_en:"Cute Moroccan child sleeping peacefully in clean bedroom, soft warm light, no mosquitoes, serene atmosphere", mood:"peaceful" },
      { section:"before", description:"شخص مزعوج من الناموس", prompt_en:"Person in bed annoyed by mosquito buzzing, dark room, uncomfortable expression", mood:"frustrated" },
      { section:"after", description:"عائلة نايمة براحة", prompt_en:"Happy family sleeping peacefully in protected bedroom, soft light, calm atmosphere", mood:"peaceful" },
    ],
  },

  air_purifier: {
    templateKey: "problem_solution_cod", product_type: "air_purifier",
    audience: "المهتمون بالصحة وعائلات فيها أطفال أو مصابون بالحساسية",
    problem:  "هواء البيت ملوث بالغبار والروائح والجراثيم",
    benefit:  "هواء نقي في ثوانٍ — يقضي على 99% من الملوثات",
    emotion:  "الصحة والعافية وجودة التنفس كل يوم",
    story_hook: "كل نفس تأخذه في بيتك يجب أن يكون نظيفاً — هذا حق عائلتك",
    use_cases: ["غرف النوم","مكتب العمل","غرفة الأطفال","الصالون"],
    objections: ["كم مساحة يغطي؟","متى يجب تغيير الفلتر؟","كم يستهلك كهرباء؟","هل يصدر صوتاً؟"],
    trust: ["فلتر HEPA معتمد","يزيل 99.9% من الملوثات","صامت","فحوصات طبية"],
    angles: ["صحة عائلتك","هواء نقي يومياً","حماية من الحساسية","جودة الحياة"],
    cta_style: "transformation", color: "#0c4a6e",
    image_strategy: ["product hero","clean air visualization","child breathing easy","before dirty air vs clean","device in room"],
    image_prompts: [
      { section:"hero", description:"جهاز التنقية", prompt_en:"Air purifier device on clean background, blue accent light, premium product photography", mood:"clean" },
      { section:"lifestyle", description:"طفل يتنفس بسهولة", prompt_en:"Child breathing deeply with eyes closed, fresh air feeling, indoor clean environment, soft light", mood:"fresh" },
    ],
  },

  cleaning_device: {
    templateKey: "problem_solution_cod", product_type: "cleaning_device",
    audience: "ربات البيوت والمهتمون بنظافة المنزل",
    problem:  "التنظيف اليدوي مرهق يأخذ ساعات ولا يعطي نتائج عميقة",
    benefit:  "تنظيف احترافي عميق يوفر 70% من الوقت والجهد",
    emotion:  "الفخر بمنزل نظيف دائماً وتوفير وقت للعائلة",
    story_hook: "خلال ساعة — بيتك نظيف كامل بدون ما تحسي بالتعب",
    use_cases: ["الأرضيات والبلاط","السجاد والموكيت","المطبخ والحمام","الأثاث والمفروشات"],
    objections: ["هل يشتغل على جميع الأرضيات؟","كيف أنظفه؟","هل هو ثقيل؟","هل صوته عالي؟"],
    trust: ["تنظيف عميق مضمون","خفيف وسهل","قابل للغسيل","ضمان سنة"],
    angles: ["نظافة احترافية","توفير الوقت","لا تعب","منزل دائماً نظيف"],
    cta_style: "value", color: "#1e3a5f",
    image_strategy: ["product hero","clean sparkling floor","before dirty vs clean floor","person cleaning easily","close-up cleaning action"],
    image_prompts: [
      { section:"hero", description:"الجهاز منفرداً", prompt_en:"Cleaning device product photo on white background, professional studio lighting", mood:"clean" },
      { section:"result", description:"أرضية لامعة نظيفة", prompt_en:"Sparkling clean tile floor with light reflection, after cleaning, satisfying cleanliness", mood:"satisfying" },
    ],
  },

  surveillance_camera: {
    templateKey: "gadget_viral", product_type: "surveillance_camera",
    audience: "أصحاب المنازل والمحلات التجارية والآباء",
    problem:  "لا تعرف ما يحدث في بيتك أو محلك في غيابك",
    benefit:  "راقب بيتك في أي مكان من هاتفك — 24/7",
    emotion:  "الأمان والطمأنينة على العائلة والممتلكات",
    story_hook: "آخر مرة خرجت من البيت — هل كنت مطمئن؟ الآن ستكون دائماً",
    use_cases: ["مراقبة المنزل من بعيد","مراقبة الأطفال","محلات تجارية","مكاتب ومخازن"],
    objections: ["هل تحتاج إنترنت؟","كيف أشاهد التسجيلات؟","هل تشتغل ليلاً؟","هل التركيب صعب؟"],
    trust: ["رؤية ليلية واضحة","إشعارات فورية","تسجيل مستمر","تركيب سهل"],
    angles: ["أمان عائلتك","مراقبة من هاتفك","رؤية ليلية","سلامة ممتلكاتك"],
    cta_style: "urgency", color: "#1e1e2e",
    image_strategy: ["product hero","phone showing live view","night vision footage","installation","peace of mind family"],
    image_prompts: [
      { section:"hero", description:"الكاميرا منفردة", prompt_en:"Security camera product photo on dark background, dramatic lighting, premium look", mood:"professional" },
      { section:"app", description:"مشاهدة من الهاتف", prompt_en:"Hand holding smartphone showing security camera live feed app, modern interface, clear display", mood:"tech" },
    ],
  },

  sports_fitness: {
    templateKey: "beauty_health", product_type: "sports_fitness",
    audience: "المهتمون باللياقة البدنية الذين ليس لديهم وقت للنادي",
    problem:  "النادي الرياضي مكلف وبعيد وما عندكش وقت",
    benefit:  "تمرين احترافي في بيتك — نتائج في 30 يوماً",
    emotion:  "اللياقة والثقة بالجسم والشعور بالنشاط",
    story_hook: "ما بقاش لديك عذر — النادي وصل لبيتك",
    use_cases: ["التمرين الصباحي","كارديو سريع","بناء العضلات","تمارين الإطالة"],
    objections: ["هل نتائجه مضمونة؟","كم يأخذ من الوقت يومياً؟","هل للمبتدئين؟","هل يحتاج مساحة كبيرة؟"],
    trust: ["مناسب لجميع المستويات","20 دقيقة يومياً تكفي","لا مساحة كبيرة","ضمان النتائج"],
    angles: ["جسم مثالي بالبيت","وفر اشتراك النادي","نتائج سريعة","لأي مستوى"],
    cta_style: "aspiration", color: "#dc2626",
    image_strategy: ["product hero","person exercising at home","before after body","motivational fitness","product in use"],
    image_prompts: [
      { section:"hero", description:"الجهاز الرياضي", prompt_en:"Fitness equipment product photo on clean background, energetic lighting", mood:"energetic" },
      { section:"lifestyle", description:"شخص يتمرن في البيت", prompt_en:"Person working out at home with fitness equipment, motivated expression, clean modern home gym setup", mood:"motivated" },
    ],
  },

  beauty_hair: {
    templateKey: "beauty_health", product_type: "beauty_hair",
    audience: "النساء المهتمات بشعرهن وإطلالتهن اليومية",
    problem:  "الصالون غالي وبعيد والشعر الجاف مشكلة كل يوم",
    benefit:  "شعر صالون احترافي في بيتك — في 10 دقائق",
    emotion:  "الأناقة والجمال والثقة بالنفس أمام الآخرين",
    story_hook: "شعرك هو أول ما يلاحظه الناس — خليه دائماً مثالياً",
    use_cases: ["التصفيف الصباحي","مناسبات خاصة","العناية الأسبوعية","تجديد إطلالتك"],
    objections: ["هل يتلف الشعر؟","هل يناسب الشعر المجعد؟","كم يدوم المفعول؟","هل سهل الاستخدام؟"],
    trust: ["حماية من الحرارة","لجميع أنواع الشعر","لا تلف مضمون","نتائج فورية"],
    angles: ["جمال فوري","وفري ثمن الصالون","شعر مثالي كل يوم","سهل وسريع"],
    cta_style: "aspiration", color: "#9d174d",
    image_strategy: ["product hero","beautiful hair result","woman styling hair","before messy after sleek","close-up hair texture"],
    image_prompts: [
      { section:"hero", description:"جهاز تصفيف الشعر", prompt_en:"Hair styling tool product photo on elegant background, beauty photography style", mood:"elegant" },
      { section:"result", description:"شعر ناعم ولامع", prompt_en:"Beautiful shiny straight hair close-up, salon quality result, warm light, Moroccan woman", mood:"beautiful" },
    ],
  },

  beauty_skin: {
    templateKey: "beauty_health", product_type: "beauty_skin",
    audience: "النساء المهتمات بصحة بشرتهن وجمالهن الطبيعي",
    problem:  "البشرة الباهتة والجافة تأثر على ثقتك بنفسك",
    benefit:  "بشرة مشرقة وشابة — نتائج طبيعية خلال 7 أيام",
    emotion:  "الجمال الطبيعي والثقة بالنفس والشعور بالشباب",
    story_hook: "بشرتك تستحق أفضل من ما تعطيها الآن — الجمال الحقيقي يبدأ من هنا",
    use_cases: ["روتين الصباح","العناية الليلية","قبل المناسبات","الحماية اليومية"],
    objections: ["هل يناسب البشرة الحساسة؟","متى تظهر النتائج؟","هل له آثار جانبية؟","هل للاستخدام اليومي؟"],
    trust: ["مكونات طبيعية 100%","مختبر طبياً","لجميع أنواع البشرة","نتائج خلال 7 أيام"],
    angles: ["بشرة طبيعية مشرقة","بدون كيمياء","نتائج سريعة وحقيقية","سعر منافس"],
    cta_style: "aspiration", color: "#be185d",
    image_strategy: ["product hero","glowing skin close-up","before dull after glowing","woman applying product","natural ingredients"],
    image_prompts: [
      { section:"hero", description:"منتج العناية بالبشرة", prompt_en:"Skincare product photography on elegant marble background, premium beauty brand style", mood:"luxurious" },
      { section:"result", description:"بشرة مشرقة طبيعية", prompt_en:"Close-up of glowing healthy Moroccan woman skin, natural radiance, soft beauty lighting", mood:"radiant" },
    ],
  },

  home_kitchen: {
    templateKey: "home_family", product_type: "home_kitchen",
    audience: "ربات البيوت والمهتمون بالطبخ الاحترافي",
    problem:  "التحضير اليدوي يأخذ ساعات ويسبب التعب",
    benefit:  "وجبات احترافية في نصف الوقت — الطبخ أصبح متعة",
    emotion:  "الفخر بتقديم طعام لذيذ وتوفير وقت للعائلة",
    story_hook: "بدل ما تقضي ساعتين في المطبخ — في 30 دقيقة كل شيء جاهز",
    use_cases: ["وجبات يومية سريعة","حلويات وعجائن","عصائر طازجة","وجبات عائلية كبيرة"],
    objections: ["هل التنظيف صعب؟","كم يستهلك كهرباء؟","هل يناسب الأكل المغربي؟","هل هو صامد؟"],
    trust: ["قوة عالية","سهل التنظيف","مواد غذائية آمنة","ضمان سنة"],
    angles: ["طبخ أسرع","نتائج احترافية","توفير الوقت","مناسب للمطبخ المغربي"],
    cta_style: "value", color: "#92400e",
    image_strategy: ["product hero","food preparation in action","finished dish result","close-up mechanism","kitchen setup"],
    image_prompts: [
      { section:"hero", description:"جهاز المطبخ", prompt_en:"Kitchen appliance product photo on clean background, warm food photography lighting", mood:"warm" },
      { section:"food_result", description:"طعام لذيذ جاهز", prompt_en:"Delicious Moroccan food freshly prepared, beautiful presentation, appetizing colors, kitchen background", mood:"appetizing" },
    ],
  },

  home_decor: {
    templateKey: "home_family", product_type: "home_decor",
    audience: "المهتمون بجمال المنزل وإطلالته المميزة",
    problem:  "المنزل العادي يفتقر للشخصية والجمالية",
    benefit:  "منزل يعكس ذوقك الرفيع ويُدهش كل زائر",
    emotion:  "الفخر بمنزل جميل والإعجاب من الزوار",
    story_hook: "منزلك يحكي قصتك — خله يحكي قصة جميلة",
    use_cases: ["تزيين الصالون","غرف النوم","المداخل","هدايا المناسبات"],
    objections: ["هل جودته جيدة؟","هل التركيب صعب؟","هل مناسب للديكور المغربي؟","هل يمكن إرجاعه؟"],
    trust: ["جودة مضمونة","سهل التركيب","مواد متينة","إرجاع مجاني"],
    angles: ["منزل أجمل","هدية مثالية","سعر معقول","جودة راقية"],
    cta_style: "value", color: "#4a1d96",
    image_strategy: ["product hero","product in styled room","close-up texture detail","gift wrapping","room transformation"],
    image_prompts: [
      { section:"hero", description:"قطعة الديكور", prompt_en:"Home decor piece on elegant background, interior design photography style, beautiful lighting", mood:"elegant" },
      { section:"room", description:"القطعة في غرفة جميلة", prompt_en:"Stylish Moroccan living room with decor piece as focal point, warm light, luxury feel", mood:"luxurious" },
    ],
  },

  power_tool: {
    templateKey: "gadget_viral", product_type: "power_tool",
    audience: "الرجال العمليون وأصحاب المنازل والحرفيون",
    problem:  "الأعمال اليدوية تأخذ وقتاً وتسبب الإرهاق",
    benefit:  "أنجز أي عمل بدقة احترافية في أقل من نصف الوقت",
    emotion:  "الرجولة والقدرة على الإنجاز والاعتماد على النفس",
    story_hook: "ما عادش محتاج تستنى حرفي — أنجز بنفسك بقوة احترافية",
    use_cases: ["صيانة المنزل","تركيب الأثاث","مشاريع DIY","الأعمال الاحترافية"],
    objections: ["كم تدوم البطارية؟","هل تناسب جميع المواد؟","هل للمبتدئين؟","هل متين؟"],
    trust: ["بطارية طويلة","مواد متينة","لجميع المستويات","ضمان سنة"],
    angles: ["قوة احترافية","اعتماد على النفس","توفير تكلفة الحرفي","متين يدوم"],
    cta_style: "urgency", color: "#1c1917",
    image_strategy: ["product hero","tool in action","project completed result","close-up mechanism","professional setup"],
    image_prompts: [
      { section:"hero", description:"الأداة الكهربائية", prompt_en:"Power tool product photo on dark industrial background, dramatic lighting, professional grade", mood:"powerful" },
      { section:"action", description:"الأداة في العمل", prompt_en:"Man using power tool on wood project, confident skilled expression, workshop setting", mood:"capable" },
    ],
  },

  general_gadget: {
    templateKey: "gadget_viral", product_type: "general_gadget",
    audience: "المهتمون بالتقنية وأدوات الحياة الذكية",
    problem:  "الحلول التقليدية بطيئة ومكلفة وغير فعالة",
    benefit:  "تقنية ذكية تحل مشكلتك بسرعة وبثمن معقول",
    emotion:  "التطور والذكاء والتميز عن الآخرين",
    story_hook: "في عالم يتطور — ابق في المقدمة مع الأدوات الذكية",
    use_cases: ["الاستخدام اليومي","العمل والمكتب","السفر والتنقل","البيت والترفيه"],
    objections: ["هل جودته مضمونة؟","هل له ضمان؟","هل سهل الاستخدام؟","هل الثمن يستحق؟"],
    trust: ["جودة مضمونة","ضمان سنة","سهل الاستخدام","سعر تنافسي"],
    angles: ["تقنية عصرية","قيمة حقيقية","سهولة الاستخدام","ضمان مضمون"],
    cta_style: "urgency", color: "#1e3a5f",
    image_strategy: ["product hero","product in use","lifestyle context","feature highlight","packaging"],
    image_prompts: [
      { section:"hero", description:"المنتج على خلفية نظيفة", prompt_en:"Tech gadget product photo on gradient background, modern product photography, premium look", mood:"modern" },
    ],
  },

  general_problem: {
    templateKey: "problem_solution_cod", product_type: "general_problem",
    audience: "كل من يعاني من هذه المشكلة يومياً",
    problem:  "المشكلة تأثر على راحتك وجودة حياتك",
    benefit:  "حل نهائي فعال من أول استخدام",
    emotion:  "الارتياح والتحرر من المشكلة نهائياً",
    story_hook: "خلاص — المشكلة اللي كانت تأخذ وقتك كل يوم أصبح لها حل",
    use_cases: ["الاستخدام اليومي","الحماية المستمرة","البيت والعائلة","المكتب"],
    objections: ["هل فعال فعلاً؟","هل آمن؟","متى تظهر النتائج؟","هل للاستخدام المستمر؟"],
    trust: ["فعال مضمون","آمن ومعتمد","نتائج سريعة","ضمان الرضا"],
    angles: ["حل فوري","آمن وطبيعي","سعر معقول","نتائج مضمونة"],
    cta_style: "transformation", color: "#14532d",
    image_strategy: ["product hero","problem visualization","solution result","satisfied user","before after"],
    image_prompts: [
      { section:"hero", description:"المنتج منفرداً", prompt_en:"Product on clean background, problem-solution style photography", mood:"clear" },
    ],
  },

  general_home: {
    templateKey: "home_family", product_type: "general_home",
    audience: "الأسر والعائلات المهتمة بجودة حياتها",
    problem:  "الحياة اليومية تحتاج حلولاً عملية وذكية",
    benefit:  "يسهل حياتك اليومية ويوفر وقتك وراحتك",
    emotion:  "الراحة والاطمئنان والحياة العملية",
    story_hook: "بيتك يستحق أحسن — وحياتك اليومية تستحق أن تكون أسهل",
    use_cases: ["الاستخدام اليومي","توفير الوقت","راحة العائلة","تنظيم المنزل"],
    objections: ["هل جودته جيدة؟","هل مناسب لبيتي؟","هل التركيب سهل؟","هل الثمن يستحق؟"],
    trust: ["جودة مضمونة","سهل الاستخدام","مناسب لجميع البيوت","ضمان سنة"],
    angles: ["عملي ومريح","قيمة حقيقية","لكل بيت","حياة أسهل"],
    cta_style: "value", color: "#1e3a5f",
    image_strategy: ["product hero","home lifestyle","family using product","room integration","packaging"],
    image_prompts: [
      { section:"hero", description:"المنتج المنزلي", prompt_en:"Home product photo on warm background, lifestyle home photography", mood:"homey" },
    ],
  },
};
