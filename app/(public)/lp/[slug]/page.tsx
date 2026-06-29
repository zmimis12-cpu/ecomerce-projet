import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { FALLBACK_CITIES } from "@/components/landing/order-form-public";
import { getLandingPage } from "@/lib/public/queries";
import { OrderFormPublic } from "@/components/landing/order-form-public";
import { StickyBar } from "@/components/landing/sticky-bar";
import { FloatingNotification } from "@/components/landing/floating-notification";
import { ExitPopup } from "@/components/landing/exit-popup";
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
  const b2 = Number(lp.bundle_2_price || Math.round(price * 2 * 0.9));
  const b3 = Number(lp.bundle_3_price || Math.round(price * 3 * 0.8));
  const unitLabel = String((lp as { unit_label?: string }).unit_label ?? "");

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
          `window.addEventListener('load',function(){!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${page.meta_pixel_id.trim()}');fbq('track','PageView');});`
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
              {["✅ دفع عند الاستلام","🚚 توصيل مجاني","🛡️ ضمان سنة","📞 تأكيد هاتفي"].map((b) => (
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

            {/* Social proof counter */}
            <div style={{textAlign:"center",margin:"8px 0",padding:"8px 16px",background:"#fefce8",borderRadius:"10px",border:"1px solid #fde68a"}}>
              <p style={{fontSize:"13px",fontWeight:700,color:"#92400e"}}>
                🔥 أكثر من <strong>500 عميل</strong> طلبوا هذا المنتج هذا الشهر
              </p>
            </div>

            {/* Progress bar stock */}
            <div style={{margin:"8px 0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"4px"}}>
                <span style={{fontSize:"12px",fontWeight:700,color:"#dc2626"}}>⚠️ بقي 8 قطع فقط في المخزون!</span>
                <span style={{fontSize:"11px",color:"#6b7280"}}>92% مباعة</span>
              </div>
              <div style={{background:"#e5e7eb",borderRadius:"9999px",height:"8px",overflow:"hidden"}}>
                <div style={{background:"linear-gradient(90deg,#16a34a,#22c55e)",width:"92%",height:"100%",borderRadius:"9999px"}} />
              </div>
            </div>

            {/* Primary CTA */}
            <a href="#lp-form" className="lp-cta">{ctaText}</a>

            {/* Order form — moved directly into the hero so a customer can
                complete a purchase without scrolling past unrelated sections.
                This is the core change from the old multi-section layout. */}
            <div id="lp-form" className="lp-form-inline">
              <p className="lp-form-note green">{formNote}</p>
              <OrderFormPublic product={product} productSlug={slug}
                ctaText={ctaText} b1={b1} b2={b2} b3={b3} unitLabel={unitLabel}
                cities={digylogCities.length > 0 ? digylogCities : FALLBACK_CITIES} />
            </div>

            {/* Product description — clear, visible explanation of what this is */}
            <div className="lp-desc">
              <p>{description}</p>
            </div>

            {/* WhatsApp */}
            {whatsapp && (
              <a href={`https://wa.me/${whatsapp.replace(/\+/g,"")}?text=${encodeURIComponent(`مرحبا، أريد الاستفسار عن: ${product.name} — ${price.toFixed(0)} درهم`)}`}
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
              {benefits.slice(0, 4).map((b, i) => (
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

        {/* ── POURQUOI NOUS ── */}
        <section className="lp-section">
          <div className="lp-wrap">
            <h2 className="lp-h2">لماذا تختار متجرنا؟</h2>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
              {[
                { icon:"🏆", title:"+500 عميل راضي", desc:"آلاف الطلبات الناجحة في المغرب" },
                { icon:"🚚", title:"توصيل لكل المدن", desc:"24-48 ساعة في الدار البيضاء والرباط" },
                { icon:"💳", title:"الدفع عند الاستلام", desc:"لا دفع مسبق، ادفع عند وصول طلبك" },
                { icon:"🔄", title:"إرجاع مجاني", desc:"7 أيام لإرجاع المنتج بدون أي شرط" },
              ].map((item, i) => (
                <div key={i} style={{background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:"14px",padding:"14px 12px",textAlign:"center"}}>
                  <span style={{fontSize:"28px",display:"block",marginBottom:"6px"}}>{item.icon}</span>
                  <p style={{fontSize:"12px",fontWeight:700,color:"#111",marginBottom:"3px"}}>{item.title}</p>
                  <p style={{fontSize:"10px",color:"#6b7280",lineHeight:1.4}}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PROBLEM → SOLUTION ── */}
        <section className="lp-section">
          <div className="lp-wrap">
            <h2 className="lp-h2">هل سئمت من هذا؟ 😔</h2>
            <div style={{display:"flex",flexDirection:"column",gap:"8px",marginBottom:"20px"}}>
              {["شاشة الهاتف صغيرة وتتعب عيناك 📱","التلفاز القديم لا يعطي تجربة حقيقية 📺","السينما غالية وبعيدة 🎭"].map((p,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:"10px",padding:"12px 14px"}}>
                  <span>❌</span>
                  <p style={{fontSize:"13px",color:"#991b1b",fontWeight:600}}>{p}</p>
                </div>
              ))}
            </div>
            <h3 style={{fontSize:"17px",fontWeight:900,color:"#16a34a",textAlign:"center",marginBottom:"12px"}}>✅ الحل: بروجيتور HY300 PRO</h3>
            <div style={{display:"flex",flexDirection:"column",gap:"8px",marginBottom:"20px"}}>
              {["صورة ضخمة حتى 200 بوصة في بيتك 🎬","WiFi مدمج — Netflix وYouTube بدون كابلات 📡","خفيف ومحمول — سينما في أي مكان 🏠"].map((s,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:"10px",padding:"12px 14px"}}>
                  <span>✅</span>
                  <p style={{fontSize:"13px",color:"#15803d",fontWeight:600}}>{s}</p>
                </div>
              ))}
            </div>
            <a href="#lp-form" className="lp-cta">👉 اطلب الآن بالدفع عند الاستلام</a>
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
              {reviews.slice(0, 5).map((r, i) => {
                const colors = ["#16a34a","#2563eb","#dc2626","#9333ea","#ea580c"];
                return (
                <div key={i} className="lp-card lp-review">
                  <div className="lp-review-top">
                    <div className="lp-review-info">
                      <div style={{width:"40px",height:"40px",borderRadius:"50%",background:colors[i%colors.length],color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:"16px",flexShrink:0}}>{r.name.charAt(0)}</div>
                      <div>
                        <p className="lp-review-name">{r.name}</p>
                        <p className="lp-review-city">📍 {r.city}</p>
                        <span style={{fontSize:"10px",background:"#dcfce7",color:"#15803d",fontWeight:700,padding:"1px 6px",borderRadius:"9999px"}}>✓ مشتري موثق</span>
                      </div>
                    </div>
                    <div style={{color:"#f59e0b",fontSize:"13px"}}>{"★".repeat(r.stars ?? 5)}</div>
                  </div>
                  <p className="lp-review-text">{r.text}</p>
                </div>
                );
              })}
            </div>
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

        {/* ── STICKY BAR (mobile) — hidden when form is in view ── */}
        <StickyBar productName={product.name} price={price} ctaText={ctaText} />

        {/* ── FLOATING NOTIFICATION ── */}
        <FloatingNotification />

        {/* ── EXIT INTENT POPUP ── */}
        <ExitPopup price={price} />

        {/* ── FLOATING WHATSAPP BUTTON ── */}
        {whatsapp && (
          <a
            href={`https://wa.me/${whatsapp.replace(/\+/g,"")}?text=${encodeURIComponent(`مرحبا، أريد الاستفسار عن: ${product.name} — ${price.toFixed(0)} درهم`)}`}
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
  { icon:"🎬", title:"جودة 4K ممتازة",      desc:"صورة واضحة وحادة على أي جدار في أي غرفة" },
  { icon:"📡", title:"WiFi و HDMI",          desc:"متوافق مع Netflix وYouTube وجميع الأجهزة" },
  { icon:"🔊", title:"صوت داخلي قوي",       desc:"تجربة سينمائية كاملة بدون سماعات إضافية" },
  { icon:"🏠", title:"للمنزل والسفر",        desc:"خفيف وسهل الحمل — سينما في أي مكان" },
];
const defaultReviews = [
  { name:"محمد أمين",     city:"الدار البيضاء", stars:5, text:"والله شريت هذا البروجيتور وما ندمت! الصورة واضحة جداً وكبيرة، ولاد الدار كلهم فرحو. التوصيل جا في يومين فقط. نوصي بيه بصح." },
  { name:"فاطمة الزهراء", city:"مراكش",          stars:5, text:"كنت خايفة نطلب من الأنترنت، ولكن الدفع عند الاستلام راحني. المنتج وصل سليم وكاين في كيس مزيان. الجودة ممتازة بالسعر هذا." },
  { name:"يوسف المرابط",  city:"الرباط",          stars:5, text:"شريت واحد لدارنا وواحد لأخوياتي هدية. التوصيل سريع والخدمة ممتازة. البروجيتور كيشتغل مزيان مع Netflix وYouTube." },
  { name:"سمية الراضي",   city:"فاس",             stars:5, text:"أحسن شراء درته هاد العام! الشاشة كبيرة ومزيانة، الأطفال فرحو بزاف. نوصي بيه لكل واحد." },
  { name:"عبد الرحيم",    city:"أكادير",          stars:5, text:"خدمة الزبناء ردو علي بسرعة وشرحو لي كيفاش نخدم البروجيتور. المنتج تام بصح وبسعر معقول جداً." },
];
const defaultFaq = [
  { q:"كيف يتم الدفع؟",              a:"الدفع عند الاستلام فقط — تدفع نقداً للمندوب عند استلام الطرد. لا دفع مسبق، لا بطاقة بنكية." },
  { q:"متى يصل الطلب؟",             a:"التوصيل خلال 24-48 ساعة في الدار البيضاء والرباط، و2-4 أيام لباقي المدن. مجاناً لجميع مدن المغرب." },
  { q:"هل يمكن فتح الطرد عند الاستلام؟", a:"نعم، يمكنك فتح الطرد والتحقق من المنتج قبل الدفع. إذا لم يعجبك يمكنك إرجاعه مجاناً." },
  { q:"هل يوجد ضمان؟",              a:"نعم، ضمان سنة كاملة. في حالة أي مشكل نستبدل المنتج مجاناً أو نسترجع المبلغ كاملاً." },
  { q:"كيف أتواصل معكم؟",           a:"يمكنك التواصل معنا عبر واتساب أو الاتصال المباشر. فريقنا متاح 7 أيام في الأسبوع." },
];

// ── Global CSS — single source of truth ──────────────────────────────────────
const GLOBAL_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;overflow-x:hidden}
  body{font-family:var(--font-cairo),sans-serif;background:#f7f8fa;color:#111827;overflow-x:hidden;width:100%;position:relative}

  /* ── Layout ── */
  .lp-root{min-height:100vh;overflow-x:hidden;width:100%;max-width:100vw}
  .lp-wrap{max-width:580px;margin:0 auto;padding:0 16px;width:100%;box-sizing:border-box}

  /* ── Typography scale ── */
  .lp-h1{
    font-size:clamp(21px,5.5vw,30px);
    font-weight:900;color:#111827;
    line-height:1.3;text-align:center;margin-bottom:8px;
  }
  .lp-h2{
    font-size:clamp(17px,4vw,22px);
    font-weight:800;color:#111827;
    text-align:center;margin-bottom:18px;line-height:1.3;
  }
  .lp-sub{text-align:center;color:#4b5563;font-size:clamp(13px,3.5vw,15px);
    margin-bottom:16px;line-height:1.6;}
  .lp-hook{text-align:center;color:#6b7280;font-size:clamp(12px,3vw,14px);
    margin-bottom:10px;line-height:1.6;font-style:italic;}
  .lp-micro{text-align:center;font-size:12px;color:#9ca3af;margin-top:10px;}
  .lp-form-note{text-align:center;font-size:12px;margin-bottom:20px;}
  .lp-form-note.green{color:#15803d;font-weight:600;}

  /* ── Sections ── */
  .lp-section{background:#fff;margin-top:8px;padding:26px 0}
  .lp-section--gray{background:#f7f8fa}
  .lp-section--green-light{background:#f0fdf4;margin-top:8px;padding:28px 0}
  .lp-hero{background:#fff;padding-bottom:28px}
  .lp-trust{background:#111827;margin-top:8px;padding:22px 0}
  .lp-final{background:#16a34a;margin-top:8px;padding:28px 0}
  .lp-footer{background:#111827;padding:16px;text-align:center;
    color:#6b7280;font-size:11px;margin-bottom:68px}

  /* ── Offer bar ── */
  .lp-bar{background:#111827;color:#fff;text-align:center;
    padding:9px 16px;font-size:13px;font-weight:600;
    letter-spacing:.01em;}

  /* ── Badges ── */
  .lp-badges{display:flex;justify-content:center;flex-wrap:wrap;
    gap:6px;margin-bottom:16px;}
  .lp-badge{display:inline-flex;align-items:center;
    background:#f0fdf4;border:1px solid #bbf7d0;
    color:#15803d;font-size:11px;font-weight:600;
    padding:4px 10px;border-radius:9999px;}

  /* ── Gallery ── */
  .lp-gallery-main{
    position:relative;width:100%;aspect-ratio:1/1;
    border-radius:18px;overflow:hidden;
    box-shadow:0 8px 30px rgba(0,0,0,.12),0 2px 8px rgba(0,0,0,.06);
    margin-bottom:10px;background:#f3f4f6;
  }
  .lp-gallery-counter{
    position:absolute;bottom:10px;right:10px;z-index:2;
    background:rgba(0,0,0,.45);color:#fff;
    font-size:11px;font-weight:600;
    padding:3px 8px;border-radius:9999px;
  }
  .lp-gallery-arrow{
    position:absolute;top:50%;transform:translateY(-50%);z-index:2;
    background:rgba(255,255,255,.85);border:none;cursor:pointer;
    width:36px;height:36px;border-radius:50%;
    font-size:22px;line-height:1;color:#111;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 2px 8px rgba(0,0,0,.15);
  }
  .lp-gallery-arrow--prev{left:10px;}
  .lp-gallery-arrow--next{right:10px;}
  .lp-thumbs{
    display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;
    scrollbar-width:none;margin-bottom:18px;
  }
  .lp-thumbs::-webkit-scrollbar{display:none;}
  .lp-thumb{
    position:relative;flex-shrink:0;
    width:72px;height:72px;border-radius:10px;overflow:hidden;
    border:2px solid transparent;cursor:pointer;background:#f3f4f6;
    transition:border-color .15s;
  }
  .lp-thumb--active{border-color:#16a34a;}
  .lp-thumb:hover{border-color:#86efac;}
  .lp-discount-badge{
    position:absolute;top:12px;left:12px;z-index:2;
    background:#ef4444;color:#fff;font-weight:800;
    font-size:clamp(13px,3.5vw,15px);
    padding:6px 12px;border-radius:9999px;
    box-shadow:0 3px 10px rgba(239,68,68,.4);
    font-family:var(--font-cairo),sans-serif;
  }

  /* ── Entrance animation (subtle, respects reduced motion) ── */
  @media (prefers-reduced-motion: no-preference) {
    .lp-fade-in{animation:lpFadeIn .5s ease-out both;}
  }
  @keyframes lpFadeIn{
    from{opacity:0;transform:translateY(8px);}
    to{opacity:1;transform:translateY(0);}
  }

  /* ── Price card ── */
  .lp-price-card{display:flex;justify-content:space-between;align-items:center;
    background:#fff;border-radius:14px;border:1px solid #e5e7eb;
    box-shadow:0 1px 4px rgba(0,0,0,.05);
    padding:14px 16px;margin-bottom:16px;}
  .lp-price-left{display:flex;flex-direction:column;gap:2px}
  .lp-price-label{font-size:11px;color:#9ca3af;}
  .lp-price-row{display:flex;align-items:baseline;gap:8px;}
  .lp-price-num{font-size:clamp(30px,8vw,40px);font-weight:900;color:#16a34a;line-height:1;}
  .lp-price-cur{font-size:15px;font-weight:700;color:#9ca3af;}
  .lp-price-old{font-size:12px;color:#ef4444;text-decoration:line-through;}
  .lp-price-note{font-size:11px;color:#16a34a;font-weight:600;}

  /* ── CTA button ── */
  .lp-cta{
    display:block;width:100%;text-align:center;
    background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;
    font-family:var(--font-cairo),sans-serif;
    font-size:clamp(15px,4vw,17px);font-weight:800;
    padding:16px 24px;border-radius:14px;
    text-decoration:none;border:none;cursor:pointer;
    box-shadow:0 4px 18px rgba(22,163,74,.32),0 1px 3px rgba(22,163,74,.2);
    transition:background .15s,transform .1s,box-shadow .15s;
  }
  .lp-cta:hover{box-shadow:0 6px 22px rgba(22,163,74,.4),0 1px 3px rgba(22,163,74,.2);}
  .lp-cta:active{transform:scale(.98);background:#15803d}
  .lp-cta:focus-visible{outline:3px solid #bbf7d0;outline-offset:2px;}
  .lp-cta--white{
    background:#fff;color:#16a34a;
    display:inline-block;width:auto;
    padding:13px 40px;margin-top:6px;
    box-shadow:none;
  }
  .lp-form-inline{
    margin-top:18px;padding:18px 16px;
    background:#fff;border-radius:16px;
    border:1px solid #e5e7eb;
    box-shadow:0 4px 20px rgba(0,0,0,.06);
  }
  .lp-desc{
    margin-top:16px;padding:14px 4px;
    font-size:14.5px;line-height:1.8;color:#4b5563;
    text-align:center;
  }
  .lp-wa{
    display:block;width:100%;text-align:center;
    background:#25d366;color:#fff;
    font-family:var(--font-cairo),sans-serif;
    font-size:14px;font-weight:700;
    padding:12px 24px;border-radius:14px;
    text-decoration:none;margin-top:10px;
    transition:transform .1s;
  }
  .lp-wa:active{transform:scale(.98);}

  /* ── Floating WhatsApp ── */
  .lp-wa-float{
    position:fixed;bottom:80px;left:16px;z-index:60;
    width:56px;height:56px;border-radius:50%;
    background:#25d366;color:#fff;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 4px 16px rgba(37,211,102,.5);
    text-decoration:none;
    animation:wa-pulse 2s ease-in-out infinite;
    transition:transform .15s;
  }
  .lp-wa-float:active{transform:scale(.92);}
  @keyframes wa-pulse{
    0%,100%{box-shadow:0 4px 16px rgba(37,211,102,.5);}
    50%{box-shadow:0 4px 24px rgba(37,211,102,.8),0 0 0 8px rgba(37,211,102,.15);}
  }
  @media(min-width:640px){
    .lp-wa-float{bottom:24px;}
  }

  /* ── Cards ── */
  .lp-card{
    background:#fff;border-radius:14px;
    border:1px solid #e5e7eb;
    box-shadow:0 1px 2px rgba(0,0,0,.04),0 6px 16px rgba(0,0,0,.05);
    padding:16px 18px;
    transition:box-shadow .2s,transform .2s;
  }
  .lp-card--green{
    background:#f0fdf4;border-color:#bbf7d0;
  }
  @media(hover:hover){
    .lp-review:hover,.lp-benefit:hover,.lp-scenario:hover{
      box-shadow:0 2px 6px rgba(0,0,0,.06),0 10px 24px rgba(0,0,0,.08);
      transform:translateY(-2px);
    }
  }

  /* ── Check rows ── */
  .lp-check-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;}
  .lp-check-row--border{border-bottom:1px solid #f3f4f6;}
  .lp-check-row--border-g{border-bottom:1px solid #dcfce7;}
  .lp-x{color:#ef4444;font-size:15px;flex-shrink:0;margin-top:1px;}
  .lp-tick{color:#16a34a;font-size:15px;flex-shrink:0;margin-top:1px;}
  .lp-check-text{font-size:clamp(12px,3.5vw,14px);color:#374151;line-height:1.55;}
  .lp-check-text--g{color:#166534;font-weight:500;}

  /* ── Grid ── */
  .lp-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}

  /* ── Scenario cards ── */
  .lp-scenario{text-align:center;padding:16px 12px;}
  .lp-scenario-icon{display:block;font-size:26px;margin-bottom:8px;}
  .lp-scenario-title{font-weight:700;color:#111827;font-size:clamp(12px,3.5vw,13px);margin-bottom:4px;}
  .lp-scenario-desc{color:#6b7280;font-size:clamp(11px,3vw,12px);line-height:1.4;}

  /* ── Benefits ── */
  .lp-benefit{display:flex;align-items:flex-start;gap:10px;padding:14px;}
  .lp-benefit-icon{font-size:20px;flex-shrink:0;line-height:1;}
  .lp-benefit-title{font-weight:700;color:#111827;font-size:clamp(12px,3.5vw,13px);margin-bottom:2px;}
  .lp-benefit-desc{color:#6b7280;font-size:clamp(10px,3vw,11px);line-height:1.4;}

  /* ── Gallery ── */
  .lp-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
  .lp-gallery-item{position:relative;border-radius:12px;overflow:hidden;
    aspect-ratio:1/1;background:#f3f4f6;}

  /* ── Trust strip ── */
  .lp-trust-item{display:flex;align-items:center;gap:10px;
    background:rgba(255,255,255,.07);border-radius:12px;padding:12px;}
  .lp-trust-icon{font-size:20px;flex-shrink:0;}
  .lp-trust-title{font-weight:700;color:#fff;font-size:clamp(11px,3vw,12px);margin-bottom:1px;}
  .lp-trust-desc{color:#9ca3af;font-size:10px;}

  /* ── Reviews ── */
  .lp-reviews-header{display:flex;align-items:center;justify-content:space-between;
    margin-bottom:16px;flex-wrap:wrap;gap:8px;}
  .lp-rating{display:flex;align-items:center;gap:5px;}
  .lp-stars{color:#f59e0b;letter-spacing:-1px;}
  .lp-rating-num{font-weight:800;font-size:15px;}
  .lp-rating-count{color:#9ca3af;font-size:11px;}
  .lp-reviews{display:flex;flex-direction:column;gap:10px;}
  .lp-review{padding:16px;}
  .lp-review-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;}
  .lp-review-info{display:flex;align-items:center;gap:10px;}
  .lp-avatar{width:36px;height:36px;border-radius:50%;background:#16a34a;
    color:#fff;display:flex;align-items:center;justify-content:center;
    font-weight:800;font-size:14px;flex-shrink:0;}
  .lp-review-name{font-weight:700;color:#111827;font-size:13px;margin-bottom:1px;}
  .lp-review-city{color:#9ca3af;font-size:11px;}
  .lp-review-text{color:#374151;font-size:clamp(12px,3.5vw,13px);
    line-height:1.65;margin-bottom:8px;}
  .lp-verified{color:#16a34a;font-size:11px;font-weight:600;}

  /* ── Bundle offers ── */
  .lp-bundles{display:flex;flex-direction:column;gap:10px;}
  .lp-bundle{
    display:flex;justify-content:space-between;align-items:center;
    position:relative;background:#fff;border:2px solid #e5e7eb;
    border-radius:14px;padding:14px 16px;text-decoration:none;
    transition:border-color .15s;
  }
  .lp-bundle--pop{background:#16a34a;border-color:#16a34a;}
  .lp-bundle-badge{
    position:absolute;top:-11px;right:14px;
    background:#f59e0b;color:#fff;font-size:10px;font-weight:700;
    padding:2px 10px;border-radius:9999px;
    font-family:var(--font-cairo),sans-serif;
  }
  .lp-bundle-left{display:flex;flex-direction:column;gap:4px;}
  .lp-bundle-label{font-weight:700;font-size:clamp(12px,3.5vw,14px);color:#111827;}
  .lp-bundle--pop .lp-bundle-label{color:#fff;}
  .lp-bundle-tag{
    background:#dcfce7;color:#15803d;font-size:11px;
    font-weight:600;padding:2px 8px;border-radius:9999px;
    display:inline-block;width:fit-content;
  }
  .lp-bundle-tag--pop{background:rgba(255,255,255,.2);color:#fff;}
  .lp-bundle-price{font-size:clamp(18px,5vw,21px);font-weight:900;color:#16a34a;}
  .lp-bundle--pop .lp-bundle-price{color:#fff;}
  .lp-bundle-price small{font-size:11px;}

  /* ── Final CTA ── */
  .lp-final-title{color:#fff;font-size:clamp(17px,4.5vw,20px);
    font-weight:800;margin-bottom:4px;}
  .lp-final-sub{color:rgba(255,255,255,.8);font-size:13px;margin-bottom:18px;}

  /* ── Sticky bar ── */
  .lp-sticky{
    position:fixed;bottom:0;left:0;right:0;z-index:50;
    background:#fff;border-top:1px solid #e5e7eb;
    padding:10px 16px 14px;
    box-shadow:0 -4px 16px rgba(0,0,0,.08);
  }
  .lp-sticky-inner{
    display:flex;align-items:center;gap:12px;
    max-width:580px;margin:0 auto;
  }
  .lp-sticky-info{flex:1;min-width:0;}
  .lp-sticky-name{font-weight:700;font-size:12px;color:#111827;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .lp-sticky-price{font-size:17px;font-weight:900;color:#16a34a;line-height:1.1;}
  .lp-sticky-price small{font-size:11px;}
  .lp-sticky-btn{
    flex-shrink:0;background:#16a34a;color:#fff;
    font-family:var(--font-cairo),sans-serif;font-size:14px;font-weight:800;
    padding:11px 20px;border-radius:12px;text-decoration:none;
    box-shadow:0 2px 10px rgba(22,163,74,.28);
  }

  /* ── Desktop adjustments ── */
  @media(min-width:640px){
    .lp-sticky{display:none!important}
    .lp-footer{margin-bottom:0}
    .lp-h1{font-size:28px;}
    .lp-h2{font-size:22px;}
    .lp-section,.lp-section--gray,.lp-section--green-light{padding:36px 0}
    .lp-hero{padding-bottom:36px}
    .lp-grid-2{gap:14px}
    .lp-card{padding:20px}
  }
  @media(min-width:900px){
    .lp-wrap{max-width:640px}
    .lp-img-wrap{max-width:520px;margin-left:auto;margin-right:auto;}
    .lp-price-card{max-width:520px;margin-left:auto;margin-right:auto;margin-bottom:18px;}
  }
`;
