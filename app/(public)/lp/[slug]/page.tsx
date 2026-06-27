import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { FALLBACK_CITIES } from "@/components/landing/order-form-public";
import { getLandingPage } from "@/lib/public/queries";
import { OrderFormPublic } from "@/components/landing/order-form-public";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import { ProductGallery } from "@/components/landing/product-gallery";
import type { LPSection } from "@/lib/templates";

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `

  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;overflow-x:hidden}
  body{font-family:var(--font-cairo),sans-serif;background:#f5f5f5;color:#111;overflow-x:hidden;width:100%}

  .lp-root{min-height:100vh;overflow-x:hidden;width:100%;max-width:100vw}
  .lp-wrap{max-width:560px;margin:0 auto;padding:0 14px;width:100%;box-sizing:border-box}

  /* Offer bar */
  .lp-bar{background:#16a34a;color:#fff;text-align:center;padding:10px 16px;font-size:13px;font-weight:700;letter-spacing:.01em}

  /* Hero */
  .lp-hero{background:#fff;padding-bottom:20px}
  .lp-brand{text-align:center;padding:12px 0 8px}
  .lp-brand-name{font-size:20px;font-weight:900;color:#16a34a;letter-spacing:.5px}

  /* Typography */
  .lp-h1{font-size:clamp(20px,5.5vw,26px);font-weight:900;color:#111;line-height:1.3;text-align:center;margin:14px 0 10px}
  .lp-h2{font-size:clamp(17px,4.5vw,21px);font-weight:800;color:#111;text-align:center;margin-bottom:18px;line-height:1.3}

  /* Price */
  .lp-price-row{display:flex;align-items:baseline;justify-content:center;gap:10px;margin-bottom:12px}
  .lp-price-main{font-size:clamp(34px,9vw,44px);font-weight:900;color:#16a34a;line-height:1}
  .lp-cur{font-size:16px;font-weight:700;color:#6b7280}
  .lp-price-old{font-size:14px;color:#ef4444;text-decoration:line-through;font-weight:600}

  /* Demand badges */
  .lp-demand-row{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-bottom:16px}
  .lp-badge-demand{background:#fef3c7;color:#92400e;font-size:12px;font-weight:700;padding:5px 12px;border-radius:9999px;border:1px solid #fde68a}
  .lp-badge-stock{background:#f0fdf4;color:#15803d;font-size:12px;font-weight:700;padding:5px 12px;border-radius:9999px;border:1px solid #bbf7d0}

  /* CTA */
  .lp-cta{display:block;width:100%;text-align:center;font-family:var(--font-cairo),sans-serif;font-size:clamp(16px,4.5vw,19px);font-weight:900;padding:17px 24px;border-radius:14px;text-decoration:none;border:none;cursor:pointer;transition:transform .1s,box-shadow .15s}
  .lp-cta--main{background:linear-gradient(135deg,#22c55e,#15803d);color:#fff;box-shadow:0 6px 22px rgba(22,163,74,.4);margin-bottom:14px}
  .lp-cta--main:active{transform:scale(.98)}
  .lp-cta--white{background:#fff;color:#16a34a;border:2px solid #16a34a;display:inline-block;width:auto;padding:13px 36px;margin-top:8px}

  /* Trust row */
  .lp-trust-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
  .lp-trust-item{display:flex;align-items:center;gap:8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px}
  .lp-trust-item span{font-size:20px;flex-shrink:0}
  .lp-trust-title{font-size:12px;font-weight:700;color:#111;margin-bottom:1px}
  .lp-trust-sub{font-size:10px;color:#6b7280}

  /* Sections */
  .lp-section{background:#fff;margin-top:8px;padding:24px 0}
  .lp-section--gray{background:#f9fafb}

  /* Benefits */
  .lp-benefits-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .lp-benefit-card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;padding:16px 12px;text-align:center}
  .lp-benefit-icon{font-size:28px;display:block;margin-bottom:8px}
  .lp-benefit-title{font-size:13px;font-weight:700;color:#111;margin-bottom:4px}
  .lp-benefit-desc{font-size:11px;color:#6b7280;line-height:1.4}

  /* Description */
  .lp-desc-text{font-size:14px;line-height:1.8;color:#374151;text-align:center}

  /* Reviews */
  .lp-reviews-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px}
  .lp-rating{display:flex;align-items:center;gap:5px}
  .lp-stars{color:#f59e0b;letter-spacing:-1px}
  .lp-rating-num{font-weight:900;font-size:15px}
  .lp-rating-count{color:#9ca3af;font-size:11px}
  .lp-reviews{display:flex;flex-direction:column;gap:10px}
  .lp-review-card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.04)}
  .lp-review-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
  .lp-review-info{display:flex;align-items:center;gap:10px}
  .lp-avatar{width:38px;height:38px;border-radius:50%;background:#16a34a;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;flex-shrink:0}
  .lp-review-name{font-weight:700;color:#111;font-size:13px;margin-bottom:2px}
  .lp-review-city{color:#9ca3af;font-size:11px}
  .lp-review-text{color:#374151;font-size:13px;line-height:1.65;margin-bottom:8px}
  .lp-verified{color:#16a34a;font-size:11px;font-weight:600}

  /* Urgency banner */
  .lp-urgency-banner{background:#111;padding:18px 0;margin-top:8px}
  .lp-urgency-text{color:#fbbf24;font-size:clamp(15px,4vw,18px);font-weight:900;margin-bottom:6px}
  .lp-urgency-sub{color:#fff;font-size:13px;font-weight:600}

  /* Form */
  .lp-form-box{background:#fff;border:2px dashed #16a34a;border-radius:18px;padding:20px 16px}
  .lp-form-title{font-size:clamp(17px,4.5vw,20px);font-weight:900;color:#111;text-align:center;margin-bottom:6px}
  .lp-form-sub{font-size:12px;color:#16a34a;font-weight:600;text-align:center;margin-bottom:16px}
  .lp-form-note{font-size:12px;color:#6b7280;text-align:center;margin-bottom:12px}

  /* Final */
  .lp-final{background:#16a34a;margin-top:8px;padding:28px 0}
  .lp-final-title{color:#fff;font-size:clamp(18px,4.5vw,22px);font-weight:900;margin-bottom:6px}
  .lp-final-sub{color:rgba(255,255,255,.85);font-size:13px;margin-bottom:18px}

  /* Footer */
  .lp-footer{background:#111;padding:16px;text-align:center;color:#6b7280;font-size:11px;margin-bottom:70px}

  /* Sticky */
  .lp-sticky{position:fixed;bottom:0;left:0;right:0;z-index:50;background:#fff;border-top:1px solid #e5e7eb;padding:10px 16px 14px;box-shadow:0 -4px 16px rgba(0,0,0,.1)}
  .lp-sticky-inner{display:flex;align-items:center;gap:12px;max-width:560px;margin:0 auto}
  .lp-sticky-info{flex:1;min-width:0}
  .lp-sticky-name{font-weight:700;font-size:11px;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .lp-sticky-price{font-size:18px;font-weight:900;color:#16a34a;line-height:1.1}
  .lp-sticky-price small{font-size:11px}
  .lp-sticky-btn{flex-shrink:0;background:#16a34a;color:#fff;font-family:var(--font-cairo),sans-serif;font-size:13px;font-weight:800;padding:11px 16px;border-radius:12px;text-decoration:none;box-shadow:0 2px 10px rgba(22,163,74,.3)}

  /* WhatsApp float */
  .lp-wa-float{position:fixed;bottom:90px;right:12px;z-index:60;width:46px;height:46px;border-radius:50%;background:#25d366;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(37,211,102,.5);text-decoration:none;opacity:.9;transition:opacity .15s}
  .lp-wa-float:hover{opacity:1}

  @media(min-width:640px){
    .lp-sticky{display:none!important}
    .lp-footer{margin-bottom:0}
    .lp-h1{font-size:28px}
    .lp-section,.lp-section--gray{padding:36px 0}
  }
`;


export const revalidate = 3600;

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://ecomerce-projet.vercel.app").replace(/\/$/, "");

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getLandingPage(slug);
  if (!page) return { title: "منتج غير موجود", robots: { index: false, follow: false } };
  const canonicalUrl = `${SITE_URL}/lp/${slug}`;
  const description = page.description ?? `${page.product.name} — الدفع عند الاستلام، توصيل سريع لجميع مدن المغرب.`;
  const image = page.product.images[0]?.public_url;
  return {
    title: page.title,
    description,
    alternates: { canonical: canonicalUrl },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
    openGraph: { type: "website", locale: "ar_MA", url: canonicalUrl, siteName: "HajtekZone", title: page.title, description, images: image ? [{ url: image, width: 1200, height: 1200, alt: page.product.name }] : [] },
    twitter: { card: "summary_large_image", title: page.title, description, images: image ? [image] : [] },
  };
}

export default async function LandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data: lpData } = await supabaseAdmin.from("landing_pages").select("*").eq("slug", slug).eq("is_active", true).maybeSingle();
  const page = await getLandingPage(slug);
  if (!page) notFound();

  supabaseAdmin.rpc("increment_lp_views" as never, { p_slug: slug } as never).then(() => {}, () => {});

  let digylogCities: string[] = [];
  try {
    const { data: dgSettings } = await supabaseAdmin.from("digylog_settings").select("config").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const config = (dgSettings as { config?: Record<string, unknown> } | null)?.config;
    if (Array.isArray(config?.cities) && (config.cities as string[]).length > 0) digylogCities = config.cities as string[];
  } catch { /* fallback */ }

  const lp = (lpData ?? {}) as Record<string, unknown>;
  const product = page.product;

  function getSection(type: string): LPSection | null {
    const secs = (lp.sections as LPSection[]) ?? [];
    return secs.find((s) => s.type === type && s.enabled !== false) ?? null;
  }

  const price = product.sale_price_mad;
  const headline = String(lp.hero_headline ?? page.title);
  const subline = String(lp.hero_subheadline ?? "شاشة ضخمة · الدفع عند الاستلام · توصيل مجاني");
  const offerBar = String(lp.offer_text ?? "🚚 توصيل مجاني + الدفع عند الاستلام لجميع مدن المغرب");
  const ctaText = String(lp.cta_text ?? "اطلب الآن");
  const oldPriceNum = Number(lp.old_price_num) || price * 1.3;
  const oldPrice = String(lp.old_price_text ?? `${oldPriceNum.toFixed(0)} درهم`);
  const discountPct = oldPriceNum > price ? Math.round((1 - price / oldPriceNum) * 100) : 0;
  const whatsapp = String(lp.whatsapp_number ?? "");
  const aiAnalysis = (lp.ai_analysis as { main_benefit?: string } | undefined);
  const description = page.description || (lp.hero_subheadline ? String(lp.hero_subheadline) : "") || aiAnalysis?.main_benefit || product.description || `${product.name} — جودة مضمونة وتوصيل سريع.`;
  const b1 = Number(lp.bundle_1_price || price);
  const b2 = Number(lp.bundle_2_price || Math.round(price * 2 * 0.9));
  const b3 = Number(lp.bundle_3_price || Math.round(price * 3 * 0.8));
  const unitLabel = String((lp as { unit_label?: string }).unit_label ?? "");

  const benSection = getSection("benefits");
  const revSection = getSection("reviews");
  const faqSection = getSection("faq");
  const formSection = getSection("order_form");

  type Benefit = { icon: string; title: string; desc: string };
  type Review = { name: string; city: string; stars: number; text: string };
  type FaqItem = { q: string; a: string };

  const benefits: Benefit[] = (benSection?.items as Benefit[]) ?? defaultBenefits;
  const reviews: Review[] = (revSection?.items as Review[]) ?? defaultReviews;
  const faqItems: FaqItem[] = (faqSection?.items as FaqItem[]) ?? defaultFaq;
  const formNote = String(formSection?.reassurance ?? "");

  const canonicalUrl = `${SITE_URL}/lp/${slug}`;

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: page.description ?? product.name,
    image: product.images.map((i) => i.public_url),
    sku: product.id,
    offers: { "@type": "Offer", url: canonicalUrl, priceCurrency: "MAD", price: price.toFixed(2), availability: "https://schema.org/InStock", itemCondition: "https://schema.org/NewCondition" },
    aggregateRating: { "@type": "AggregateRating", ratingValue: "4.8", reviewCount: "200" },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />

      {page.google_gtm_id && (
        <script dangerouslySetInnerHTML={{ __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${page.google_gtm_id}');` }} />
      )}

      {page.meta_pixel_id?.trim() && (
        <script dangerouslySetInnerHTML={{ __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${page.meta_pixel_id.trim()}');fbq('track','PageView');` }} />
      )}
      <link rel="preconnect" href="https://connect.facebook.net" />
      <link rel="preconnect" href="https://www.googletagmanager.com" />
      <script dangerouslySetInnerHTML={{ __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","xdkdb6hzdf");` }} />

      <style>{CSS}</style>

      <div className="lp-root" dir="rtl" lang="ar">

        {/* ── OFFER BAR ── */}
        <div className="lp-bar">{offerBar}</div>

        {/* ── HERO ── */}
        <section className="lp-hero">
          <div className="lp-wrap">

            {/* Logo / Brand */}
            <div className="lp-brand">
              <span className="lp-brand-name">HajtekZone</span>
            </div>

            {/* Gallery */}
            {product.images.length > 0 && (
              <ProductGallery images={product.images} productName={product.name} discountPct={discountPct} />
            )}

            {/* Product name + Price */}
            <h1 className="lp-h1">{headline}</h1>

            <div className="lp-price-row">
              <span className="lp-price-main">{price.toFixed(0)} <span className="lp-cur">درهم</span></span>
              {oldPriceNum > price && <span className="lp-price-old">{oldPrice}</span>}
            </div>

            {/* Stock + Demand badges */}
            <div className="lp-demand-row">
              <span className="lp-badge-demand">🔥 طلب مرتفع</span>
              <span className="lp-badge-stock">✅ متوفر في المخزون</span>
            </div>

            {/* PRIMARY CTA — above form */}
            <a href="#lp-form" className="lp-cta lp-cta--main">
              👉 للطلب اضغط هنا 👈
            </a>

            {/* Trust icons */}
            <div className="lp-trust-row">
              <div className="lp-trust-item">
                <span>💳</span>
                <div>
                  <p className="lp-trust-title">دفع عند الاستلام</p>
                  <p className="lp-trust-sub">بدون بطاقة بنكية</p>
                </div>
              </div>
              <div className="lp-trust-item">
                <span>🚚</span>
                <div>
                  <p className="lp-trust-title">توصيل مجاني</p>
                  <p className="lp-trust-sub">1 إلى 3 أيام</p>
                </div>
              </div>
              <div className="lp-trust-item">
                <span>🔄</span>
                <div>
                  <p className="lp-trust-title">إرجاع مجاني</p>
                  <p className="lp-trust-sub">خلال 7 أيام</p>
                </div>
              </div>
              <div className="lp-trust-item">
                <span>🛡️</span>
                <div>
                  <p className="lp-trust-title">ضمان سنة</p>
                  <p className="lp-trust-sub">جودة مضمونة</p>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* ── ORDER FORM — directly after hero for max conversion ── */}
        <section className="lp-section" id="lp-form">
          <div className="lp-wrap">
            <div className="lp-form-box">
              <p className="lp-form-title">🛒 أدخل معلوماتك للطلب</p>
              <p className="lp-form-sub">🔒 معلوماتك آمنة 100% — سنتصل بك لتأكيد الطلب</p>
              {formNote && <p className="lp-form-note">{formNote}</p>}
              <OrderFormPublic
                product={product}
                productSlug={slug}
                ctaText={ctaText}
                b1={b1} b2={b2} b3={b3}
                unitLabel={unitLabel}
                cities={digylogCities.length > 0 ? digylogCities : FALLBACK_CITIES}
              />
            </div>
          </div>
        </section>

        {/* ── BENEFITS ── */}
        <section className="lp-section">
          <div className="lp-wrap">
            <h2 className="lp-h2">مميزات المنتج</h2>
            <div className="lp-benefits-grid">
              {benefits.slice(0, 4).map((b, i) => (
                <div key={i} className="lp-benefit-card">
                  <span className="lp-benefit-icon">{b.icon}</span>
                  <p className="lp-benefit-title">{b.title}</p>
                  <p className="lp-benefit-desc">{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── DESCRIPTION ── */}
        {description && (
          <section className="lp-section lp-section--gray">
            <div className="lp-wrap">
              <h2 className="lp-h2">عن المنتج</h2>
              <p className="lp-desc-text">{description}</p>
            </div>
          </section>
        )}

        {/* ── REVIEWS ── */}
        <section className="lp-section">
          <div className="lp-wrap">
            <div className="lp-reviews-header">
              <h2 className="lp-h2" style={{ margin: 0 }}>آراء العملاء</h2>
              <div className="lp-rating">
                <span className="lp-stars">★★★★★</span>
                <span className="lp-rating-num">4.8</span>
                <span className="lp-rating-count">(+200 تقييم)</span>
              </div>
            </div>
            <div className="lp-reviews">
              {reviews.slice(0, 3).map((r, i) => (
                <div key={i} className="lp-review-card">
                  <div className="lp-review-top">
                    <div className="lp-review-info">
                      <span className="lp-avatar">{r.name.charAt(0)}</span>
                      <div>
                        <p className="lp-review-name">{r.name}</p>
                        <p className="lp-review-city">📍 {r.city}</p>
                      </div>
                    </div>
                    <span className="lp-stars" style={{ fontSize: "13px" }}>{"★".repeat(r.stars ?? 5)}</span>
                  </div>
                  <p className="lp-review-text">{r.text}</p>
                  <span className="lp-verified">✓ مشتري موثق</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── URGENCY BANNER ── */}
        <div className="lp-urgency-banner">
          <div className="lp-wrap" style={{ textAlign: "center" }}>
            <p className="lp-urgency-text">⚠️ الكمية محدودة جداً — اطلب الآن!</p>
            <p className="lp-urgency-sub">اطلب الآن — الدفع عند الاستلام</p>
          </div>
        </div>

        {/* ── FAQ ── */}
        <section className="lp-section lp-section--gray">
          <div className="lp-wrap">
            <h2 className="lp-h2">الأسئلة الشائعة</h2>
            <FaqAccordion items={faqItems.slice(0, 5)} />
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section className="lp-final">
          <div className="lp-wrap" style={{ textAlign: "center" }}>
            <p className="lp-final-title">ما تخليش الفرصة تفوتك 🔥</p>
            <p className="lp-final-sub">الكمية محدودة · الدفع عند الاستلام · توصيل مجاني</p>
            <a href="#lp-form" className="lp-cta lp-cta--white">👉 للطلب اضغط هنا 👈</a>
          </div>
        </section>

        <footer className="lp-footer">
          <p>جميع الحقوق محفوظة © {new Date().getFullYear()} HajtekZone</p>
        </footer>

        {/* ── STICKY BOTTOM BAR ── */}
        <div className="lp-sticky">
          <div className="lp-sticky-inner">
            <div className="lp-sticky-info">
              <p className="lp-sticky-name">{product.name}</p>
              <p className="lp-sticky-price">{price.toFixed(0)} <small>درهم</small></p>
            </div>
            <a href="#lp-form" className="lp-sticky-btn">👉 للطلب اضغط هنا</a>
          </div>
        </div>

        {/* ── FLOATING WHATSAPP ── */}
        {whatsapp && (
          <a href={`https://wa.me/${whatsapp.replace(/\+/g, "")}?text=${encodeURIComponent("مرحبا، أريد الاستفسار عن المنتج")}`}
            target="_blank" rel="noopener noreferrer"
            className="lp-wa-float" aria-label="تواصل عبر واتساب">
            <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26">
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
  { icon: "🎬", title: "جودة 4K ممتازة", desc: "صورة واضحة وحادة على أي جدار" },
  { icon: "📡", title: "WiFi + HDMI", desc: "متوافق مع جميع الأجهزة" },
  { icon: "🔊", title: "صوت داخلي قوي", desc: "بدون سماعات إضافية" },
  { icon: "🏠", title: "للمنزل والسفر", desc: "خفيف وسهل الحمل" },
];
const defaultReviews = [
  { name: "محمد أمين", city: "الدار البيضاء", stars: 5, text: "منتج ممتاز، توصل في يومين. الجودة فاقت توقعاتي تماماً. أنصح به بشدة!" },
  { name: "فاطمة الزهراء", city: "مراكش", stars: 5, text: "جربته وما ندمت. الدفع عند الاستلام راحني كثير. الصورة واضحة جداً." },
  { name: "يوسف المرابط", city: "الرباط", stars: 5, text: "قيمة حقيقية بسعر معقول. الطلب وصل بسرعة والتغليف ممتاز." },
];
const defaultFaq = [
  { q: "كيف يتم التوصيل؟", a: "خلال 1-3 أيام لجميع مدن المغرب مجاناً." },
  { q: "هل يمكن إرجاع المنتج؟", a: "نعم، إرجاع مجاني خلال 7 أيام بدون أي شرط." },
  { q: "كيف يتم الدفع؟", a: "الدفع عند الاستلام — لا دفع مسبق، لا بطاقة بنكية." },
  { q: "هل هناك ضمان؟", a: "نعم، ضمان سنة كاملة مع دعم فني على واتساب." },
  { q: "هل يتوفر في مدينتي؟", a: "نعم، نوصل لجميع مدن المغرب بدون استثناء." },
];
