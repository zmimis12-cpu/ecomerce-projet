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
    title:       page.title,
    description: page.description ?? page.product.name,
    robots:      { index: true, follow: false },
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

  // Helper
  const sections = (lp.sections as LPSection[]) ?? [];
  function getSection(type: string): LPSection | null {
    return sections.find((s) => s.type === type && s.enabled !== false) ?? null;
  }

  // Core values
  const price        = product.sale_price_mad;
  const heroHeadline = String(lp.hero_headline    ?? page.title);
  const heroSub      = String(lp.hero_subheadline ?? "توصيل سريع · الدفع عند الاستلام · ضمان الجودة");
  const offerText    = String(lp.offer_text       ?? "");
  const ctaText      = String(lp.cta_text         ?? "اطلب الآن");
  const oldPriceText = String(lp.old_price_text   ?? `${(price * 1.3).toFixed(0)} درهم`);
  const whatsapp     = String(lp.whatsapp_number  ?? "");

  const b1 = Number(lp.bundle_1_price || price);
  const b2 = Number(lp.bundle_2_price || (price * 2 * 0.9).toFixed(2));
  const b3 = Number(lp.bundle_3_price || (price * 3 * 0.8).toFixed(2));

  const primaryImage  = product.images.find((i) => i.is_primary) ?? product.images[0] ?? null;
  const galleryImages = product.images.slice(0, 6);

  // Section data
  const psSection       = getSection("problem_solution");
  const benefitsSection = getSection("benefits");
  const reviewsSection  = getSection("reviews");
  const faqSection      = getSection("faq");
  const formSection     = getSection("order_form");
  const lifestyleSection= getSection("lifestyle");

  const benefits = (benefitsSection?.items as { icon: string; title: string; desc: string }[]) ?? [
    { icon: "✓", title: "جودة ممتازة",  desc: "مضمون ومعتمد" },
    { icon: "✓", title: "توصيل سريع",   desc: "2-4 أيام عمل" },
    { icon: "✓", title: "دعم مستمر",    desc: "فريقنا متاح" },
    { icon: "✓", title: "ضمان سنة",     desc: "استرجاع مجاني" },
  ];
  const reviews = (reviewsSection?.items as { name: string; city: string; stars: number; text: string }[]) ?? [
    { name: "محمد أمين",    city: "الدار البيضاء", stars: 5, text: "منتج ممتاز، توصل في يومين. الجودة فاقت توقعاتي." },
    { name: "فاطمة الزهراء", city: "مراكش",         stars: 5, text: "جربته وما ندمت. الدفع عند الاستلام راحني كثير." },
    { name: "يوسف المرابط",  city: "الرباط",         stars: 5, text: "أنصح به بشدة — قيمة حقيقية بسعر معقول." },
  ];
  const faqItems = (faqSection?.items as { q: string; a: string }[]) ?? [
    { q: "كيف يتم التوصيل؟",       a: "خلال 2-4 أيام لجميع مدن المغرب." },
    { q: "هل يمكن إرجاع المنتج؟",  a: "نعم، إرجاع مجاني خلال 7 أيام." },
    { q: "كيف يتم الدفع؟",         a: "الدفع عند الاستلام — لا دفع مسبق." },
    { q: "هل هناك ضمان؟",          a: "نعم، ضمان سنة كاملة مع دعم فني." },
  ];
  const scenarios = (lifestyleSection?.scenarios as { icon: string; title: string; desc: string }[]) ?? [];
  const formHeadline = String(formSection?.headline ?? "اطلب الآن — الدفع عند الاستلام");
  const formReassurance = String(formSection?.reassurance ?? "معلوماتك آمنة · لا دفع مسبق · توصيل مضمون");

  const CSS = `
    *{box-sizing:border-box;margin:0;padding:0}
    html{scroll-behavior:smooth}
    body{font-family:'Cairo',sans-serif;background:#f8fafc;color:#111827;overflow-x:hidden}
    .wrap{max-width:520px;margin:0 auto;padding:0 16px}
    .card{background:#fff;border-radius:16px;border:1px solid #e5e7eb;
      box-shadow:0 1px 3px rgba(0,0,0,.06),0 4px 12px rgba(0,0,0,.04)}
    .sec{background:#fff;margin-top:8px;padding:28px 0}
    .sec-title{font-size:19px;font-weight:800;color:#111827;
      text-align:center;margin-bottom:20px;line-height:1.3}
    .badge{display:inline-flex;align-items:center;gap:4px;
      background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;
      font-size:12px;font-weight:600;padding:4px 10px;border-radius:9999px}
    .cta{display:block;width:100%;text-align:center;
      background:#16a34a;color:#fff;font-family:'Cairo',sans-serif;
      font-size:17px;font-weight:800;padding:15px 24px;
      border-radius:14px;text-decoration:none;border:none;cursor:pointer;
      transition:background .15s,transform .12s;
      box-shadow:0 3px 14px rgba(22,163,74,.3)}
    .cta:active{transform:scale(.98);background:#15803d}
    .star{color:#f59e0b}
    @media(min-width:640px){.sticky{display:none!important}}
  `;

  return (
    <>
      {page.meta_pixel_id && (
        <script dangerouslySetInnerHTML={{ __html:
          `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${page.meta_pixel_id}');fbq('track','PageView');`
        }} />
      )}
      <style>{CSS}</style>

      <div dir="rtl" lang="ar">

        {/* 1 — OFFER BAR */}
        {offerText && (
          <div style={{ background:"#111827", color:"#fff", textAlign:"center",
            padding:"9px 16px", fontSize:"13px", fontWeight:600 }}>
            {offerText}
          </div>
        )}

        {/* 2 — HERO */}
        <section style={{ background:"#fff", paddingBottom:"28px" }}>
          <div className="wrap" style={{ paddingTop:"20px" }}>

            {/* Emotion hook */}
            {psSection?.story_hook || lp.story_hook ? (
              <p style={{ textAlign:"center", fontSize:"13px", color:"#6b7280",
                fontStyle:"italic", marginBottom:"10px", lineHeight:1.5 }}>
                {String(psSection?.story_hook ?? lp.story_hook ?? "")}
              </p>
            ) : null}

            {/* Headline */}
            <h1 style={{ textAlign:"center", fontSize:"clamp(20px,5.5vw,26px)",
              fontWeight:900, color:"#111827", lineHeight:1.3,
              marginBottom:"8px" }}>
              {heroHeadline}
            </h1>
            <p style={{ textAlign:"center", color:"#4b5563", fontSize:"14px",
              marginBottom:"16px", lineHeight:1.6 }}>
              {heroSub}
            </p>

            {/* Trust badges */}
            <div style={{ display:"flex", justifyContent:"center",
              flexWrap:"wrap", gap:"6px", marginBottom:"18px" }}>
              {["الدفع عند الاستلام","توصيل سريع","ضمان الجودة"].map((b) => (
                <span key={b} className="badge">{b}</span>
              ))}
            </div>

            {/* Product image */}
            {primaryImage && (
              <div style={{ position:"relative", width:"100%", aspectRatio:"1/1",
                borderRadius:"18px", overflow:"hidden",
                boxShadow:"0 4px 24px rgba(0,0,0,.1)", marginBottom:"20px",
                background:"#f3f4f6" }}>
                <Image src={primaryImage.public_url} alt={product.name} fill
                  style={{ objectFit:"cover" }} priority
                  sizes="(max-width:520px) 100vw,520px" unoptimized />
              </div>
            )}

            {/* Price card */}
            <div className="card" style={{ padding:"16px", marginBottom:"18px" }}>
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center" }}>
                <div>
                  <p style={{ color:"#9ca3af", fontSize:"11px", marginBottom:"2px" }}>السعر</p>
                  <div style={{ display:"flex", alignItems:"baseline", gap:"8px" }}>
                    <span style={{ fontSize:"38px", fontWeight:900, color:"#16a34a",
                      lineHeight:1 }}>
                      {price.toFixed(0)}
                    </span>
                    <span style={{ fontSize:"15px", fontWeight:700, color:"#9ca3af" }}>درهم</span>
                    <span style={{ fontSize:"12px", color:"#ef4444",
                      textDecoration:"line-through" }}>
                      {oldPriceText}
                    </span>
                  </div>
                  <p style={{ color:"#16a34a", fontSize:"11px", fontWeight:600,
                    marginTop:"3px" }}>
                    شامل التوصيل المجاني
                  </p>
                </div>
                <StockCounter />
              </div>
            </div>

            <a href="#order-form" className="cta">{ctaText}</a>

            {whatsapp && (
              <a href={`https://wa.me/${whatsapp.replace(/\+/g,"")}`}
                target="_blank" rel="noopener noreferrer"
                style={{ display:"block", width:"100%", textAlign:"center",
                  background:"#25d366", color:"white",
                  fontFamily:"'Cairo',sans-serif", fontSize:"15px", fontWeight:700,
                  padding:"12px 24px", borderRadius:"14px",
                  textDecoration:"none", marginTop:"10px" }}>
                تواصل عبر واتساب
              </a>
            )}

            <p style={{ textAlign:"center", fontSize:"11px", color:"#9ca3af",
              marginTop:"10px" }}>
              لا دفع مسبق · فريقنا يتصل بك للتأكيد
            </p>
          </div>
        </section>

        {/* 3 — PROBLEM */}
        {psSection && (
          <section className="sec" style={{ background:"#fafafa" }}>
            <div className="wrap">
              <h2 className="sec-title">
                {String(psSection.before_title ?? "واش كتعيش هاد المشكل؟")}
              </h2>
              <div className="card" style={{ padding:"18px 20px" }}>
                {((psSection.before_points as string[]) ?? []).map((pt, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start",
                    gap:"10px", padding:"8px 0",
                    borderBottom: i < (psSection.before_points as string[]).length - 1
                      ? "1px solid #f3f4f6" : "none" }}>
                    <span style={{ color:"#ef4444", fontSize:"16px",
                      marginTop:"1px", flexShrink:0 }}>✗</span>
                    <p style={{ fontSize:"14px", color:"#374151",
                      lineHeight:1.5 }}>{pt}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 4 — SOLUTION */}
        {psSection && (
          <section className="sec">
            <div className="wrap">
              <h2 className="sec-title">
                {String(psSection.after_title ?? "الحل وصل")}
              </h2>
              <div className="card" style={{ padding:"18px 20px",
                borderColor:"#bbf7d0", background:"#f0fdf4" }}>
                {((psSection.after_points as string[]) ?? []).map((pt, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start",
                    gap:"10px", padding:"8px 0",
                    borderBottom: i < (psSection.after_points as string[]).length - 1
                      ? "1px solid #dcfce7" : "none" }}>
                    <span style={{ color:"#16a34a", fontSize:"16px",
                      marginTop:"1px", flexShrink:0 }}>✓</span>
                    <p style={{ fontSize:"14px", color:"#166534",
                      lineHeight:1.5, fontWeight:500 }}>{pt}</p>
                  </div>
                ))}
              </div>
              <div style={{ textAlign:"center", marginTop:"18px" }}>
                <a href="#order-form" className="cta"
                  style={{ display:"inline-block", width:"auto",
                    padding:"13px 32px", fontSize:"15px" }}>
                  {ctaText}
                </a>
              </div>
            </div>
          </section>
        )}

        {/* 5 — LIFESTYLE / SCENARIOS */}
        {scenarios.length > 0 && (
          <section className="sec" style={{ background:"#f8fafc" }}>
            <div className="wrap">
              <h2 className="sec-title">
                {String(lifestyleSection?.title ?? "كيفاش يغير حياتك؟")}
              </h2>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
                {scenarios.map((s, i) => (
                  <div key={i} className="card" style={{ padding:"16px",
                    textAlign:"center" }}>
                    <p style={{ fontSize:"28px", marginBottom:"8px" }}>{s.icon}</p>
                    <p style={{ fontWeight:700, color:"#111827", fontSize:"13px",
                      marginBottom:"4px" }}>{s.title}</p>
                    <p style={{ color:"#6b7280", fontSize:"11px",
                      lineHeight:1.4 }}>{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 6 — BENEFITS */}
        <section className="sec">
          <div className="wrap">
            <h2 className="sec-title">مميزات المنتج</h2>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
              {benefits.slice(0, 4).map((b, i) => (
                <div key={i} className="card" style={{ padding:"14px",
                  display:"flex", alignItems:"flex-start", gap:"10px" }}>
                  <span style={{ fontSize:"20px", flexShrink:0, lineHeight:1 }}>{b.icon}</span>
                  <div>
                    <p style={{ fontWeight:700, color:"#111827",
                      fontSize:"13px", marginBottom:"2px" }}>{b.title}</p>
                    <p style={{ color:"#6b7280", fontSize:"11px",
                      lineHeight:1.4 }}>{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 7 — GALLERY */}
        {galleryImages.length > 1 && (
          <section className="sec" style={{ background:"#fafafa" }}>
            <div className="wrap">
              <h2 className="sec-title" style={{ fontSize:"15px" }}>صور المنتج</h2>
              <div style={{ display:"grid",
                gridTemplateColumns:"repeat(3,1fr)", gap:"8px" }}>
                {galleryImages.map((img) => (
                  <div key={img.id} style={{ position:"relative", borderRadius:"12px",
                    overflow:"hidden", aspectRatio:"1/1",
                    background:"#f3f4f6" }}>
                    <Image src={img.public_url} alt={product.name} fill
                      style={{ objectFit:"cover" }} sizes="33vw" unoptimized />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 8 — TRUST STRIP */}
        <section style={{ background:"#111827", marginTop:"8px", padding:"22px 0" }}>
          <div className="wrap">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px" }}>
              {[
                { icon:"💵", t:"الدفع عند الاستلام", d:"لا دفع مسبق إطلاقاً" },
                { icon:"🚀", t:"توصيل 2-4 أيام",    d:"لجميع مدن المغرب" },
                { icon:"📞", t:"تأكيد هاتفي",        d:"فريقنا يتصل بك" },
                { icon:"✓",  t:"ضمان سنة كاملة",    d:"استرجاع مجاني" },
              ].map((item) => (
                <div key={item.t} style={{ display:"flex", alignItems:"center",
                  gap:"10px", background:"rgba(255,255,255,.07)",
                  borderRadius:"12px", padding:"12px" }}>
                  <span style={{ fontSize:"20px", flexShrink:0 }}>{item.icon}</span>
                  <div>
                    <p style={{ fontWeight:700, color:"#fff",
                      fontSize:"12px", marginBottom:"1px" }}>{item.t}</p>
                    <p style={{ color:"#9ca3af", fontSize:"10px" }}>{item.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 9 — REVIEWS */}
        <section className="sec">
          <div className="wrap">
            <div style={{ textAlign:"center", marginBottom:"18px" }}>
              <h2 className="sec-title" style={{ marginBottom:"6px" }}>آراء العملاء</h2>
              <div style={{ display:"flex", justifyContent:"center",
                alignItems:"center", gap:"6px" }}>
                <span className="star" style={{ fontSize:"15px",
                  letterSpacing:"-1px" }}>★★★★★</span>
                <span style={{ fontWeight:800, fontSize:"15px" }}>4.8</span>
                <span style={{ color:"#9ca3af", fontSize:"12px" }}>(+200 تقييم)</span>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
              {reviews.map((r, i) => (
                <div key={i} className="card" style={{ padding:"16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"flex-start", marginBottom:"10px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                      <div style={{ width:"36px", height:"36px", borderRadius:"50%",
                        background:"#16a34a", color:"white",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontWeight:800, fontSize:"14px", flexShrink:0 }}>
                        {r.name.charAt(0)}
                      </div>
                      <div>
                        <p style={{ fontWeight:700, color:"#111827",
                          fontSize:"13px", marginBottom:"1px" }}>{r.name}</p>
                        <p style={{ color:"#9ca3af", fontSize:"11px" }}>{r.city}</p>
                      </div>
                    </div>
                    <span className="star" style={{ fontSize:"12px" }}>
                      {"★".repeat(r.stars ?? 5)}
                    </span>
                  </div>
                  <p style={{ color:"#374151", fontSize:"13px",
                    lineHeight:1.65, marginBottom:"8px" }}>
                    {r.text}
                  </p>
                  <span style={{ color:"#16a34a", fontSize:"11px", fontWeight:600 }}>
                    مشتري موثق
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 10 — BUNDLE OFFERS */}
        <section style={{ background:"#f0fdf4", marginTop:"8px", padding:"28px 0" }}>
          <div className="wrap">
            <h2 className="sec-title">اختر عرضك</h2>
            <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
              {[
                { qty:1, label:"قطعة واحدة",  price:b1, tag:null,      popular:false },
                { qty:2, label:"قطعتين",      price:b2, tag:`وفّر ${(b1*2-b2).toFixed(0)} درهم`,   popular:true  },
                { qty:3, label:"3 قطع",        price:b3, tag:`وفّر ${(b1*3-b3).toFixed(0)} درهم`,   popular:false },
              ].map((offer) => (
                <a key={offer.qty} href="#order-form"
                  style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"center", position:"relative",
                    background: offer.popular ? "#16a34a" : "#fff",
                    border:`2px solid ${offer.popular ? "#16a34a" : "#e5e7eb"}`,
                    borderRadius:"14px", padding:"14px 16px",
                    textDecoration:"none" }}>
                  {offer.popular && (
                    <span style={{ position:"absolute", top:"-11px", right:"14px",
                      background:"#f59e0b", color:"#fff", fontSize:"10px",
                      fontWeight:700, padding:"2px 10px",
                      borderRadius:"9999px" }}>
                      الأوفر
                    </span>
                  )}
                  <div>
                    <p style={{ fontWeight:700, fontSize:"14px", marginBottom:"3px",
                      color: offer.popular ? "#fff" : "#111827" }}>
                      {offer.qty}× — {offer.label}
                    </p>
                    {offer.tag && (
                      <span style={{
                        background: offer.popular ? "rgba(255,255,255,.2)" : "#dcfce7",
                        color: offer.popular ? "#fff" : "#15803d",
                        fontSize:"11px", fontWeight:600,
                        padding:"2px 8px", borderRadius:"9999px" }}>
                        {offer.tag}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize:"21px", fontWeight:900,
                    color: offer.popular ? "#fff" : "#16a34a" }}>
                    {offer.price.toFixed(0)}{" "}
                    <span style={{ fontSize:"12px" }}>درهم</span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* 11 — ORDER FORM */}
        <section id="order-form" className="sec" style={{ paddingBottom:"36px" }}>
          <div className="wrap">
            <h2 className="sec-title">{formHeadline}</h2>
            <p style={{ textAlign:"center", color:"#6b7280", fontSize:"13px",
              marginBottom:"6px" }}>
              أملأ البيانات — فريقنا يتصل بك للتأكيد
            </p>
            <p style={{ textAlign:"center", color:"#16a34a", fontSize:"12px",
              fontWeight:600, marginBottom:"22px" }}>
              {formReassurance}
            </p>
            <OrderFormPublic product={product} productSlug={slug}
              ctaText={ctaText} b1={b1} b2={b2} b3={b3} />
          </div>
        </section>

        {/* 12 — FAQ */}
        <section className="sec" style={{ background:"#fafafa" }}>
          <div className="wrap">
            <h2 className="sec-title">الأسئلة الشائعة</h2>
            <FaqAccordion items={faqItems} />
          </div>
        </section>

        {/* 13 — FINAL CTA */}
        <section style={{ background:"#16a34a", marginTop:"8px", padding:"28px 0" }}>
          <div className="wrap" style={{ textAlign:"center" }}>
            <p style={{ color:"#fff", fontSize:"19px", fontWeight:800,
              marginBottom:"4px" }}>
              ما تخليش الفرصة تفوتك
            </p>
            <p style={{ color:"rgba(255,255,255,.8)", fontSize:"13px",
              marginBottom:"18px" }}>
              الكمية محدودة · الدفع عند الاستلام · توصيل مجاني
            </p>
            <a href="#order-form"
              style={{ display:"inline-block", background:"#fff",
                color:"#16a34a", fontFamily:"'Cairo',sans-serif",
                fontSize:"16px", fontWeight:800, padding:"13px 36px",
                borderRadius:"14px", textDecoration:"none" }}>
              اطلب الآن
            </a>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ background:"#111827", padding:"18px 16px",
          textAlign:"center", marginBottom:"70px" }}>
          <p style={{ color:"#6b7280", fontSize:"11px" }}>
            جميع الحقوق محفوظة © {new Date().getFullYear()}
          </p>
        </footer>

        {/* STICKY BAR — mobile only */}
        <div className="sticky" style={{ position:"fixed", bottom:0, left:0, right:0,
          zIndex:50, background:"#fff", borderTop:"1px solid #e5e7eb",
          padding:"10px 16px 14px",
          boxShadow:"0 -4px 16px rgba(0,0,0,.08)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"12px",
            maxWidth:"520px", margin:"0 auto" }}>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontWeight:700, fontSize:"12px", color:"#111827",
                overflow:"hidden", textOverflow:"ellipsis",
                whiteSpace:"nowrap" }}>
                {product.name}
              </p>
              <p style={{ fontSize:"17px", fontWeight:900, color:"#16a34a",
                lineHeight:1 }}>
                {price.toFixed(0)} <span style={{ fontSize:"11px" }}>درهم</span>
              </p>
            </div>
            <a href="#order-form"
              style={{ flexShrink:0, background:"#16a34a", color:"#fff",
                fontFamily:"'Cairo',sans-serif", fontSize:"14px", fontWeight:800,
                padding:"11px 20px", borderRadius:"12px",
                textDecoration:"none",
                boxShadow:"0 2px 10px rgba(22,163,74,.3)" }}>
              اطلب الآن
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
