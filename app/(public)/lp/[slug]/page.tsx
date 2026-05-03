import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getLandingPage } from "@/lib/public/queries";
import { OrderFormPublic } from "@/components/landing/order-form-public";
import { StockCounter } from "@/components/landing/stock-counter";
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

  // Fetch full landing page data (includes extended fields)
  const { data: lpData } = await supabaseAdmin
    .from("landing_pages")
    .select("*, products(id, name, slug, description, sale_price_mad)")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  const page = await getLandingPage(slug);
  if (!page) notFound();

  supabaseAdmin.rpc("increment_lp_views" as never, { p_slug: slug } as never).then(() => {}, () => {});

  const lp      = (lpData ?? {}) as Record<string, unknown>;
  const product = page.product;
  const sections = (lp.sections as LPSection[]) ?? [];
  const hasSections = sections.length > 0;

  const primaryImage  = product.images.find((i) => i.is_primary) ?? product.images[0] ?? null;
  const galleryImages = product.images.slice(0, 6);

  // Derived values
  const price        = product.sale_price_mad;
  const heroHeadline = String(lp.hero_headline   ?? page.title);
  const heroSub      = String(lp.hero_subheadline ?? page.subtitle ?? `🚀 توصيل سريع + الدفع عند الاستلام`);
  const offerText    = String(lp.offer_text       ?? "عرض محدود — الكميات محدودة!");
  const oldPriceText = String(lp.old_price_text   ?? `${(price * 1.3).toFixed(0)} درهم`);
  // stockText reserved for future use
  // const stockText = String(lp.stock_text ?? "⚠️ المخزون محدود");
  const ctaText      = String(lp.cta_text         ?? "🛒 اطلب الآن");
  const whatsapp     = String(lp.whatsapp_number  ?? "");

  const b1 = Number(lp.bundle_1_price ?? price);
  const b2 = Number(lp.bundle_2_price ?? (price * 2 * 0.9).toFixed(2));
  const b3 = Number(lp.bundle_3_price ?? (price * 3 * 0.8).toFixed(2));

  // Get section data helpers
  function getSection(type: string): LPSection | null {
    return sections.find((s) => s.type === type && s.enabled !== false) ?? null;
  }

  // Default reviews
  const defaultReviews = [
    { name: "فاطمة الزهراء", city: "الدار البيضاء", stars: 5, text: "منتج رائع جداً! توصل في يومين والجودة ممتازة ❤️" },
    { name: "محمد أمين",     city: "مراكش",          stars: 5, text: "نتائج مذهلة. يستحق كل درهم! سأطلب مرة أخرى." },
    { name: "خديجة بنعلي",   city: "فاس",            stars: 5, text: "الدفع عند الاستلام والتوصيل في الوقت المحدد ✅" },
  ];

  const reviewsSection = getSection("reviews");
  const reviews = (reviewsSection?.items as typeof defaultReviews) ?? defaultReviews;

  const benefitsSection = getSection("benefits");
  const defaultBenefits = [
    { icon: "⚡", title: "سريع وفعال",      desc: "نتائج احترافية" },
    { icon: "💪", title: "متين وصامد",       desc: "مصنوع ليدوم سنوات" },
    { icon: "🎯", title: "دقيق ومضمون",      desc: "أداء احترافي" },
    { icon: "🔋", title: "بطارية طويلة",     desc: "10+ ساعات استمرارية" },
    { icon: "📦", title: "طقم كامل",          desc: "كل الملحقات في الصندوق" },
    { icon: "🛡️", title: "ضمان سنة",        desc: "خدمة ما بعد البيع" },
  ];
  const benefits = (benefitsSection?.items as typeof defaultBenefits) ?? defaultBenefits;

  const faqSection = getSection("faq");
  const defaultFaq = [
    { q: "كيفاش يجي التوصيل؟", a: "خلال 2-4 أيام عمل لجميع مدن المغرب." },
    { q: "واش ممكن ترجع المنتج؟", a: "نعم، ضمان الإرجاع خلال 7 أيام." },
    { q: "كيفاش كتدفع؟", a: "الدفع عند الاستلام فقط — ما كتدفعش مسبقاً." },
    { q: "كيفاش تتواصل معنا؟", a: "عبر الهاتف أو واتساب، فريقنا متاح 24/7." },
  ];
  const faqItems = (faqSection?.items as typeof defaultFaq) ?? defaultFaq;

  const psSection = getSection("problem_solution");

  const formSection = getSection("order_form");
  const formHeadline = String(formSection?.headline ?? "🛒 اطلب الآن — الدفع عند الاستلام");
  const formSub      = String(formSection?.sub      ?? "أملا البيانات وفريقنا كيتصل بيك للتأكيد");

  // ── Inline styles shared ──────────────────────────────────────────────────────
  const S = {
    page:    { fontFamily: "'Cairo', sans-serif", overflowX: "hidden" as const, minHeight: "100vh", backgroundColor: "#f9fafb" },
    wrap:    { maxWidth: "520px", margin: "0 auto", padding: "0 16px" },
    section: (bg = "white") => ({ backgroundColor: bg, marginTop: "8px", padding: "28px 0" }),
    h2:      { textAlign: "center" as const, fontSize: "21px", fontWeight: 900, color: "#111827", margin: "0 0 20px" },
    card:    { backgroundColor: "#f9fafb", borderRadius: "16px", padding: "16px", border: "1px solid #f3f4f6" },
    btn:     (bg = "#16a34a") => ({
      display: "block", width: "100%", textAlign: "center" as const,
      backgroundColor: bg, color: "white", fontSize: "19px", fontWeight: 900,
      padding: "17px 24px", borderRadius: "16px", textDecoration: "none",
      boxSizing: "border-box" as const, border: "none", cursor: "pointer",
      fontFamily: "'Cairo', sans-serif",
      boxShadow: `0 4px 20px ${bg}55`,
    }),
  };

  return (
    <>
      {page.meta_pixel_id && (
        <script dangerouslySetInnerHTML={{ __html:
          `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${page.meta_pixel_id}');fbq('track','PageView');`
        }} />
      )}

      <div style={S.page}>
        {/* ── PROMO BAR ── */}
        <div style={{ backgroundColor: "#dc2626", color: "white", textAlign: "center", padding: "10px 16px", fontSize: "13px", fontWeight: 700 }}>
          🔥 {offerText}
        </div>

        {/* ── HERO ── */}
        <section style={{ backgroundColor: "white", paddingBottom: "24px" }}>
          <div style={S.wrap}>
            <div style={{ padding: "20px 0 0" }}>
              {/* Badge */}
              <div style={{ textAlign: "center", marginBottom: "14px" }}>
                <span style={{ display: "inline-block", backgroundColor: "#dc2626", color: "white", padding: "6px 18px", borderRadius: "9999px", fontSize: "13px", fontWeight: 700 }}>
                  🔥 {offerText}
                </span>
              </div>

              {/* Headline */}
              <h1 style={{ textAlign: "center", fontSize: "clamp(20px,5vw,28px)", fontWeight: 900, color: "#111827", lineHeight: 1.35, margin: "0 0 8px" }}>
                {heroHeadline}
              </h1>
              <p style={{ textAlign: "center", color: "#6b7280", fontSize: "15px", margin: "0 0 16px" }}>{heroSub}</p>

              {/* Trust */}
              <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "6px", marginBottom: "18px" }}>
                {["✅ الدفع عند الاستلام", "🚀 توصيل سريع", "⭐ 4.9/5"].map((b) => (
                  <span key={b} style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontSize: "11px", fontWeight: 600, padding: "5px 10px", borderRadius: "9999px" }}>{b}</span>
                ))}
              </div>

              {/* Image */}
              {primaryImage && (
                <div style={{ position: "relative", width: "100%", borderRadius: "16px", overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", marginBottom: "18px", aspectRatio: "1/1", backgroundColor: "#f3f4f6" }}>
                  <Image src={primaryImage.public_url} alt={product.name} fill style={{ objectFit: "cover" }} priority sizes="(max-width:520px) 100vw,520px" unoptimized />
                </div>
              )}

              {/* Price row */}
              <div style={{ backgroundColor: "#f9fafb", borderRadius: "16px", padding: "14px 16px", marginBottom: "18px", border: "1px solid #e5e7eb" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                      <span style={{ fontSize: "36px", fontWeight: 900, color: "#16a34a", lineHeight: 1 }}>{price.toFixed(0)}</span>
                      <span style={{ fontSize: "16px", fontWeight: 700, color: "#9ca3af" }}>درهم</span>
                      <span style={{ fontSize: "13px", color: "#ef4444", textDecoration: "line-through" }}>{oldPriceText}</span>
                    </div>
                    <p style={{ color: "#16a34a", fontSize: "11px", fontWeight: 600, margin: "4px 0 0" }}>✓ شامل التوصيل المجاني</p>
                  </div>
                  <StockCounter />
                </div>
              </div>

              <a href="#order-form" style={S.btn()}>{ctaText}</a>

              {/* WhatsApp button */}
              {whatsapp && (
                <a href={`https://wa.me/${whatsapp.replace(/\+/g, "")}`} target="_blank" rel="noopener noreferrer"
                  style={{ ...S.btn("#25d366"), marginTop: "10px" }}>
                  💬 تواصل عبر واتساب
                </a>
              )}

              <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "12px", fontSize: "11px", color: "#9ca3af", marginTop: "12px" }}>
                <span>🔒 طلب آمن</span><span>🚚 توصيل لجميع المدن</span><span>📞 دعم 24/7</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── PROBLEM / SOLUTION ── */}
        {(!hasSections || psSection) && (
          <section style={S.section()}>
            <div style={S.wrap}>
              <h2 style={S.h2}>{psSection ? String(psSection.before_title ?? "قبل وبعد") : "قبل وبعد 🔄"}</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {[
                  { label: "قبل ❌", color: "#fef2f2", border: "#fecaca", text: "#dc2626",
                    points: (psSection?.before_points as string[]) ?? ["❌ جهد كبير", "❌ نتائج ضعيفة", "❌ تكلفة عالية"] },
                  { label: "بعد ✅", color: "#f0fdf4", border: "#bbf7d0", text: "#16a34a",
                    points: (psSection?.after_points as string[]) ?? ["✅ نتائج فورية", "✅ سهل الاستخدام", "✅ اقتصادي"] },
                ].map((col) => (
                  <div key={col.label} style={{ backgroundColor: col.color, border: `2px solid ${col.border}`, borderRadius: "14px", padding: "14px" }}>
                    <p style={{ fontWeight: 900, color: col.text, fontSize: "14px", margin: "0 0 10px", textAlign: "center" }}>{col.label}</p>
                    {col.points.map((pt, i) => (
                      <p key={i} style={{ fontSize: "12px", color: "#374151", margin: "0 0 5px", lineHeight: 1.4 }}>{pt}</p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── GALLERY ── */}
        {galleryImages.length > 1 && (
          <section style={S.section()}>
            <div style={S.wrap}>
              <p style={{ textAlign: "center", fontSize: "11px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.05em", marginBottom: "12px" }}>صور المنتج</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
                {galleryImages.map((img) => (
                  <div key={img.id} style={{ position: "relative", borderRadius: "12px", overflow: "hidden", aspectRatio: "1/1", backgroundColor: "#f3f4f6" }}>
                    <Image src={img.public_url} alt={product.name} fill style={{ objectFit: "cover" }} sizes="33vw" unoptimized />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── BENEFITS ── */}
        <section style={S.section()}>
          <div style={S.wrap}>
            <h2 style={S.h2}>لماذا تختار هذا المنتج؟ 🏆</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10px" }}>
              {benefits.map((b: { icon: string; title: string; desc: string }, i: number) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", background: "linear-gradient(135deg,#f0fdf4,#ecfdf5)", border: "1px solid #dcfce7", borderRadius: "14px", padding: "12px" }}>
                  <span style={{ fontSize: "22px", flexShrink: 0 }}>{b.icon}</span>
                  <div>
                    <p style={{ fontWeight: 700, color: "#111827", fontSize: "13px", margin: "0 0 2px" }}>{b.title}</p>
                    <p style={{ color: "#6b7280", fontSize: "11px", margin: 0, lineHeight: 1.4 }}>{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── TRUST ── */}
        <section style={{ background: "linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)", marginTop: "8px", padding: "28px 0" }}>
          <div style={S.wrap}>
            <h2 style={{ ...S.h2, color: "white" }}>لماذا نحن الأفضل؟ ✨</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { icon: "💵", title: "الدفع عند الاستلام",  desc: "ما كتدفعش حتى يوصلك المنتج" },
                { icon: "🚀", title: "توصيل سريع 2-4 أيام", desc: "نوصل لجميع مدن المغرب" },
                { icon: "📞", title: "تأكيد عبر الهاتف",    desc: "فريقنا كيتصل بيك خلال ساعات" },
                { icon: "🔄", title: "ضمان الاسترجاع",      desc: "راضٍ أو مستردّ ثمنك كاملاً" },
              ].map((item) => (
                <div key={item.title} style={{ display: "flex", alignItems: "center", gap: "14px", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "14px", padding: "13px 15px" }}>
                  <span style={{ fontSize: "26px", flexShrink: 0 }}>{item.icon}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, color: "white", fontSize: "13px", margin: "0 0 2px" }}>{item.title}</p>
                    <p style={{ color: "#d1d5db", fontSize: "11px", margin: 0 }}>{item.desc}</p>
                  </div>
                  <span style={{ color: "#4ade80", fontSize: "16px" }}>✓</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── REVIEWS ── */}
        <section style={S.section()}>
          <div style={S.wrap}>
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <h2 style={S.h2}>آراء العملاء ⭐</h2>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "#f59e0b", fontSize: "18px" }}>★★★★★</span>
                <span style={{ fontWeight: 900, fontSize: "16px" }}>4.9</span>
                <span style={{ color: "#9ca3af", fontSize: "12px" }}>(+200 تقييم)</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {reviews.map((r: { name: string; city: string; text: string; stars?: number }, idx: number) => (
                <div key={idx} style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "#16a34a", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "14px" }}>
                        {r.name.charAt(0)}
                      </div>
                      <div>
                        <p style={{ fontWeight: 700, color: "#111827", fontSize: "13px", margin: "0 0 1px" }}>{r.name}</p>
                        <p style={{ color: "#9ca3af", fontSize: "11px", margin: 0 }}>{r.city}</p>
                      </div>
                    </div>
                    <span style={{ color: "#f59e0b", fontSize: "13px" }}>{"★".repeat(r.stars ?? 5)}</span>
                  </div>
                  <p style={{ color: "#374151", fontSize: "13px", lineHeight: 1.6, margin: "0 0 6px" }}>&ldquo;{r.text}&rdquo;</p>
                  <span style={{ color: "#16a34a", fontSize: "11px", fontWeight: 700 }}>✓ مشتري موثق</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── BUNDLE OFFERS ── */}
        <section style={S.section("#f0fdf4")}>
          <div style={S.wrap}>
            <h2 style={S.h2}>اختر عرضك 🎁</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { qty: 1, label: "قطعة واحدة",  price: b1, badge: null },
                { qty: 2, label: "قطعتين",      price: b2, badge: "وفّر " + (b1 * 2 - b2).toFixed(0) + " درهم" },
                { qty: 3, label: "3 قطع",        price: b3, badge: "وفّر " + (b1 * 3 - b3).toFixed(0) + " درهم" },
              ].map((offer) => (
                <a key={offer.qty} href="#order-form"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: offer.qty === 3 ? "#16a34a" : "white", border: `2px solid ${offer.qty === 3 ? "#16a34a" : "#e5e7eb"}`, borderRadius: "14px", padding: "14px 16px", textDecoration: "none" }}>
                  <div>
                    <p style={{ fontWeight: 700, color: offer.qty === 3 ? "white" : "#111827", fontSize: "14px", margin: "0 0 2px" }}>{offer.label}</p>
                    {offer.badge && (
                      <span style={{ backgroundColor: offer.qty === 3 ? "rgba(255,255,255,0.2)" : "#dcfce7", color: offer.qty === 3 ? "white" : "#15803d", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px" }}>
                        🎁 {offer.badge}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: "22px", fontWeight: 900, color: offer.qty === 3 ? "white" : "#16a34a" }}>
                    {offer.price.toFixed(0)} <span style={{ fontSize: "13px" }}>درهم</span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section style={S.section()}>
          <div style={S.wrap}>
            <h2 style={S.h2}>الأسئلة الشائعة ❓</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {faqItems.map((item: { q: string; a: string }, idx: number) => (
                <div key={idx} style={{ borderRadius: "12px", border: "1px solid #e5e7eb", overflow: "hidden" }}>
                  <div style={{ padding: "14px 16px", backgroundColor: "#f9fafb" }}>
                    <p style={{ fontWeight: 700, color: "#111827", fontSize: "14px", margin: 0 }}>❓ {item.q}</p>
                  </div>
                  <div style={{ padding: "12px 16px" }}>
                    <p style={{ color: "#4b5563", fontSize: "13px", margin: 0, lineHeight: 1.6 }}>✅ {item.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── ORDER FORM ── */}
        <section id="order-form" style={{ backgroundColor: "white", marginTop: "8px", padding: "32px 0 40px" }}>
          <div style={S.wrap}>
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", backgroundColor: "#16a34a", color: "white", padding: "10px 22px", borderRadius: "9999px", fontSize: "15px", fontWeight: 700, marginBottom: "8px" }}>
                {formHeadline}
              </div>
              <p style={{ color: "#6b7280", fontSize: "13px", margin: 0 }}>{formSub}</p>
            </div>
            <OrderFormPublic
              product={product}
              productSlug={slug}
              ctaText={ctaText}
              b1={b1} b2={b2} b3={b3}
            />
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ backgroundColor: "#111827", padding: "20px 16px", textAlign: "center", marginBottom: "80px" }}>
          <p style={{ color: "#6b7280", fontSize: "12px", margin: "0 0 4px" }}>جميع الحقوق محفوظة © {new Date().getFullYear()}</p>
          <p style={{ color: "#4b5563", fontSize: "11px", margin: 0 }}>🔒 معاملاتك آمنة ومحمية</p>
        </footer>

        {/* ── STICKY CTA ── */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, background: "linear-gradient(to top,white 80%,transparent)", padding: "10px 16px 14px" }}
          className="sm:hidden">
          <a href="#order-form" style={S.btn()}>{ctaText}</a>
        </div>
      </div>
    </>
  );
}
