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

  // Section helpers
  const sections     = (lp.sections as LPSection[]) ?? [];
  function getSection(type: string): LPSection | null {
    return sections.find((s) => s.type === type && s.enabled !== false) ?? null;
  }

  // Core values
  const price        = product.sale_price_mad;
  const heroHeadline = String(lp.hero_headline    ?? page.title);
  const heroSub      = String(lp.hero_subheadline ?? `توصيل سريع · الدفع عند الاستلام · ضمان الجودة`);
  const offerText    = String(lp.offer_text       ?? "");
  const ctaText      = String(lp.cta_text         ?? "اطلب الآن");
  const oldPriceText = String(lp.old_price_text   ?? `${(price * 1.3).toFixed(0)} درهم`);
  const whatsapp     = String(lp.whatsapp_number  ?? "");

  const b1 = Number(lp.bundle_1_price || price);
  const b2 = Number(lp.bundle_2_price || (price * 2 * 0.9).toFixed(2));
  const b3 = Number(lp.bundle_3_price || (price * 3 * 0.8).toFixed(2));

  const primaryImage  = product.images.find((i) => i.is_primary) ?? product.images[0] ?? null;
  const galleryImages = product.images.slice(0, 6);

  // Sections data
  const psSection = getSection("problem_solution");
  const benefitsSection = getSection("benefits");
  const reviewsSection  = getSection("reviews");
  const faqSection      = getSection("faq");
  const formSection     = getSection("order_form");

  const benefits = (benefitsSection?.items as { icon: string; title: string; desc: string }[]) ?? [
    { icon: "✓", title: "جودة ممتازة",      desc: "مضمون ومعتمد" },
    { icon: "✓", title: "توصيل سريع",        desc: "2-4 أيام عمل" },
    { icon: "✓", title: "دعم مستمر",         desc: "فريقنا متاح دائماً" },
    { icon: "✓", title: "ضمان سنة",          desc: "استرجاع مجاني" },
  ];

  const reviews = (reviewsSection?.items as { name: string; city: string; stars: number; text: string }[]) ?? [
    { name: "فاطمة الزهراء", city: "الدار البيضاء", stars: 5, text: "منتج ممتاز، توصل في يومين. الجودة فاقت توقعاتي تماماً." },
    { name: "محمد أمين",     city: "مراكش",          stars: 5, text: "جربته وأنصح به. السعر معقول والنتيجة احترافية." },
    { name: "خديجة بنعلي",   city: "فاس",            stars: 5, text: "الدفع عند الاستلام أهم شيء. وصل في الوقت المحدد." },
  ];

  const faqItems = (faqSection?.items as { q: string; a: string }[]) ?? [
    { q: "كيف يتم التوصيل؟",         a: "خلال 2-4 أيام عمل لجميع مدن المغرب." },
    { q: "هل يمكن إرجاع المنتج؟",    a: "نعم، إرجاع مجاني خلال 7 أيام." },
    { q: "كيف يتم الدفع؟",           a: "الدفع عند الاستلام فقط — لا دفع مسبق." },
    { q: "هل هناك ضمان؟",            a: "نعم، ضمان سنة كاملة مع دعم فني." },
  ];

  const formHeadline = String(formSection?.headline ?? "اطلب الآن — الدفع عند الاستلام");

  // ── Shared CSS vars ────────────────────────────────────────────────────────────
  const CSS = `
    *{box-sizing:border-box;margin:0;padding:0}
    :root{
      --green:#16a34a; --green-dark:#15803d; --green-light:#f0fdf4; --green-border:#bbf7d0;
      --text:#111827; --text-2:#374151; --text-3:#6b7280; --text-4:#9ca3af;
      --bg:#f8fafc; --card:#ffffff; --border:#e5e7eb; --radius:14px;
      --shadow:0 1px 3px rgba(0,0,0,.08),0 4px 12px rgba(0,0,0,.06);
      --shadow-lg:0 4px 16px rgba(0,0,0,.1),0 12px 32px rgba(0,0,0,.08);
    }
    html{scroll-behavior:smooth}
    body{font-family:'Cairo',sans-serif;background:var(--bg);color:var(--text);overflow-x:hidden}
    .wrap{max-width:520px;margin:0 auto;padding:0 16px}
    .card{background:var(--card);border-radius:var(--radius);border:1px solid var(--border);box-shadow:var(--shadow)}
    .btn-green{
      display:block;width:100%;text-align:center;
      background:var(--green);color:#fff;
      font-family:'Cairo',sans-serif;font-size:18px;font-weight:800;
      padding:16px 24px;border-radius:var(--radius);
      text-decoration:none;border:none;cursor:pointer;
      transition:background .15s,transform .1s;
    }
    .btn-green:active{transform:scale(.98);background:var(--green-dark)}
    .section{background:var(--card);margin-top:8px;padding:28px 0}
    .section-title{font-size:20px;font-weight:800;color:var(--text);text-align:center;margin-bottom:20px}
    .badge{display:inline-flex;align-items:center;gap:5px;background:var(--green-light);
      border:1px solid var(--green-border);color:#15803d;
      font-size:12px;font-weight:600;padding:5px 12px;border-radius:9999px}
    .star{color:#f59e0b}
    @media(min-width:640px){.sticky-bar{display:none!important}}
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

        {/* ── 1. OFFER BAR ── */}
        {offerText && (
          <div style={{ background:"#111827", color:"white", textAlign:"center",
            padding:"9px 16px", fontSize:"13px", fontWeight:600, letterSpacing:".01em" }}>
            {offerText}
          </div>
        )}

        {/* ── 2. HERO ── */}
        <section style={{ background:"var(--card)", paddingBottom:"28px" }}>
          <div className="wrap" style={{ paddingTop:"20px" }}>

            {/* Headline */}
            <h1 style={{ fontSize:"clamp(20px,5vw,26px)", fontWeight:900,
              color:"var(--text)", lineHeight:1.35, textAlign:"center",
              marginBottom:"8px" }}>
              {heroHeadline}
            </h1>
            <p style={{ textAlign:"center", color:"var(--text-3)", fontSize:"14px",
              marginBottom:"16px", lineHeight:1.6 }}>
              {heroSub}
            </p>

            {/* Trust badges */}
            <div style={{ display:"flex", justifyContent:"center", flexWrap:"wrap",
              gap:"6px", marginBottom:"18px" }}>
              {["الدفع عند الاستلام", "توصيل سريع", "ضمان الجودة"].map((b) => (
                <span key={b} className="badge">{b}</span>
              ))}
            </div>

            {/* Product image */}
            {primaryImage && (
              <div style={{ position:"relative", width:"100%", aspectRatio:"1/1",
                borderRadius:"16px", overflow:"hidden",
                boxShadow:"var(--shadow-lg)", marginBottom:"20px",
                background:"#f3f4f6" }}>
                <Image src={primaryImage.public_url} alt={product.name}
                  fill style={{ objectFit:"cover" }} priority
                  sizes="(max-width:520px) 100vw,520px" unoptimized />
              </div>
            )}

            {/* Price card */}
            <div className="card" style={{ padding:"16px", marginBottom:"18px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <p style={{ color:"var(--text-3)", fontSize:"12px", marginBottom:"3px" }}>السعر</p>
                  <div style={{ display:"flex", alignItems:"baseline", gap:"8px" }}>
                    <span style={{ fontSize:"38px", fontWeight:900, color:"var(--green)", lineHeight:1 }}>
                      {price.toFixed(0)}
                    </span>
                    <span style={{ fontSize:"16px", fontWeight:700, color:"var(--text-4)" }}>درهم</span>
                    <span style={{ fontSize:"13px", color:"#ef4444", textDecoration:"line-through" }}>
                      {oldPriceText}
                    </span>
                  </div>
                  <p style={{ color:"var(--green)", fontSize:"12px", fontWeight:600, marginTop:"3px" }}>
                    شامل التوصيل المجاني
                  </p>
                </div>
                <StockCounter />
              </div>
            </div>

            <a href="#order-form" className="btn-green">{ctaText}</a>

            {whatsapp && (
              <a href={`https://wa.me/${whatsapp.replace(/\+/g,"")}`}
                target="_blank" rel="noopener noreferrer"
                style={{ display:"block", width:"100%", textAlign:"center",
                  background:"#25d366", color:"white",
                  fontFamily:"'Cairo',sans-serif", fontSize:"15px", fontWeight:700,
                  padding:"13px 24px", borderRadius:"var(--radius)",
                  textDecoration:"none", marginTop:"10px" }}>
                تواصل عبر واتساب
              </a>
            )}
          </div>
        </section>

        {/* ── 3. PROBLEM / SOLUTION ── */}
        {psSection && (
          <section className="section">
            <div className="wrap">
              <h2 className="section-title">هل تعاني من هذا؟</h2>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                <div className="card" style={{ padding:"16px",
                  borderColor:"#fca5a5", background:"#fff7f7" }}>
                  <p style={{ fontWeight:800, color:"#dc2626", fontSize:"13px",
                    marginBottom:"12px", textAlign:"center" }}>
                    قبل
                  </p>
                  {((psSection.before_points as string[]) ?? []).map((pt, i) => (
                    <p key={i} style={{ fontSize:"12px", color:"var(--text-2)",
                      marginBottom:"6px", lineHeight:1.5 }}>
                      {pt}
                    </p>
                  ))}
                </div>
                <div className="card" style={{ padding:"16px",
                  borderColor:"var(--green-border)", background:"var(--green-light)" }}>
                  <p style={{ fontWeight:800, color:"var(--green)", fontSize:"13px",
                    marginBottom:"12px", textAlign:"center" }}>
                    بعد
                  </p>
                  {((psSection.after_points as string[]) ?? []).map((pt, i) => (
                    <p key={i} style={{ fontSize:"12px", color:"var(--text-2)",
                      marginBottom:"6px", lineHeight:1.5 }}>
                      {pt}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── 4. BENEFITS ── */}
        <section className="section">
          <div className="wrap">
            <h2 className="section-title">مميزات المنتج</h2>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
              {benefits.map((b, i) => (
                <div key={i} className="card" style={{ padding:"14px",
                  display:"flex", alignItems:"flex-start", gap:"10px" }}>
                  <span style={{ fontSize:"20px", flexShrink:0, lineHeight:1 }}>{b.icon}</span>
                  <div>
                    <p style={{ fontWeight:700, color:"var(--text)", fontSize:"13px",
                      marginBottom:"2px" }}>{b.title}</p>
                    <p style={{ color:"var(--text-3)", fontSize:"11px",
                      lineHeight:1.4 }}>{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 5. GALLERY ── */}
        {galleryImages.length > 1 && (
          <section className="section">
            <div className="wrap">
              <h2 className="section-title" style={{ fontSize:"16px" }}>صور المنتج</h2>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"8px" }}>
                {galleryImages.map((img) => (
                  <div key={img.id} style={{ position:"relative", borderRadius:"12px",
                    overflow:"hidden", aspectRatio:"1/1", background:"#f3f4f6" }}>
                    <Image src={img.public_url} alt={product.name} fill
                      style={{ objectFit:"cover" }} sizes="33vw" unoptimized />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── 6. TRUST STRIP ── */}
        <section style={{ background:"#111827", marginTop:"8px", padding:"24px 0" }}>
          <div className="wrap">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
              {[
                { icon:"💵", title:"الدفع عند الاستلام",  desc:"لا دفع مسبق" },
                { icon:"🚀", title:"توصيل سريع",          desc:"2-4 أيام عمل" },
                { icon:"📞", title:"تأكيد هاتفي",          desc:"فريقنا يتصل بك" },
                { icon:"✓",  title:"ضمان المتابعة",       desc:"سنة كاملة" },
              ].map((item) => (
                <div key={item.title} style={{ display:"flex", alignItems:"center",
                  gap:"10px", background:"rgba(255,255,255,.07)",
                  borderRadius:"12px", padding:"12px 14px" }}>
                  <span style={{ fontSize:"22px", flexShrink:0 }}>{item.icon}</span>
                  <div>
                    <p style={{ fontWeight:700, color:"white", fontSize:"12px",
                      marginBottom:"1px" }}>{item.title}</p>
                    <p style={{ color:"#9ca3af", fontSize:"11px" }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 7. REVIEWS ── */}
        <section className="section">
          <div className="wrap">
            <div style={{ textAlign:"center", marginBottom:"20px" }}>
              <h2 className="section-title" style={{ marginBottom:"6px" }}>آراء العملاء</h2>
              <div style={{ display:"flex", justifyContent:"center",
                alignItems:"center", gap:"6px" }}>
                <span className="star" style={{ fontSize:"16px" }}>★★★★★</span>
                <span style={{ fontWeight:800, fontSize:"15px" }}>4.9</span>
                <span style={{ color:"var(--text-4)", fontSize:"12px" }}>(+200 تقييم)</span>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
              {reviews.map((r, idx) => (
                <div key={idx} className="card" style={{ padding:"16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"flex-start", marginBottom:"10px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                      <div style={{ width:"36px", height:"36px", borderRadius:"50%",
                        background:"var(--green)", color:"white",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontWeight:800, fontSize:"14px", flexShrink:0 }}>
                        {r.name.charAt(0)}
                      </div>
                      <div>
                        <p style={{ fontWeight:700, color:"var(--text)", fontSize:"13px",
                          marginBottom:"1px" }}>{r.name}</p>
                        <p style={{ color:"var(--text-4)", fontSize:"11px" }}>{r.city}</p>
                      </div>
                    </div>
                    <span className="star" style={{ fontSize:"12px", letterSpacing:"1px" }}>
                      {"★".repeat(r.stars ?? 5)}
                    </span>
                  </div>
                  <p style={{ color:"var(--text-2)", fontSize:"13px", lineHeight:1.65,
                    marginBottom:"8px" }}>
                    {r.text}
                  </p>
                  <span style={{ color:"var(--green)", fontSize:"11px", fontWeight:600 }}>
                    مشتري موثق
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 8. BUNDLE OFFERS ── */}
        <section style={{ background:"var(--green-light)", marginTop:"8px", padding:"28px 0" }}>
          <div className="wrap">
            <h2 className="section-title">اختر عرضك</h2>
            <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
              {[
                { qty:1, label:"قطعة واحدة",  price:b1, popular:false },
                { qty:2, label:"قطعتين",      price:b2, popular:false,
                  saving:`وفّر ${(b1*2-b2).toFixed(0)} درهم` },
                { qty:3, label:"3 قطع",        price:b3, popular:true,
                  saving:`وفّر ${(b1*3-b3).toFixed(0)} درهم` },
              ].map((offer) => (
                <a key={offer.qty} href="#order-form"
                  style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"center",
                    background: offer.popular ? "var(--green)" : "var(--card)",
                    border:`2px solid ${offer.popular ? "var(--green)" : "var(--border)"}`,
                    borderRadius:"var(--radius)", padding:"14px 16px",
                    textDecoration:"none", position:"relative" }}>
                  {offer.popular && (
                    <span style={{ position:"absolute", top:"-10px", right:"14px",
                      background:"#f59e0b", color:"white", fontSize:"10px",
                      fontWeight:700, padding:"2px 10px", borderRadius:"9999px" }}>
                      الأوفر
                    </span>
                  )}
                  <div>
                    <p style={{ fontWeight:700,
                      color: offer.popular ? "white" : "var(--text)",
                      fontSize:"14px", marginBottom:"3px" }}>
                      {offer.qty}× — {offer.label}
                    </p>
                    {offer.saving && (
                      <span style={{ background: offer.popular
                          ? "rgba(255,255,255,.2)" : "var(--green-light)",
                        color: offer.popular ? "white" : "var(--green)",
                        fontSize:"11px", fontWeight:600,
                        padding:"2px 8px", borderRadius:"9999px" }}>
                        {offer.saving}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize:"22px", fontWeight:900,
                    color: offer.popular ? "white" : "var(--green)" }}>
                    {offer.price.toFixed(0)}{" "}
                    <span style={{ fontSize:"12px" }}>درهم</span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ── 9. ORDER FORM ── */}
        <section id="order-form" className="section" style={{ paddingBottom:"36px" }}>
          <div className="wrap">
            <h2 className="section-title">{formHeadline}</h2>
            <p style={{ textAlign:"center", color:"var(--text-3)", fontSize:"13px",
              marginBottom:"24px" }}>
              أملأ البيانات وسيتصل بك فريقنا للتأكيد
            </p>
            <OrderFormPublic
              product={product} productSlug={slug}
              ctaText={ctaText} b1={b1} b2={b2} b3={b3}
            />
          </div>
        </section>

        {/* ── 10. FAQ ── */}
        <section className="section">
          <div className="wrap">
            <h2 className="section-title">الأسئلة الشائعة</h2>
            <FaqAccordion items={faqItems} />
          </div>
        </section>

        {/* ── 11. FINAL CTA ── */}
        <section style={{ background:"var(--green)", marginTop:"8px", padding:"28px 0" }}>
          <div className="wrap" style={{ textAlign:"center" }}>
            <p style={{ color:"white", fontSize:"20px", fontWeight:800,
              marginBottom:"6px" }}>
              {ctaText}
            </p>
            <p style={{ color:"rgba(255,255,255,.8)", fontSize:"13px",
              marginBottom:"20px" }}>
              الدفع عند الاستلام · توصيل مجاني · ضمان سنة
            </p>
            <a href="#order-form"
              style={{ display:"inline-block", background:"white",
                color:"var(--green)", fontFamily:"'Cairo',sans-serif",
                fontSize:"17px", fontWeight:800, padding:"14px 36px",
                borderRadius:"var(--radius)", textDecoration:"none" }}>
              اطلب الآن
            </a>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ background:"#111827", padding:"20px 16px",
          textAlign:"center", marginBottom:"72px" }}>
          <p style={{ color:"#6b7280", fontSize:"12px" }}>
            جميع الحقوق محفوظة © {new Date().getFullYear()}
          </p>
        </footer>

        {/* ── STICKY BOTTOM BAR (mobile only) ── */}
        <div className="sticky-bar" style={{ position:"fixed", bottom:0, left:0, right:0,
          zIndex:50, background:"white", borderTop:"1px solid var(--border)",
          padding:"10px 16px 14px",
          boxShadow:"0 -4px 16px rgba(0,0,0,.08)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"12px",
            maxWidth:"520px", margin:"0 auto" }}>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontWeight:700, fontSize:"13px", color:"var(--text)",
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {product.name}
              </p>
              <p style={{ fontSize:"17px", fontWeight:900, color:"var(--green)",
                lineHeight:1 }}>
                {price.toFixed(0)} <span style={{ fontSize:"12px" }}>درهم</span>
              </p>
            </div>
            <a href="#order-form"
              style={{ flexShrink:0, background:"var(--green)", color:"white",
                fontFamily:"'Cairo',sans-serif", fontSize:"15px", fontWeight:800,
                padding:"12px 22px", borderRadius:"12px",
                textDecoration:"none" }}>
              اطلب الآن
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
