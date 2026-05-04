import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getLandingPage } from "@/lib/public/queries";
import { OrderFormPublic } from "@/components/landing/order-form-public";
import { StockCounter } from "@/components/landing/stock-counter";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import type { LPSection } from "@/lib/templates";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getLandingPage(slug);
  if (!page) return { title: "منتج غير موجود" };
  return {
    title: page.title,
    description: page.description ?? page.product.name,
    robots: { index: true, follow: false },
    openGraph: {
      title:  page.title,
      images: page.product.images[0]?.public_url ? [page.product.images[0].public_url] : [],
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
  const oldPrice  = String(lp.old_price_text   ?? `${(price * 1.3).toFixed(0)} درهم`);
  const whatsapp  = String(lp.whatsapp_number  ?? "");
  const b1 = Number(lp.bundle_1_price || price);
  const b2 = Number(lp.bundle_2_price || (price * 2 * 0.9).toFixed(2));
  const b3 = Number(lp.bundle_3_price || (price * 3 * 0.8).toFixed(2));

  const primary   = product.images.find((i) => i.is_primary) ?? product.images[0] ?? null;
  const gallery   = product.images.slice(0, 6);

  const psSection   = getSection("problem_solution");
  const benSection  = getSection("benefits");
  const revSection  = getSection("reviews");
  const faqSection  = getSection("faq");
  const lifeSection = getSection("lifestyle");
  const formSection = getSection("order_form");

  type Benefit  = { icon: string; title: string; desc: string };
  type Review   = { name: string; city: string; stars: number; text: string };
  type FaqItem  = { q: string; a: string };
  type Scenario = { icon: string; title: string; desc: string };

  const benefits:  Benefit[]  = (benSection?.items  as Benefit[])  ?? defaultBenefits;
  const reviews:   Review[]   = (revSection?.items  as Review[])   ?? defaultReviews;
  const faqItems:  FaqItem[]  = (faqSection?.items  as FaqItem[])  ?? defaultFaq;
  const scenarios: Scenario[] = (lifeSection?.scenarios as Scenario[]) ?? [];

  const formTitle = String(formSection?.headline ?? "اطلب الآن — الدفع عند الاستلام");
  const formNote  = String(formSection?.reassurance ?? "معلوماتك محفوظة · لا دفع مسبق · توصيل مضمون");

  return (
    <>
      {page.meta_pixel_id && (
        <script dangerouslySetInnerHTML={{ __html:
          `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${page.meta_pixel_id}');fbq('track','PageView');`
        }} />
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

            {/* Hero image */}
            {primary && (
              <div className="lp-img-wrap">
                <Image src={primary.public_url} alt={product.name} fill
                  className="lp-img" priority
                  sizes="(max-width:600px) 100vw,(max-width:900px) 80vw,560px"
                  unoptimized />
              </div>
            )}

            {/* Price row */}
            <div className="lp-price-card">
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

        {/* ── PROBLEM ── */}
        {psSection && (
          <section className="lp-section lp-section--gray">
            <div className="lp-wrap">
              <h2 className="lp-h2">
                {String(psSection.before_title ?? "واش كتعيش هاد المشكل؟")}
              </h2>
              <div className="lp-card">
                {((psSection.before_points as string[]) ?? []).map((pt, i, arr) => (
                  <div key={i} className={`lp-check-row ${i < arr.length - 1 ? "lp-check-row--border" : ""}`}>
                    <span className="lp-x">✗</span>
                    <p className="lp-check-text">{pt}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── SOLUTION ── */}
        {psSection && (
          <section className="lp-section">
            <div className="lp-wrap">
              <h2 className="lp-h2">
                {String(psSection.after_title ?? "الحل وصل")}
              </h2>
              <div className="lp-card lp-card--green">
                {((psSection.after_points as string[]) ?? []).map((pt, i, arr) => (
                  <div key={i} className={`lp-check-row ${i < arr.length - 1 ? "lp-check-row--border-g" : ""}`}>
                    <span className="lp-tick">✓</span>
                    <p className="lp-check-text lp-check-text--g">{pt}</p>
                  </div>
                ))}
              </div>
              <div style={{ textAlign:"center", marginTop:"20px" }}>
                <a href="#lp-form" className="lp-cta" style={{ display:"inline-block",
                  width:"auto", padding:"13px 36px", fontSize:"15px" }}>
                  {ctaText}
                </a>
              </div>
            </div>
          </section>
        )}

        {/* ── LIFESTYLE SCENARIOS ── */}
        {scenarios.length > 0 && (
          <section className="lp-section lp-section--gray">
            <div className="lp-wrap">
              <h2 className="lp-h2">
                {String(lifeSection?.title ?? "كيفاش يغير حياتك؟")}
              </h2>
              <div className="lp-grid-2">
                {scenarios.map((s, i) => (
                  <div key={i} className="lp-card lp-scenario">
                    <span className="lp-scenario-icon">{s.icon}</span>
                    <p className="lp-scenario-title">{s.title}</p>
                    <p className="lp-scenario-desc">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── BENEFITS ── */}
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

        {/* ── GALLERY ── */}
        {gallery.length > 1 && (
          <section className="lp-section lp-section--gray">
            <div className="lp-wrap">
              <h2 className="lp-h2" style={{ fontSize:"16px" }}>صور المنتج</h2>
              <div className="lp-gallery">
                {gallery.map((img) => (
                  <div key={img.id} className="lp-gallery-item">
                    <Image src={img.public_url} alt={product.name} fill
                      style={{ objectFit:"cover" }} sizes="33vw" unoptimized />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── TRUST STRIP ── */}
        <section className="lp-trust">
          <div className="lp-wrap">
            <div className="lp-grid-2">
              {[
                { icon:"💵", t:"الدفع عند الاستلام", d:"لا دفع مسبق إطلاقاً" },
                { icon:"🚀", t:"توصيل 2-4 أيام",     d:"لجميع مدن المغرب" },
                { icon:"📞", t:"تأكيد هاتفي",         d:"فريقنا يتصل بك" },
                { icon:"✓",  t:"ضمان سنة كاملة",     d:"استرجاع مجاني" },
              ].map((item) => (
                <div key={item.t} className="lp-trust-item">
                  <span className="lp-trust-icon">{item.icon}</span>
                  <div>
                    <p className="lp-trust-title">{item.t}</p>
                    <p className="lp-trust-desc">{item.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── REVIEWS ── */}
        <section className="lp-section">
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
              {reviews.map((r, i) => (
                <div key={i} className="lp-card lp-review">
                  <div className="lp-review-top">
                    <div className="lp-review-info">
                      <span className="lp-avatar">{r.name.charAt(0)}</span>
                      <div>
                        <p className="lp-review-name">{r.name}</p>
                        <p className="lp-review-city">{r.city}</p>
                      </div>
                    </div>
                    <span className="lp-stars" style={{ fontSize:"12px" }}>
                      {"★".repeat(r.stars ?? 5)}
                    </span>
                  </div>
                  <p className="lp-review-text">{r.text}</p>
                  <span className="lp-verified">مشتري موثق</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── BUNDLE OFFERS ── */}
        <section className="lp-section lp-section--green-light">
          <div className="lp-wrap">
            <h2 className="lp-h2">اختر عرضك</h2>
            <div className="lp-bundles">
              {[
                { qty:1, label:"قطعة واحدة",  price:b1, tag:null,     pop:false },
                { qty:2, label:"قطعتين",      price:b2,
                  tag:`وفّر ${(b1*2-b2).toFixed(0)} درهم`, pop:true  },
                { qty:3, label:"3 قطع — عرض عائلي", price:b3,
                  tag:`وفّر ${(b1*3-b3).toFixed(0)} درهم`, pop:false },
              ].map((o) => (
                <a key={o.qty} href="#lp-form"
                  className={`lp-bundle ${o.pop ? "lp-bundle--pop" : ""}`}>
                  {o.pop && <span className="lp-bundle-badge">الأوفر</span>}
                  <div className="lp-bundle-left">
                    <span className="lp-bundle-label">{o.qty}× — {o.label}</span>
                    {o.tag && (
                      <span className={`lp-bundle-tag ${o.pop ? "lp-bundle-tag--pop" : ""}`}>
                        {o.tag}
                      </span>
                    )}
                  </div>
                  <span className="lp-bundle-price">
                    {o.price.toFixed(0)}{" "}
                    <small>درهم</small>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ── ORDER FORM ── */}
        <section id="lp-form" className="lp-section" style={{ paddingBottom:"40px" }}>
          <div className="lp-wrap">
            <h2 className="lp-h2">{formTitle}</h2>
            <p className="lp-form-note green">{formNote}</p>
            <OrderFormPublic product={product} productSlug={slug}
              ctaText={ctaText} b1={b1} b2={b2} b3={b3} />
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="lp-section lp-section--gray">
          <div className="lp-wrap">
            <h2 className="lp-h2">الأسئلة الشائعة</h2>
            <FaqAccordion items={faqItems} />
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
      </div>
    </>
  );
}

// ── Defaults ──────────────────────────────────────────────────────────────────
const defaultBenefits = [
  { icon:"✓", title:"جودة ممتازة",  desc:"مضمون ومعتمد" },
  { icon:"✓", title:"توصيل سريع",   desc:"2-4 أيام عمل" },
  { icon:"✓", title:"دعم مستمر",    desc:"فريقنا متاح" },
  { icon:"✓", title:"ضمان سنة",     desc:"استرجاع مجاني" },
];
const defaultReviews = [
  { name:"محمد أمين",     city:"الدار البيضاء", stars:5, text:"منتج ممتاز، توصل في يومين. الجودة فاقت توقعاتي تماماً." },
  { name:"فاطمة الزهراء", city:"مراكش",          stars:5, text:"جربته وما ندمت. الدفع عند الاستلام راحني كثير." },
  { name:"يوسف المرابط",  city:"الرباط",          stars:5, text:"أنصح به — قيمة حقيقية بسعر معقول." },
];
const defaultFaq = [
  { q:"كيف يتم التوصيل؟",      a:"خلال 2-4 أيام لجميع مدن المغرب." },
  { q:"هل يمكن إرجاع المنتج؟", a:"نعم، إرجاع مجاني خلال 7 أيام." },
  { q:"كيف يتم الدفع؟",        a:"الدفع عند الاستلام — لا دفع مسبق." },
  { q:"هل هناك ضمان؟",         a:"نعم، ضمان سنة كاملة مع دعم فني." },
];

// ── Global CSS — single source of truth ──────────────────────────────────────
const GLOBAL_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
  body{font-family:'Cairo',sans-serif;background:#f7f8fa;color:#111827;overflow-x:hidden}

  /* ── Layout ── */
  .lp-root{min-height:100vh}
  .lp-wrap{max-width:580px;margin:0 auto;padding:0 16px}

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

  /* ── Hero image ── */
  .lp-img-wrap{position:relative;width:100%;aspect-ratio:1/1;
    border-radius:18px;overflow:hidden;
    box-shadow:0 4px 24px rgba(0,0,0,.09);
    margin-bottom:18px;background:#f3f4f6;}
  .lp-img{object-fit:cover}

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
    background:#16a34a;color:#fff;
    font-family:'Cairo',sans-serif;
    font-size:clamp(15px,4vw,17px);font-weight:800;
    padding:15px 24px;border-radius:14px;
    text-decoration:none;border:none;cursor:pointer;
    box-shadow:0 3px 14px rgba(22,163,74,.28);
    transition:background .15s,transform .1s;
  }
  .lp-cta:active{transform:scale(.98);background:#15803d}
  .lp-cta--white{
    background:#fff;color:#16a34a;
    display:inline-block;width:auto;
    padding:13px 40px;margin-top:6px;
    box-shadow:none;
  }
  .lp-wa{
    display:block;width:100%;text-align:center;
    background:#25d366;color:#fff;
    font-family:'Cairo',sans-serif;
    font-size:14px;font-weight:700;
    padding:12px 24px;border-radius:14px;
    text-decoration:none;margin-top:10px;
  }

  /* ── Cards ── */
  .lp-card{
    background:#fff;border-radius:14px;
    border:1px solid #e5e7eb;
    box-shadow:0 1px 3px rgba(0,0,0,.05),0 4px 10px rgba(0,0,0,.03);
    padding:16px 18px;
  }
  .lp-card--green{
    background:#f0fdf4;border-color:#bbf7d0;
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
    font-family:'Cairo',sans-serif;
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
    font-family:'Cairo',sans-serif;font-size:14px;font-weight:800;
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
