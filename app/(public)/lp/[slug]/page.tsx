import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getLandingPage } from "@/lib/public/queries";
import { OrderForm } from "@/components/landing/order-form";
import { StockCounter } from "@/components/landing/stock-counter";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getLandingPage(slug);
  if (!page) return { title: "منتج غير موجود" };
  return {
    title: page.title,
    description: page.description ?? page.product.name,
    robots: { index: true, follow: false },
    openGraph: {
      title: page.title,
      images: page.product.images[0]?.public_url
        ? [page.product.images[0].public_url]
        : [],
    },
  };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await getLandingPage(slug);
  if (!page) notFound();

  // Non-blocking view count
  supabaseAdmin
    .rpc("increment_lp_views" as never, { p_slug: slug } as never)
    .then(() => {}, () => {});

  const product       = page.product;
  const primaryImage  = product.images.find((i) => i.is_primary) ?? product.images[0] ?? null;
  const galleryImages = product.images.slice(0, 6);

  const reviews = [
    { name: "فاطمة الزهراء", city: "الدار البيضاء", stars: 5, text: "منتج رائع جداً، توصل في يومين فقط والجودة ممتازة. أنصح به بشدة 👍" },
    { name: "محمد أمين",     city: "مراكش",          stars: 5, text: "استعملته في البحث عن المعادن وحصلت على نتائج مذهلة. يستحق كل درهم!" },
    { name: "خديجة بنعلي",   city: "فاس",            stars: 5, text: "الدفع عند الاستلام أحسن شيء، ووصل في الوقت المحدد. شكراً جزيلاً ❤️" },
  ];

  const benefits = [
    { icon: "🎯", title: "دقة عالية",       desc: "يكشف المعادن حتى عمق 2 متر" },
    { icon: "🔋", title: "بطارية طويلة",    desc: "يعمل 10+ ساعات على شحن واحد" },
    { icon: "🌧️", title: "مقاوم للماء",    desc: "يشتغل في جميع الظروف الجوية" },
    { icon: "⚡",  title: "سهل الاستخدام", desc: "جاهز للاستخدام مباشرة" },
    { icon: "🎁", title: "طقم كامل",        desc: "سماعات وحقيبة حمل مجانية" },
    { icon: "🛡️", title: "ضمان سنة",       desc: "دعم فني مستمر مضمون" },
  ];

  return (
    <>
      {/* Meta Pixel — inline script, safe in server component */}
      {page.meta_pixel_id && (
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${page.meta_pixel_id}');fbq('track','PageView');`,
          }}
        />
      )}

      <div style={{ fontFamily: "'Cairo', sans-serif", overflowX: "hidden", minHeight: "100vh", backgroundColor: "#f9fafb" }}>

        {/* ── URGENCY BAR ── */}
        <div style={{ backgroundColor: "#dc2626", color: "white", textAlign: "center", padding: "10px 16px", fontSize: "14px", fontWeight: 700 }}>
          🔥 عرض محدود — الكميات محدودة جداً! اطلب قبل نفاد المخزون
        </div>

        {/* ── HERO ── */}
        <section style={{ backgroundColor: "white", paddingBottom: "24px" }}>
          <div style={{ maxWidth: "520px", margin: "0 auto", padding: "24px 16px 0" }}>

            {/* Offer badge */}
            {page.offer_text && (
              <div style={{ textAlign: "center", marginBottom: "16px" }}>
                <span style={{
                  display: "inline-block",
                  backgroundColor: "#dc2626",
                  color: "white",
                  padding: "8px 20px",
                  borderRadius: "9999px",
                  fontSize: "14px",
                  fontWeight: 700,
                }}>
                  🔥 {page.offer_text}
                </span>
              </div>
            )}

            {/* Headline */}
            <h1 style={{
              textAlign: "center",
              fontSize: "clamp(22px, 5vw, 30px)",
              fontWeight: 900,
              color: "#111827",
              lineHeight: 1.35,
              margin: "0 0 8px",
            }}>
              {page.title}
            </h1>

            {page.subtitle && (
              <p style={{ textAlign: "center", color: "#6b7280", fontSize: "16px", margin: "0 0 16px" }}>
                {page.subtitle}
              </p>
            )}

            {/* Trust badges */}
            <div style={{
              display: "flex",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "20px",
            }}>
              {[
                { icon: "✅", label: "توصيل مضمون" },
                { icon: "💵", label: "الدفع عند الاستلام" },
                { icon: "⭐", label: "4.9/5 تقييم" },
              ].map((b) => (
                <span key={b.label} style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  backgroundColor: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  color: "#166534",
                  fontSize: "12px",
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: "9999px",
                }}>
                  {b.icon} {b.label}
                </span>
              ))}
            </div>

            {/* Main image */}
            {primaryImage && (
              <div style={{
                position: "relative",
                width: "100%",
                borderRadius: "16px",
                overflow: "hidden",
                boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
                marginBottom: "20px",
                aspectRatio: "1 / 1",
                backgroundColor: "#f3f4f6",
              }}>
                <Image
                  src={primaryImage.public_url}
                  alt={product.name}
                  fill
                  style={{ objectFit: "cover" }}
                  priority
                  sizes="(max-width: 520px) 100vw, 520px"
                  unoptimized
                />
              </div>
            )}

            {/* Price + Stock row */}
            <div style={{
              backgroundColor: "#f9fafb",
              borderRadius: "16px",
              padding: "16px",
              marginBottom: "20px",
              border: "1px solid #e5e7eb",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ color: "#6b7280", fontSize: "12px", margin: "0 0 2px" }}>السعر</p>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                    <span style={{ fontSize: "38px", fontWeight: 900, color: "#16a34a", lineHeight: 1 }}>
                      {product.sale_price_mad.toFixed(0)}
                    </span>
                    <span style={{ fontSize: "18px", fontWeight: 700, color: "#9ca3af" }}>درهم</span>
                  </div>
                  <p style={{ color: "#16a34a", fontSize: "12px", fontWeight: 600, margin: "4px 0 0" }}>
                    ✓ شامل التوصيل
                  </p>
                </div>
                <StockCounter />
              </div>
            </div>

            {/* CTA button */}
            <a
              href="#order-form"
              style={{
                display: "block",
                width: "100%",
                textAlign: "center",
                backgroundColor: "#16a34a",
                color: "white",
                fontSize: "20px",
                fontWeight: 900,
                padding: "18px 24px",
                borderRadius: "16px",
                textDecoration: "none",
                marginBottom: "12px",
                boxSizing: "border-box",
              }}
            >
              🛒 اطلب الآن — الدفع عند الاستلام
            </a>

            {/* Micro trust */}
            <div style={{
              display: "flex",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: "12px",
              fontSize: "12px",
              color: "#9ca3af",
            }}>
              <span>🔒 طلب آمن 100%</span>
              <span>🚚 توصيل لجميع المدن</span>
              <span>📞 دعم 24/7</span>
            </div>
          </div>
        </section>

        {/* ── GALLERY ── */}
        {galleryImages.length > 1 && (
          <section style={{ backgroundColor: "white", marginTop: "8px", padding: "20px 0" }}>
            <div style={{ maxWidth: "520px", margin: "0 auto", padding: "0 16px" }}>
              <p style={{ textAlign: "center", fontSize: "12px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.05em", marginBottom: "12px" }}>
                صور المنتج
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                {galleryImages.map((img) => (
                  <div key={img.id} style={{
                    position: "relative",
                    borderRadius: "12px",
                    overflow: "hidden",
                    aspectRatio: "1 / 1",
                    backgroundColor: "#f3f4f6",
                  }}>
                    <Image
                      src={img.public_url}
                      alt={product.name}
                      fill
                      style={{ objectFit: "cover" }}
                      sizes="33vw"
                      unoptimized
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── BENEFITS ── */}
        <section style={{ backgroundColor: "white", marginTop: "8px", padding: "24px 0" }}>
          <div style={{ maxWidth: "520px", margin: "0 auto", padding: "0 16px" }}>
            <h2 style={{ textAlign: "center", fontSize: "20px", fontWeight: 900, color: "#111827", marginBottom: "20px" }}>
              لماذا تختار هذا المنتج؟ 🏆
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
              {benefits.map((b) => (
                <div key={b.title} style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  background: "linear-gradient(135deg, #f0fdf4, #ecfdf5)",
                  border: "1px solid #dcfce7",
                  borderRadius: "14px",
                  padding: "14px",
                }}>
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

        {/* ── DESCRIPTION ── */}
        {page.description && (
          <section style={{ backgroundColor: "white", marginTop: "8px", padding: "24px 0" }}>
            <div style={{ maxWidth: "520px", margin: "0 auto", padding: "0 16px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 900, color: "#111827", marginBottom: "12px" }}>
                عن المنتج 📦
              </h2>
              <p style={{ color: "#4b5563", lineHeight: 1.8, fontSize: "15px", whiteSpace: "pre-line", margin: 0 }}>
                {page.description}
              </p>
            </div>
          </section>
        )}

        {/* ── TRUST SECTION ── */}
        <section style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
          marginTop: "8px",
          padding: "28px 0",
        }}>
          <div style={{ maxWidth: "520px", margin: "0 auto", padding: "0 16px" }}>
            <h2 style={{ textAlign: "center", fontSize: "20px", fontWeight: 900, color: "white", marginBottom: "20px" }}>
              لماذا نحن الأفضل؟ ✨
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { icon: "💵", title: "الدفع عند الاستلام",    desc: "ما كتدفعش حتى يوصلك المنتج في يديك" },
                { icon: "🚀", title: "توصيل سريع 2-4 أيام",  desc: "نوصل لجميع مدن المغرب" },
                { icon: "📞", title: "تأكيد عبر الهاتف",      desc: "فريقنا كيتصل بيك خلال ساعات" },
                { icon: "🔄", title: "ضمان الاسترجاع",        desc: "مرتاح — كاين ضمان كامل" },
              ].map((item) => (
                <div key={item.title} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  backgroundColor: "rgba(255,255,255,0.1)",
                  borderRadius: "14px",
                  padding: "14px 16px",
                }}>
                  <span style={{ fontSize: "28px", flexShrink: 0 }}>{item.icon}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, color: "white", fontSize: "14px", margin: "0 0 2px" }}>{item.title}</p>
                    <p style={{ color: "#d1d5db", fontSize: "12px", margin: 0 }}>{item.desc}</p>
                  </div>
                  <span style={{ color: "#4ade80", fontSize: "18px", flexShrink: 0 }}>✓</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── REVIEWS ── */}
        <section style={{ backgroundColor: "white", marginTop: "8px", padding: "28px 0" }}>
          <div style={{ maxWidth: "520px", margin: "0 auto", padding: "0 16px" }}>
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 900, color: "#111827", margin: "0 0 8px" }}>
                آراء العملاء ⭐
              </h2>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "#f59e0b", fontSize: "20px", letterSpacing: "-2px" }}>★★★★★</span>
                <span style={{ fontWeight: 900, fontSize: "18px", color: "#111827" }}>4.9</span>
                <span style={{ color: "#9ca3af", fontSize: "13px" }}>(+200 تقييم)</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {reviews.map((r, idx) => (
                <div key={idx} style={{
                  backgroundColor: "#f9fafb",
                  borderRadius: "16px",
                  padding: "16px",
                  border: "1px solid #f3f4f6",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{
                        width: "38px", height: "38px", borderRadius: "50%",
                        backgroundColor: "#16a34a", color: "white",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 900, fontSize: "15px", flexShrink: 0,
                      }}>
                        {r.name.charAt(0)}
                      </div>
                      <div>
                        <p style={{ fontWeight: 700, color: "#111827", fontSize: "14px", margin: "0 0 1px" }}>{r.name}</p>
                        <p style={{ color: "#9ca3af", fontSize: "12px", margin: 0 }}>{r.city}</p>
                      </div>
                    </div>
                    <span style={{ color: "#f59e0b", fontSize: "14px", letterSpacing: "-1px" }}>
                      {"★".repeat(r.stars)}
                    </span>
                  </div>
                  <p style={{ color: "#374151", fontSize: "14px", lineHeight: 1.6, margin: "0 0 8px" }}>
                    &ldquo;{r.text}&rdquo;
                  </p>
                  <span style={{ color: "#16a34a", fontSize: "12px", fontWeight: 700 }}>✓ مشتري موثق</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── ORDER FORM ── */}
        <section id="order-form" style={{ backgroundColor: "white", marginTop: "8px", padding: "32px 0 40px" }}>
          <div style={{ maxWidth: "520px", margin: "0 auto", padding: "0 16px" }}>
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "#16a34a",
                color: "white",
                padding: "10px 24px",
                borderRadius: "9999px",
                fontSize: "15px",
                fontWeight: 700,
                marginBottom: "10px",
              }}>
                🛒 اطلب الآن — الدفع عند الاستلام
              </div>
              <p style={{ color: "#6b7280", fontSize: "13px", margin: 0 }}>
                أملا البيانات بالأسفل وفريقنا كيتصل بيك للتأكيد
              </p>
            </div>
            <OrderForm product={product} productSlug={slug} />
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{
          backgroundColor: "#111827",
          padding: "20px 16px",
          textAlign: "center",
          marginBottom: "80px",
        }}>
          <p style={{ color: "#6b7280", fontSize: "13px", margin: "0 0 4px" }}>
            جميع الحقوق محفوظة © {new Date().getFullYear()}
          </p>
          <p style={{ color: "#4b5563", fontSize: "12px", margin: 0 }}>
            🔒 معاملاتك آمنة ومحمية
          </p>
        </footer>

        {/* ── STICKY MOBILE CTA ── */}
        <div style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: "linear-gradient(to top, white 80%, transparent)",
          padding: "12px 16px 16px",
        }}
          className="sm:hidden"
        >
          <a
            href="#order-form"
            style={{
              display: "block",
              width: "100%",
              textAlign: "center",
              backgroundColor: "#16a34a",
              color: "white",
              fontSize: "18px",
              fontWeight: 900,
              padding: "16px",
              borderRadius: "14px",
              textDecoration: "none",
              boxSizing: "border-box",
            }}
          >
            🛒 اطلب الآن — {product.sale_price_mad.toFixed(0)} درهم
          </a>
        </div>
      </div>
    </>
  );
}
