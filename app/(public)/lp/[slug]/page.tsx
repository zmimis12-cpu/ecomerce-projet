import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { FALLBACK_CITIES } from "@/components/landing/order-form-public";
import { getLandingPage } from "@/lib/public/queries";
import { OrderFormPublic } from "@/components/landing/order-form-public";
import { StockCounter } from "@/components/landing/stock-counter";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import { ProductGallery } from "@/components/landing/product-gallery";
import type { LPSection } from "@/lib/templates";

export const revalidate = 3600;

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://ecomerce-projet.vercel.app").replace(/\/$/, "");

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getLandingPage(slug);
  if (!page) return { title: "منتج غير موجود", robots: { index: false, follow: false } };

  const canonicalUrl = `${SITE_URL}/lp/${slug}`;
  const description  = page.description ?? `${page.product.name} — الدفع عند الاستلام، توصيل سريع لجميع مدن المغرب.`;
  const image         = page.product.images[0]?.public_url;

  return {
    title: page.title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    // index:true so Google can list the page; follow:true so it crawls
    // internal links/category pages reachable from here — follow:false was
    // actively hurting discovery of the rest of the catalog.
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large" },
    },
    openGraph: {
      type:        "website",
      locale:      "ar_MA",
      url:         canonicalUrl,
      siteName:    "HajtekZone",
      title:       page.title,
      description,
      images: image ? [{ url: image, width: 1200, height: 1200, alt: page.product.name }] : [],
    },
    twitter: {
      card:        "summary_large_image",
      title:       page.title,
      description,
      images: image ? [image] : [],
    },
  };
}

export default async function LandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data: lpData } = await supabaseAdmin
    .from("landing_pages")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  const page = await getLandingPage(slug);
  if (!page) notFound();

  supabaseAdmin.rpc("increment_lp_views" as never, { p_slug: slug } as never).then(() => {}, () => {});

  // Load Digylog cities from cached settings (updated via sync in admin)
  let digylogCities: string[] = [];
  try {
    const { data: dgSettings } = await supabaseAdmin
      .from("digylog_settings")
      .select("config")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const config = (dgSettings as { config?: Record<string, unknown> } | null)?.config;
    if (Array.isArray(config?.cities) && (config.cities as string[]).length > 0) {
      digylogCities = config.cities as string[];
    }
  } catch { /* fallback to hardcoded */ }

  const lp      = (lpData ?? {}) as Record<string, unknown>;
  const product = page.product;

  function getSection(type: string): LPSection | null {
    const secs = (lp.sections as LPSection[]) ?? [];
    return secs.find((s) => s.type === type && s.enabled !== false) ?? null;
  }

  const price     = product.sale_price_mad;
  const headline  = String(lp.hero_headline    ?? page.title);
  const subline   = String(lp.hero_subheadline ?? "توصيل سريع · الدفع عند الاستلام · ضمان الجودة");
  const offerBar  = String(lp.offer_text       ?? "");
  const ctaText   = String(lp.cta_text         ?? "اطلب الآن");
  const oldPriceNum = Number(lp.old_price_num) || price * 1.3;
  const oldPrice  = String(lp.old_price_text   ?? `${oldPriceNum.toFixed(0)} درهم`);
  const discountPct = oldPriceNum > price ? Math.round((1 - price / oldPriceNum) * 100) : 0;
  const whatsapp  = String(lp.whatsapp_number  ?? "");
  // What customers actually need to know about the product — falls back
  // through whatever real content exists instead of a generic empty line,
  // since page.description is empty for most products today.
  const aiAnalysis = (lp.ai_analysis as { main_benefit?: string; main_problem?: string } | undefined);
  const description = page.description
    || (lp.hero_subheadline ? String(lp.hero_subheadline) : "")
    || aiAnalysis?.main_benefit
    || product.description
    || `${product.name} — جودة مضمونة وتوصيل سريع لجميع مدن المغرب.`;
  const b1 = Number(lp.bundle_1_price || price);
  const customerPhotos = (lp.customer_photos as string[] | undefined) ?? [];
  type LPVariant = { name: string; options: string };
  const variants = (lp.variants as LPVariant[] | undefined)?.filter(v => v.name && v.options) ?? [];
  const b2 = Number(lp.bundle_2_price || Math.round(price * 2 * 0.9));
  const b3 = Number(lp.bundle_3_price || Math.round(price * 3 * 0.8));

  const psSection   = getSection("problem_solution");
  const benSection  = getSection("benefits");
  const revSection  = getSection("reviews");
  const faqSection  = getSection("faq");
  const formSection = getSection("order_form");

  type Benefit  = { icon: string; title: string; desc: string };
  type Review   = { name: string; city: string; stars: number; text: string };
  type FaqItem  = { q: string; a: string };

  const benefits:  Benefit[]  = (benSection?.items  as Benefit[])  ?? defaultBenefits;
  const reviews:   Review[]   = (revSection?.items  as Review[])   ?? defaultReviews;
  const faqItems:  FaqItem[]  = (faqSection?.items  as FaqItem[])  ?? defaultFaq;

  const formNote  = String(formSection?.reassurance ?? "معلوماتك محفوظة · لا دفع مسبق · توصيل مضمون");

  const canonicalUrl = `${SITE_URL}/lp/${slug}`;

  // Structured data for Google (Product + Offer + AggregateRating).
  // Numbers here MUST match what's visually shown on the page (4.8 / 200
  // reviews) — Google can penalize mismatched structured data.
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: page.description ?? product.name,
    image: product.images.map((i) => i.public_url),
    sku: product.id,
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: "MAD",
      price: price.toFixed(2),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      reviewCount: "200",
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "الرئيسية", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: product.name, item: canonicalUrl },
    ],
  };

  return (
    <>
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      {page.google_gtm_id && (
        <script dangerouslySetInnerHTML={{ __html:
          `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${page.google_gtm_id}');`
        }} />
      )}

      {page.meta_pixel_id?.trim() && (
        <script dangerouslySetInnerHTML={{ __html:
          `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${page.meta_pixel_id.trim()}',{autoConfig:true});fbq('track','PageView');`
        }} />
      )}
      <link rel="preconnect" href="https://connect.facebook.net" />
      <link rel="preconnect" href="https://www.googletagmanager.com" />
      <link rel="dns-prefetch" href="https://wa.me" />

      {page.google_gtm_id && (
        <noscript>
          <iframe src={`https://www.googletagmanager.com/ns.html?id=${page.google_gtm_id}`}
            height="0" width="0" style={{ display: "none", visibility: "hidden" }} />
        </noscript>
      )}

      <style>{GLOBAL_CSS}</style>

      <div className="lp-root" dir="rtl" lang="ar">

        {/* ── OFFER BAR ── */}
        {offerBar && (
          <div className="lp-bar">{offerBar}</div>
        )}


        {/* ── HERO ── */}
        <section className="lp-hero">
          <div className="lp-wrap">

            {/* Story hook */}
            {!!psSection?.story_hook && (
              <p className="lp-hook">{String(psSection.story_hook ?? "")}</p>
            )}

            <h1 className="lp-h1">{headline}</h1>
            <p className="lp-sub">{subline}</p>

            {/* Trust badges */}
            <div className="lp-badges">
              {["الدفع عند الاستلام","توصيل سريع","ضمان سنة"].map((b) => (
                <span key={b} className="lp-badge">{b}</span>
              ))}
            </div>

            {/* Gallery — multiple photos build trust for COD customers */}
            {product.images.length > 0 && (
              <div className="lp-fade-in">
                <ProductGallery
                  images={product.images}
                  productName={product.name}
                  discountPct={discountPct}
                />
              </div>
            )}

            {/* Price row */}
            <div className="lp-price-card lp-fade-in">
              <div className="lp-price-left">
                <span className="lp-price-label">السعر</span>
                <div className="lp-price-row">
                  <span className="lp-price-num">{price.toFixed(0)}</span>
                  <span className="lp-price-cur">درهم</span>
                  <span className="lp-price-old">{oldPrice}</span>
                </div>
                <span className="lp-price-note">شامل التوصيل المجاني</span>
              </div>
              <StockCounter />
            </div>

            {/* Primary CTA */}
            <a href="#lp-form" className="lp-cta">{ctaText}</a>

            {/* Order form — moved directly into the hero so a customer can
                complete a purchase without scrolling past unrelated sections.
                This is the core change from the old multi-section layout. */}
            <div id="lp-form" className="lp-form-inline">
              <p className="lp-form-note green">{formNote}</p>
              <OrderFormPublic product={product} productSlug={slug}
                ctaText={ctaText} b1={b1} b2={b2} b3={b3}
                variants={variants}
                cities={digylogCities.length > 0 ? digylogCities : FALLBACK_CITIES} />
            </div>

            {/* Product description — clear, visible explanation of what this is */}
            <div className="lp-desc">
              <p>{description}</p>
            </div>

            {/* WhatsApp */}
            {whatsapp && (
              <a href={`https://wa.me/${whatsapp.replace(/\+/g,"")}`}
                target="_blank" rel="noopener noreferrer"
                className="lp-wa">
                واتساب — تواصل معنا
              </a>
            )}

            <p className="lp-micro">لا دفع مسبق · فريقنا يتصل بك للتأكيد</p>
          </div>
        </section>

        {/* ── BENEFITS (short) ── */}
        <section className="lp-section">
          <div className="lp-wrap">
            <h2 className="lp-h2">مميزات المنتج</h2>
            <div className="lp-grid-2">
              {benefits.slice(0, 6).map((b, i) => (
                <div key={i} className="lp-card lp-benefit">
                  <span className="lp-benefit-icon">{b.icon}</span>
                  <div>
                    <p className="lp-benefit-title">{b.title}</p>
                    <p className="lp-benefit-desc">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── REVIEWS ── */}
        <section className="lp-section lp-section--gray">
          <div className="lp-wrap">
            <div className="lp-reviews-header">
              <h2 className="lp-h2" style={{ margin:0 }}>آراء العملاء</h2>
              <div className="lp-rating">
                <span className="lp-stars">★★★★★</span>
                <span className="lp-rating-num">4.8</span>
                <span className="lp-rating-count">(+200)</span>
              </div>
            </div>
            <div className="lp-reviews">
              {reviews.slice(0, 10).map((r, i) => (
                <div key={i} className="lp-card lp-review" style={{border:"1px solid #e5e7eb",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
                  <div className="lp-review-top">
                    <div className="lp-review-info">
                      <div style={{width:"42px",height:"42px",borderRadius:"50%",background:["#16a34a","#2563eb","#dc2626","#9333ea","#ea580c","#0891b2","#d97706","#be185d","#15803d","#1d4ed8"][i%10],color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:"17px",flexShrink:0}}>{r.name.charAt(0)}</div>
                      <div>
                        <p className="lp-review-name">{r.name}</p>
                        <p className="lp-review-city">📍 {r.city}</p>
                        <span style={{fontSize:"10px",background:"#dcfce7",color:"#15803d",fontWeight:700,padding:"1px 7px",borderRadius:"9999px",display:"inline-block",marginTop:"2px"}}>✓ مشتري موثق</span>
                      </div>
                    </div>
                    <div style={{color:"#f59e0b",fontSize:"13px",letterSpacing:"-1px"}}>{"★".repeat(r.stars ?? 5)}</div>
                  </div>
                  <p className="lp-review-text">{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── STATS ── */}
        <section className="lp-section" style={{background:"#111827"}}>
          <div className="lp-wrap">
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"16px",textAlign:"center",padding:"8px 0"}}>
              {[
                { num:"+1500", label:"عميل راضٍ" },
                { num:"+3000", label:"طلب تم توصيله" },
                { num:"98%",   label:"نسبة الرضا" },
              ].map((s, i) => (
                <div key={i}>
                  <p style={{fontSize:"clamp(20px,5vw,28px)",fontWeight:900,color:"#22c55e",marginBottom:"4px"}}>{s.num}</p>
                  <p style={{fontSize:"11px",color:"#9ca3af",fontWeight:600}}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── TRUST BADGES ── */}
        <section className="lp-section lp-section--gray">
          <div className="lp-wrap">
            <h2 className="lp-h2">لماذا تثق بنا؟</h2>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
              {[
                { icon:"💳", title:"دفع عند الاستلام",    desc:"لا دفع مسبق أبداً" },
                { icon:"🚚", title:"توصيل مجاني",         desc:"لجميع مدن المغرب" },
                { icon:"🔒", title:"منتج أصلي مضمون",    desc:"جودة موثقة ومعتمدة" },
                { icon:"⭐", title:"ضمان الرضا",          desc:"إرجاع مجاني 7 أيام" },
                { icon:"📞", title:"تأكيد هاتفي",         desc:"فريقنا يتصل بك" },
                { icon:"🛡️", title:"حماية المشتري",       desc:"طلبك محمي 100%" },
              ].map((t, i) => (
                <div key={i} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:"14px",padding:"14px 12px",display:"flex",alignItems:"flex-start",gap:"10px",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
                  <span style={{fontSize:"24px",flexShrink:0}}>{t.icon}</span>
                  <div>
                    <p style={{fontSize:"12px",fontWeight:700,color:"#111",marginBottom:"2px"}}>{t.title}</p>
                    <p style={{fontSize:"11px",color:"#6b7280"}}>{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CUSTOMER PHOTOS — only show if real photos configured ── */}
        {customerPhotos.length > 0 && (
        <section className="lp-section">
          <div className="lp-wrap">
            <h2 className="lp-h2">صور من زبنائنا 📸</h2>
            <p style={{textAlign:"center",fontSize:"13px",color:"#6b7280",marginBottom:"16px"}}>أكثر من 1500 عميل جرب المنتج</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
              {customerPhotos.map((src, i) => (
                <div key={i} style={{borderRadius:"12px",overflow:"hidden",aspectRatio:"1",background:"#f3f4f6"}}>
                  <img src={src} alt={`عميل ${i+1}`} loading="lazy" style={{width:"100%",height:"100%",objectFit:"cover"}} />
                </div>
              ))}
            </div>
          </div>
        </section>
        )}

        {/* ── CTA MIDDLE ── */}
        <section style={{background:"linear-gradient(135deg,#16a34a,#15803d)",padding:"24px 0"}}>
          <div className="lp-wrap" style={{textAlign:"center"}}>
            <p style={{color:"#fff",fontSize:"16px",fontWeight:900,marginBottom:"6px"}}>🔥 لا تضيع هذه الفرصة!</p>
            <p style={{color:"rgba(255,255,255,.85)",fontSize:"13px",marginBottom:"16px"}}>الكمية محدودة · الدفع عند الاستلام · توصيل مجاني</p>
            <a href="#lp-form" style={{display:"inline-block",background:"#fff",color:"#16a34a",fontFamily:"var(--font-cairo),sans-serif",fontSize:"15px",fontWeight:900,padding:"13px 32px",borderRadius:"12px",textDecoration:"none",boxShadow:"0 4px 16px rgba(0,0,0,.15)"}}>👉 اطلب الآن</a>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="lp-section">
          <div className="lp-wrap">
            <h2 className="lp-h2">الأسئلة الشائعة</h2>
            <FaqAccordion items={faqItems.slice(0, 5)} />
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section className="lp-final">
          <div className="lp-wrap" style={{ textAlign:"center" }}>
            <p className="lp-final-title">ما تخليش الفرصة تفوتك</p>
            <p className="lp-final-sub">الكمية محدودة · الدفع عند الاستلام · توصيل مجاني</p>
            <a href="#lp-form" className="lp-cta lp-cta--white">اطلب الآن</a>
          </div>
        </section>

        <footer className="lp-footer">
          <p>جميع الحقوق محفوظة © {new Date().getFullYear()}</p>
        </footer>

        {/* ── STICKY BAR (mobile) ── */}
        <div className="lp-sticky">
          <div className="lp-sticky-inner">
            <div className="lp-sticky-info">
              <p className="lp-sticky-name">{product.name}</p>
              <p className="lp-sticky-price">
                {price.toFixed(0)} <small>درهم</small>
              </p>
            </div>
            <a href="#lp-form" className="lp-sticky-btn">{ctaText}</a>
          </div>
        </div>

        {/* ── FLOATING WHATSAPP BUTTON ── */}
        {whatsapp && (
          <a
            href={`https://wa.me/${whatsapp.replace(/\+/g,"")}?text=${encodeURIComponent("مرحبا، أريد الاستفسار عن المنتج")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="lp-wa-float"
            aria-label="تواصل عبر واتساب"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </a>
        )}
      </div>
    </>
  );
}

// ── Defaults ──────────────────────────────────────────────────────────────────
const defaultBenefits = [
  { icon:"🔥", title:"يحرق السعرات",       desc:"تمرين فعال يساعدك على فقدان الوزن بسرعة" },
  { icon:"💪", title:"يقوي عضلات الساقين", desc:"تمرين مستمر يشد ويقوي العضلات" },
  { icon:"🍑", title:"يشد الأرداف",        desc:"نتائج ملموسة في أسبوعين فقط" },
  { icon:"🏠", title:"استخدام في المنزل",  desc:"لا حاجة للنادي — مريح وفعال" },
  { icon:"⏱️", title:"10 دقائق يومياً",   desc:"نتائج مضمونة بوقت قصير" },
  { icon:"👥", title:"للجنسين",            desc:"مناسب للرجال والنساء بكل الأعمار" },
];
const defaultReviews = [
  { name:"محمد أمين",      city:"الدار البيضاء", stars:5, text:"منتج ممتاز، توصل في يومين. الجودة فاقت توقعاتي تماماً. نوصي بيه بصح لكل واحد." },
  { name:"فاطمة الزهراء",  city:"مراكش",          stars:5, text:"كنت خايفة نطلب من الأنترنت، ولكن الدفع عند الاستلام راحني. المنتج وصل سليم وكاين في كيس مزيان." },
  { name:"يوسف المرابط",   city:"الرباط",          stars:5, text:"شريت واحد لدارنا وواحد لأخوياتي هدية. التوصيل سريع والخدمة ممتازة جداً." },
  { name:"سمية الراضي",    city:"فاس",             stars:5, text:"أحسن شراء درته هاد العام! النتيجة ظهرت بسرعة وأنا راضية بزاف على الجودة." },
  { name:"عبد الرحيم",     city:"أكادير",          stars:5, text:"خدمة الزبناء ردو علي بسرعة وشرحو لي كيفاش نخدم. المنتج تام بصح وبسعر معقول." },
  { name:"خديجة بنعلي",   city:"طنجة",            stars:5, text:"توصل بسرعة وكان مغلف مزيان. الجودة عالية والسعر مناسب. غادي نشري مرة أخرى." },
  { name:"إدريس الكتاني",  city:"مكناس",           stars:5, text:"منتج رائع يستحق ثمنه. استعملته أسبوعين والنتيجة واضحة. أنصح به بشدة." },
  { name:"نجاة العلوي",    city:"الجديدة",         stars:5, text:"صراحة ما كنت متوقعة هاد الجودة بهاد السعر. الدفع عند الاستلام كان مريح جداً." },
  { name:"عمر بنسعيد",    city:"القنيطرة",        stars:5, text:"التوصيل جا في يوم واحد فقط! المنتج كما هو في الصورة. راضي 100%." },
  { name:"آمنة الصديقي",  city:"سلا",             stars:5, text:"جربت منتجات كثيرة ولكن هذا أحسن واحد. الجودة ممتازة والخدمة احترافية." },
];
const defaultFaq = [
  { q:"كيف يتم التوصيل؟",      a:"خلال 2-4 أيام لجميع مدن المغرب." },
  { q:"هل يمكن إرجاع المنتج؟", a:"نعم، إرجاع مجاني خلال 7 أيام." },
  { q:"كيف يتم الدفع؟",        a:"الدفع عند الاستلام — لا دفع مسبق." },
  { q:"هل هناك ضمان؟",         a:"نعم، ضمان سنة كاملة مع دعم فني." },
];

// ── Global CSS — single source of truth ──────────────────────────────────────
const GLOBAL_CSS = `
  /* ── Reset ── */
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;overflow-x:hidden}
  body{
    font-family:var(--font-cairo),sans-serif;
    background:#f8f8f8;color:#1a1a1a;
    overflow-x:hidden;width:100%;
  }

  /* ── Layout ── */
  .lp-root{min-height:100vh;overflow-x:hidden;width:100%;max-width:100vw}
  .lp-wrap{max-width:560px;margin:0 auto;padding:0 16px;width:100%;box-sizing:border-box}

  /* ── Typography ── */
  .lp-h1{
    font-size:clamp(22px,6vw,32px);
    font-weight:900;color:#0f172a;
    line-height:1.25;text-align:center;
    margin-bottom:10px;letter-spacing:-.02em;
  }
  .lp-h2{
    font-size:clamp(18px,4.5vw,24px);
    font-weight:800;color:#0f172a;
    text-align:center;margin-bottom:20px;
    line-height:1.3;letter-spacing:-.01em;
  }
  .lp-sub{
    text-align:center;color:#64748b;
    font-size:clamp(13px,3.5vw,15px);
    margin-bottom:18px;line-height:1.7;
  }
  .lp-hook{text-align:center;color:#94a3b8;font-size:13px;margin-bottom:12px;font-style:italic;}
  .lp-micro{text-align:center;font-size:11px;color:#94a3b8;margin-top:12px;}
  .lp-form-note{text-align:center;font-size:12px;margin-bottom:16px;}
  .lp-form-note.green{color:#16a34a;font-weight:600;}

  /* ── Sections ── */
  .lp-section{background:#fff;margin-top:8px;padding:28px 0}
  .lp-section--gray{background:#f8fafc}
  .lp-section--green-light{background:#f0fdf4;margin-top:8px;padding:28px 0}
  .lp-hero{background:#fff;padding-bottom:28px}
  .lp-final{background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);margin-top:8px;padding:32px 0}
  .lp-footer{background:#0f172a;padding:20px;text-align:center;color:#475569;font-size:11px;margin-bottom:68px}

  /* ── Offer bar ── */
  .lp-bar{
    background:linear-gradient(90deg,#0f172a,#1e293b);
    color:#fff;text-align:center;
    padding:10px 16px;font-size:13px;font-weight:600;
    letter-spacing:.01em;
  }

  /* ── Trust badges ── */
  .lp-badges{
    display:flex;justify-content:center;flex-wrap:wrap;
    gap:6px;margin-bottom:18px;
  }
  .lp-badge{
    display:inline-flex;align-items:center;gap:3px;
    background:#f0fdf4;border:1.5px solid #86efac;
    color:#15803d;font-size:11px;font-weight:700;
    padding:5px 12px;border-radius:9999px;
    box-shadow:0 1px 3px rgba(22,163,74,.1);
  }

  /* ── Gallery ── */
  .lp-gallery-main{
    position:relative;width:100%;aspect-ratio:1/1;
    border-radius:20px;overflow:hidden;
    box-shadow:0 4px 24px rgba(0,0,0,.1),0 1px 4px rgba(0,0,0,.06);
    margin-bottom:10px;background:#f1f5f9;
  }
  .lp-gallery-counter{
    position:absolute;bottom:12px;right:12px;z-index:2;
    background:rgba(0,0,0,.5);color:#fff;
    font-size:11px;font-weight:600;
    padding:4px 10px;border-radius:9999px;
    backdrop-filter:blur(4px);
  }
  .lp-gallery-arrow{
    position:absolute;top:50%;transform:translateY(-50%);z-index:2;
    background:rgba(255,255,255,.92);border:none;cursor:pointer;
    width:38px;height:38px;border-radius:50%;
    font-size:20px;line-height:1;color:#0f172a;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 2px 10px rgba(0,0,0,.15);
    transition:background .15s;
  }
  .lp-gallery-arrow--prev{left:12px;}
  .lp-gallery-arrow--next{right:12px;}
  .lp-thumbs{
    display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;
    scrollbar-width:none;margin-bottom:20px;
  }
  .lp-thumbs::-webkit-scrollbar{display:none;}
  .lp-thumb{
    position:relative;flex-shrink:0;
    width:72px;height:72px;border-radius:12px;overflow:hidden;
    border:2.5px solid transparent;cursor:pointer;background:#f1f5f9;
    transition:border-color .15s,box-shadow .15s;
  }
  .lp-thumb--active{border-color:#16a34a;box-shadow:0 0 0 2px rgba(22,163,74,.15);}
  .lp-thumb:hover{border-color:#86efac;}
  .lp-discount-badge{
    position:absolute;top:14px;left:14px;z-index:2;
    background:#ef4444;color:#fff;font-weight:900;
    font-size:clamp(12px,3.5vw,15px);
    padding:6px 13px;border-radius:9999px;
    box-shadow:0 4px 12px rgba(239,68,68,.35);
    font-family:var(--font-cairo),sans-serif;
  }

  /* ── Animation ── */
  @media(prefers-reduced-motion:no-preference){
    .lp-fade-in{animation:lpFadeIn .45s ease-out both;}
  }
  @keyframes lpFadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}

  /* ── Price card ── */
  .lp-price-card{
    display:flex;justify-content:space-between;align-items:center;
    background:linear-gradient(135deg,#f0fdf4,#dcfce7);
    border-radius:16px;border:1.5px solid #86efac;
    padding:16px 18px;margin-bottom:18px;
    box-shadow:0 2px 12px rgba(22,163,74,.1);
  }
  .lp-price-left{display:flex;flex-direction:column;gap:3px}
  .lp-price-label{font-size:11px;color:#16a34a;font-weight:600;}
  .lp-price-row{display:flex;align-items:baseline;gap:8px;}
  .lp-price-num{font-size:clamp(32px,8vw,42px);font-weight:900;color:#16a34a;line-height:1;}
  .lp-price-cur{font-size:14px;font-weight:700;color:#16a34a;}
  .lp-price-old{font-size:13px;color:#ef4444;text-decoration:line-through;font-weight:600;}
  .lp-price-note{font-size:11px;color:#15803d;font-weight:700;}

  /* ── CTA button — Replo style ── */
  .lp-cta{
    display:block;width:100%;text-align:center;
    background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%);
    color:#fff;
    font-family:var(--font-cairo),sans-serif;
    font-size:clamp(16px,4.5vw,19px);font-weight:900;
    padding:18px 24px;border-radius:16px;
    text-decoration:none;border:none;cursor:pointer;
    box-shadow:0 6px 24px rgba(22,163,74,.35),0 1px 4px rgba(22,163,74,.2),inset 0 1px 0 rgba(255,255,255,.15);
    transition:transform .1s,box-shadow .15s;
    letter-spacing:.01em;
  }
  .lp-cta:active{transform:scale(.98);box-shadow:0 3px 12px rgba(22,163,74,.25);}
  .lp-cta:focus-visible{outline:3px solid #86efac;outline-offset:2px;}
  .lp-cta--white{
    background:#fff;color:#16a34a;
    border:2px solid #16a34a;
    display:inline-block;width:auto;
    padding:13px 40px;margin-top:8px;
    box-shadow:0 2px 8px rgba(0,0,0,.08);
  }

  /* ── Form ── */
  .lp-form-inline{
    margin-top:20px;padding:20px 16px;
    background:#fff;border-radius:20px;
    border:2px dashed #16a34a;
    box-shadow:0 4px 24px rgba(22,163,74,.08);
  }
  .lp-desc{
    margin-top:14px;padding:14px 4px;
    font-size:14px;line-height:1.8;color:#64748b;
    text-align:center;
  }

  /* ── WhatsApp inline ── */
  .lp-wa{
    display:block;width:100%;text-align:center;
    background:#25d366;color:#fff;
    font-family:var(--font-cairo),sans-serif;
    font-size:14px;font-weight:700;
    padding:13px 24px;border-radius:14px;
    text-decoration:none;margin-top:10px;
    box-shadow:0 4px 14px rgba(37,211,102,.3);
  }

  /* ── Floating WhatsApp ── */
  .lp-wa-float{
    position:fixed;bottom:80px;left:14px;z-index:60;
    width:52px;height:52px;border-radius:50%;
    background:#25d366;color:#fff;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 4px 18px rgba(37,211,102,.45);
    text-decoration:none;
    transition:transform .15s,box-shadow .15s;
  }
  .lp-wa-float:active{transform:scale(.9);}
  @media(min-width:640px){.lp-wa-float{bottom:24px;}}

  /* ── Cards ── */
  .lp-card{
    background:#fff;border-radius:16px;
    border:1px solid #e2e8f0;
    box-shadow:0 1px 3px rgba(0,0,0,.04),0 4px 14px rgba(0,0,0,.05);
    padding:16px 18px;
    transition:box-shadow .2s,transform .2s;
  }
  .lp-card--green{background:#f0fdf4;border-color:#bbf7d0;}
  @media(hover:hover){
    .lp-review:hover,.lp-benefit:hover{
      box-shadow:0 4px 20px rgba(0,0,0,.1);
      transform:translateY(-2px);
    }
  }

  /* ── Grid ── */
  .lp-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}

  /* ── Benefits ── */
  .lp-benefit{display:flex;align-items:flex-start;gap:12px;padding:14px;}
  .lp-benefit-icon{font-size:22px;flex-shrink:0;line-height:1;}
  .lp-benefit-title{font-weight:700;color:#0f172a;font-size:clamp(12px,3.5vw,14px);margin-bottom:3px;}
  .lp-benefit-desc{color:#64748b;font-size:clamp(10px,3vw,12px);line-height:1.45;}

  /* ── Reviews ── */
  .lp-reviews-header{
    display:flex;align-items:center;justify-content:space-between;
    margin-bottom:18px;flex-wrap:wrap;gap:8px;
  }
  .lp-rating{display:flex;align-items:center;gap:5px;}
  .lp-stars{color:#f59e0b;letter-spacing:-1px;}
  .lp-rating-num{font-weight:800;font-size:16px;color:#0f172a;}
  .lp-rating-count{color:#94a3b8;font-size:11px;}
  .lp-reviews{display:flex;flex-direction:column;gap:12px;}
  .lp-review{padding:16px;}
  .lp-review-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;}
  .lp-review-info{display:flex;align-items:center;gap:10px;}
  .lp-avatar{
    width:38px;height:38px;border-radius:50%;background:#16a34a;
    color:#fff;display:flex;align-items:center;justify-content:center;
    font-weight:800;font-size:16px;flex-shrink:0;
  }
  .lp-review-name{font-weight:700;color:#0f172a;font-size:13px;margin-bottom:2px;}
  .lp-review-city{color:#94a3b8;font-size:11px;}
  .lp-review-text{color:#475569;font-size:13px;line-height:1.7;}
  .lp-verified{color:#16a34a;font-size:10px;font-weight:700;}

  /* ── Trust ── */
  .lp-trust-item{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.06);border-radius:12px;padding:12px;}
  .lp-trust-icon{font-size:20px;flex-shrink:0;}
  .lp-trust-title{font-weight:700;color:#fff;font-size:clamp(11px,3vw,12px);margin-bottom:1px;}
  .lp-trust-desc{color:#94a3b8;font-size:10px;}

  /* ── Check rows ── */
  .lp-check-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;}
  .lp-check-row--border{border-bottom:1px solid #f1f5f9;}
  .lp-x{color:#ef4444;font-size:15px;flex-shrink:0;margin-top:1px;}
  .lp-tick{color:#16a34a;font-size:15px;flex-shrink:0;margin-top:1px;}
  .lp-check-text{font-size:clamp(12px,3.5vw,14px);color:#374151;line-height:1.55;}

  /* ── Final CTA ── */
  .lp-final-title{color:#fff;font-size:clamp(18px,4.5vw,22px);font-weight:900;margin-bottom:8px;}
  .lp-final-sub{color:rgba(255,255,255,.85);font-size:13px;margin-bottom:20px;}

  /* ── Sticky bar ── */
  .lp-sticky{
    position:fixed;bottom:0;left:0;right:0;z-index:50;
    background:#fff;border-top:1px solid #e2e8f0;
    padding:10px 16px 14px;
    box-shadow:0 -4px 20px rgba(0,0,0,.1);
  }
  .lp-sticky-inner{
    display:flex;align-items:center;gap:12px;
    max-width:560px;margin:0 auto;
  }
  .lp-sticky-info{flex:1;min-width:0;}
  .lp-sticky-name{font-weight:700;font-size:11px;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .lp-sticky-price{font-size:18px;font-weight:900;color:#16a34a;line-height:1.1;}
  .lp-sticky-price small{font-size:11px;font-weight:600;}
  .lp-sticky-btn{
    flex-shrink:0;
    background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;
    font-family:var(--font-cairo),sans-serif;
    font-size:13px;font-weight:900;
    padding:11px 18px;border-radius:12px;
    text-decoration:none;
    box-shadow:0 3px 12px rgba(22,163,74,.35);
    white-space:nowrap;
  }
  @media(min-width:640px){
    .lp-sticky{display:none!important}
    .lp-footer{margin-bottom:0}
    .lp-wa-float{bottom:24px;}
  }

  /* ── FAQ ── */
  .lp-faq-item{border-bottom:1px solid #f1f5f9;}
  .lp-faq-item:last-child{border-bottom:none;}
  .lp-faq-q{
    display:flex;justify-content:space-between;align-items:center;
    padding:14px 0;cursor:pointer;
    font-weight:700;font-size:clamp(13px,3.5vw,14px);color:#0f172a;
    gap:8px;
  }
  .lp-faq-a{padding-bottom:14px;font-size:clamp(12px,3vw,13px);color:#64748b;line-height:1.7;}

  /* ── Gallery (grid type) ── */
  .lp-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
  .lp-gallery-item{position:relative;border-radius:12px;overflow:hidden;aspect-ratio:1/1;background:#f1f5f9;}
  .lp-scenario{text-align:center;padding:16px 12px;}
  .lp-scenario-icon{display:block;font-size:26px;margin-bottom:8px;}
  .lp-scenario-title{font-weight:700;color:#0f172a;font-size:clamp(12px,3.5vw,13px);margin-bottom:4px;}
  .lp-scenario-desc{color:#64748b;font-size:clamp(11px,3vw,12px);line-height:1.4;}
`;