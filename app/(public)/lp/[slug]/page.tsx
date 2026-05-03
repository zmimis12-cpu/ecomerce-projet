import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getLandingPage } from "@/lib/public/queries";
import { OrderForm } from "@/components/landing/order-form";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { StockCounter } from "@/components/landing/stock-counter";

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
      title: page.title,
      images: page.product.images[0]?.public_url ? [page.product.images[0].public_url] : [],
    },
  };
}

export default async function LandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getLandingPage(slug);
  if (!page) notFound();

  supabaseAdmin.rpc("increment_lp_views" as never, { p_slug: slug } as never).then(() => {}, () => {});

  const product      = page.product;
  const primaryImage = product.images.find((i) => i.is_primary) ?? product.images[0] ?? null;
  const galleryImages = product.images.slice(0, 6);

  const reviews = [
    { name: "فاطمة الزهراء", city: "الدار البيضاء", stars: 5, text: "منتج رائع جداً، توصل في يومين فقط والجودة ممتازة. أنصح به بشدة 👍" },
    { name: "محمد أمين", city: "مراكش", stars: 5, text: "استعملته في البحث عن المعادن وحصلت على نتائج مذهلة. يستحق كل درهم!" },
    { name: "خديجة بنعلي", city: "فاس", stars: 5, text: "الدفع عند الاستلام أحسن شيء، ووصل في الوقت المحدد. شكراً جزيلاً ❤️" },
  ];

  const benefits = [
    { icon: "🎯", title: "دقة عالية", desc: "يكشف المعادن حتى عمق 2 متر تحت الأرض" },
    { icon: "🔋", title: "بطارية طويلة", desc: "يعمل 10+ ساعات على شحن واحد" },
    { icon: "🌧️", title: "مقاوم للماء", desc: "يشتغل في جميع الظروف الجوية" },
    { icon: "⚡", title: "سهل الاستخدام", desc: "جاهز للاستخدام مباشرة بدون تقنية" },
    { icon: "🎁", title: "طقم كامل", desc: "يجي مع سماعات وحقيبة حمل مجانية" },
    { icon: "🛡️", title: "ضمان سنة", desc: "ضمان شامل مع دعم فني مستمر" },
  ];

  return (
    <>
      {page.meta_pixel_id && (
        <script dangerouslySetInnerHTML={{ __html: `
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
          document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init','${page.meta_pixel_id}');fbq('track','PageView');
        `}} />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
        * { font-family: 'Cairo', sans-serif; }
        html { scroll-behavior: smooth; }
        @keyframes pulse-green {
          0%,100%{box-shadow:0 0 0 0 rgba(22,163,74,0.4)}
          70%{box-shadow:0 0 0 12px rgba(22,163,74,0)}
        }
        .cta-pulse { animation: pulse-green 2s infinite; }
        @keyframes fadeInUp {
          from{opacity:0;transform:translateY(20px)}
          to{opacity:1;transform:translateY(0)}
        }
        .fade-up { animation: fadeInUp 0.6s ease forwards; }
        .fade-up-2 { animation: fadeInUp 0.6s 0.1s ease both; }
        .fade-up-3 { animation: fadeInUp 0.6s 0.2s ease both; }
        @keyframes shimmer {
          0%{background-position:-200% 0}
          100%{background-position:200% 0}
        }
        .shimmer {
          background:linear-gradient(90deg,#16a34a 25%,#15803d 50%,#16a34a 75%);
          background-size:200% auto;
          animation:shimmer 3s linear infinite;
        }
        .star-filled { color:#f59e0b; }
        .badge-shine {
          background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);
        }
      `}</style>

      <div className="min-h-screen bg-gray-50" dir="rtl" lang="ar">

        {/* ── TOP URGENCY BAR ── */}
        <div className="bg-red-600 text-white text-center py-2.5 px-4 text-sm font-bold">
          🔥 عرض محدود — الكميات محدودة جداً! اطلب قبل نفاد المخزون
        </div>

        {/* ── HERO ── */}
        <section className="bg-white">
          <div className="max-w-lg mx-auto px-4 pt-6 pb-8">

            {/* Offer badge */}
            {page.offer_text && (
              <div className="flex justify-center mb-4 fade-up">
                <span className="inline-flex items-center gap-2 bg-red-600 text-white text-sm font-bold px-5 py-2 rounded-full animate-pulse">
                  🔥 {page.offer_text}
                </span>
              </div>
            )}

            {/* Headline */}
            <h1 className="text-3xl font-black text-gray-900 leading-tight text-center mb-2 fade-up-2" style={{lineHeight:'1.3'}}>
              {page.title}
            </h1>
            {page.subtitle && (
              <p className="text-center text-gray-500 text-base mb-4 fade-up-3">{page.subtitle}</p>
            )}

            {/* Trust badges */}
            <div className="flex justify-center gap-2 flex-wrap mb-5 fade-up-3">
              {[
                { icon: "✅", label: "توصيل مضمون" },
                { icon: "💵", label: "الدفع عند الاستلام" },
                { icon: "⭐", label: "4.9/5 تقييم" },
              ].map((b) => (
                <span key={b.label} className="flex items-center gap-1 bg-green-50 border border-green-200 text-green-800 text-xs font-semibold px-3 py-1.5 rounded-full">
                  {b.icon} {b.label}
                </span>
              ))}
            </div>

            {/* Main image */}
            {primaryImage && (
              <div className="relative w-full rounded-2xl overflow-hidden shadow-xl mb-5 bg-gray-100" style={{aspectRatio:'1/1'}}>
                <Image
                  src={primaryImage.public_url}
                  alt={product.name}
                  fill className="object-cover"
                  priority sizes="(max-width:640px) 100vw,512px"
                  unoptimized
                />
              </div>
            )}

            {/* Price + Stock */}
            <div className="bg-gray-50 rounded-2xl p-4 mb-5 border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">السعر</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-black text-green-600">{product.sale_price_mad.toFixed(0)}</span>
                    <span className="text-lg font-bold text-gray-400">درهم</span>
                  </div>
                  <p className="text-xs text-green-600 font-semibold mt-0.5">✓ شامل التوصيل</p>
                </div>
                <div className="text-left">
                  <StockCounter />
                </div>
              </div>
            </div>

            {/* Primary CTA */}
            <a href="#order-form"
              className="cta-pulse shimmer block w-full text-center text-white text-xl font-black py-5 rounded-2xl mb-3 transition-transform active:scale-[0.97]">
              🛒 اطلب الآن — الدفع عند الاستلام
            </a>

            {/* Micro-trust */}
            <div className="flex justify-center items-center gap-4 text-xs text-gray-400">
              <span>🔒 طلب آمن 100%</span>
              <span>•</span>
              <span>🚚 توصيل لجميع المدن</span>
              <span>•</span>
              <span>📞 دعم 24/7</span>
            </div>
          </div>
        </section>

        {/* ── GALLERY ── */}
        {galleryImages.length > 1 && (
          <section className="bg-white mt-2 py-5">
            <div className="max-w-lg mx-auto px-4">
              <p className="text-sm font-bold text-gray-500 text-center mb-3 uppercase tracking-wide">صور المنتج</p>
              <div className="grid grid-cols-3 gap-2">
                {galleryImages.map((img) => (
                  <div key={img.id} className="relative rounded-xl overflow-hidden bg-gray-100" style={{aspectRatio:'1/1'}}>
                    <Image src={img.public_url} alt={product.name} fill
                      className="object-cover hover:scale-105 transition-transform duration-300"
                      sizes="33vw" unoptimized />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── BENEFITS ── */}
        <section className="bg-white mt-2 py-7">
          <div className="max-w-lg mx-auto px-4">
            <h2 className="text-xl font-black text-center text-gray-900 mb-5">
              لماذا تختار هذا المنتج؟ 🏆
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {benefits.map((b) => (
                <div key={b.title}
                  className="flex items-start gap-3 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-xl p-3.5">
                  <span className="text-2xl shrink-0">{b.icon}</span>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{b.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── DESCRIPTION ── */}
        {page.description && (
          <section className="bg-white mt-2 py-6">
            <div className="max-w-lg mx-auto px-4">
              <h2 className="text-xl font-black text-gray-900 mb-4">عن المنتج 📦</h2>
              <div className="prose prose-sm max-w-none">
                <p className="text-gray-600 leading-relaxed text-base whitespace-pre-line">{page.description}</p>
              </div>
            </div>
          </section>
        )}

        {/* ── TRUST SECTION ── */}
        <section className="mt-2 py-7" style={{background:'linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)'}}>
          <div className="max-w-lg mx-auto px-4">
            <h2 className="text-xl font-black text-white text-center mb-5">لماذا نحن الأفضل؟ ✨</h2>
            <div className="space-y-3">
              {[
                { icon: "💵", title: "الدفع عند الاستلام", desc: "ما كتدفعش حتى يوصلك المنتج في يديك" },
                { icon: "🚀", title: "توصيل سريع 2-4 أيام", desc: "نوصل لجميع مدن المغرب" },
                { icon: "📞", title: "تأكيد عبر الهاتف", desc: "فريقنا كيتصل بيك خلال ساعات" },
                { icon: "🔄", title: "ضمان الاسترجاع", desc: "مرتاح — كاين ضمان كامل" },
              ].map((item) => (
                <div key={item.title} className="flex items-center gap-4 bg-white/10 rounded-xl px-4 py-4 backdrop-blur-sm">
                  <span className="text-3xl shrink-0">{item.icon}</span>
                  <div>
                    <p className="font-bold text-white text-sm">{item.title}</p>
                    <p className="text-xs text-gray-300 mt-0.5">{item.desc}</p>
                  </div>
                  <span className="mr-auto text-green-400 text-lg">✓</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── SOCIAL PROOF / REVIEWS ── */}
        <section className="bg-white mt-2 py-7">
          <div className="max-w-lg mx-auto px-4">
            <div className="text-center mb-5">
              <h2 className="text-xl font-black text-gray-900">آراء العملاء ⭐</h2>
              <div className="flex justify-center items-center gap-2 mt-2">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="star-filled text-xl">★</span>
                  ))}
                </div>
                <span className="font-black text-gray-900 text-lg">4.9</span>
                <span className="text-gray-400 text-sm">(+200 تقييم)</span>
              </div>
            </div>

            <div className="space-y-3">
              {reviews.map((r, idx) => (
                <div key={idx} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-full bg-green-600 flex items-center justify-center text-white font-black text-sm shrink-0">
                        {r.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{r.name}</p>
                        <p className="text-xs text-gray-400">{r.city}</p>
                      </div>
                    </div>
                    <div className="flex gap-0.5">
                      {[...Array(r.stars)].map((_, i) => (
                        <span key={i} className="star-filled text-sm">★</span>
                      ))}
                    </div>
                  </div>
                  <p className="text-gray-700 text-sm leading-relaxed">&ldquo;{r.text}&rdquo;</p>
                  <div className="flex items-center gap-1 mt-2">
                    <span className="text-green-600 text-xs font-bold">✓ مشتري موثق</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── ORDER FORM ── */}
        <section id="order-form" className="bg-white mt-2 py-8">
          <div className="max-w-lg mx-auto px-4">
            {/* Form header */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-full text-sm font-bold mb-3">
                🛒 اطلب الآن — الدفع عند الاستلام
              </div>
              <p className="text-gray-500 text-sm">أملا البيانات بالأسفل وفريقنا كيتصل بيك للتأكيد</p>
            </div>
            <OrderForm product={product} productSlug={slug} />
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="bg-gray-900 py-6 text-center">
          <p className="text-gray-400 text-sm">جميع الحقوق محفوظة © {new Date().getFullYear()}</p>
          <p className="text-gray-600 text-xs mt-1">🔒 معاملاتك آمنة ومحمية</p>
        </footer>

        {/* ── STICKY MOBILE CTA ── */}
        <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden"
          style={{background:'linear-gradient(to top, white 85%, transparent)'}}>
          <div className="px-4 pb-4 pt-3">
            <a href="#order-form"
              className="shimmer cta-pulse block w-full text-center text-white text-lg font-black py-4 rounded-2xl active:scale-[0.97] transition-transform">
              🛒 اطلب الآن — {product.sale_price_mad.toFixed(0)} درهم
            </a>
          </div>
        </div>
        <div className="h-24 sm:hidden" />
      </div>
    </>
  );
}
