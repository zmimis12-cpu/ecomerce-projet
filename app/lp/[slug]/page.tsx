import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getLandingPage } from "@/lib/public/queries";
import { OrderForm } from "@/components/landing/order-form";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const revalidate = 3600; // Re-generate every hour

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
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

export default async function LandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await getLandingPage(slug);
  if (!page) notFound();

  // Increment view count (non-blocking)
  supabaseAdmin.rpc("increment_lp_views" as never, { p_slug: slug } as never).then(() => {}, () => {});

  const product      = page.product;
  const primaryImage = product.images.find((i) => i.is_primary) ?? product.images[0] ?? null;
  const galleryImages = product.images.filter((i) => !i.is_primary).slice(0, 5);

  const benefits = [
    { icon: "💵", label: "الدفع عند الاستلام", desc: "لا حاجة للبطاقة البنكية" },
    { icon: "🚀", label: "توصيل سريع",          desc: "خلال 2-4 أيام عمل" },
    { icon: "📞", label: "تأكيد عبر الهاتف",     desc: "فريقنا يتصل بك للتأكيد" },
    { icon: "✅", label: "ضمان المتابعة",          desc: "تتبع طلبك في كل مراحله" },
  ];

  return (
    <>
      {/* Meta Pixel */}
      {page.meta_pixel_id && (
        <script dangerouslySetInnerHTML={{ __html: `
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
          document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${page.meta_pixel_id}');
          fbq('track', 'PageView');
        ` }} />
      )}

      <div className="min-h-screen bg-gray-50" dir="rtl">
        {/* ── Hero ── */}
        <section className="bg-white">
          <div className="max-w-lg mx-auto px-4 pt-8 pb-6 text-center space-y-4">
            {primaryImage && (
              <div className="relative w-full aspect-square rounded-2xl overflow-hidden shadow-lg">
                <Image
                  src={primaryImage.public_url}
                  alt={product.name}
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 640px) 100vw, 512px"
                  unoptimized
                />
              </div>
            )}

            {page.offer_text && (
              <div className="inline-block bg-red-600 text-white text-sm font-bold px-4 py-1.5 rounded-full animate-pulse">
                🔥 {page.offer_text}
              </div>
            )}

            <h1 className="text-2xl font-extrabold text-gray-900 leading-snug">
              {page.title}
            </h1>

            {page.subtitle && (
              <p className="text-gray-600 text-base">{page.subtitle}</p>
            )}

            <div className="flex items-center justify-center gap-2">
              <span className="text-4xl font-black text-green-600">
                {product.sale_price_mad.toFixed(2)}
              </span>
              <span className="text-xl font-bold text-gray-500">درهم</span>
            </div>

            <a href="#order-form"
              className="block w-full rounded-2xl bg-green-600 text-white text-xl font-bold py-4 hover:bg-green-700 transition-colors shadow-lg shadow-green-200 active:scale-[0.98]">
              🛒 اطلب الآن
            </a>
          </div>
        </section>

        {/* ── Gallery ── */}
        {galleryImages.length > 0 && (
          <section className="bg-white mt-2 py-6">
            <div className="max-w-lg mx-auto px-4">
              <div className="grid grid-cols-3 gap-2">
                {galleryImages.map((img) => (
                  <div key={img.id} className="relative aspect-square rounded-xl overflow-hidden">
                    <Image
                      src={img.public_url}
                      alt={product.name}
                      fill
                      className="object-cover"
                      sizes="33vw"
                      unoptimized
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Description ── */}
        {page.description && (
          <section className="bg-white mt-2 py-6">
            <div className="max-w-lg mx-auto px-4 space-y-3">
              <h2 className="text-xl font-bold text-gray-800">عن المنتج</h2>
              <p className="text-gray-600 leading-relaxed text-base whitespace-pre-line">
                {page.description}
              </p>
            </div>
          </section>
        )}

        {/* ── Benefits ── */}
        <section className="bg-white mt-2 py-6">
          <div className="max-w-lg mx-auto px-4">
            <div className="grid grid-cols-2 gap-3">
              {benefits.map((b) => (
                <div key={b.label} className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center space-y-1">
                  <div className="text-3xl">{b.icon}</div>
                  <p className="font-bold text-sm text-gray-800">{b.label}</p>
                  <p className="text-xs text-gray-500">{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Order Form ── */}
        <section id="order-form" className="bg-white mt-2 py-8">
          <div className="max-w-lg mx-auto px-4">
            <OrderForm product={product} productSlug={slug} />
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="py-6 text-center text-sm text-gray-400">
          <p>جميع الحقوق محفوظة © {new Date().getFullYear()}</p>
        </footer>

        {/* ── Sticky mobile CTA ── */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 px-4 py-3 sm:hidden">
          <a href="#order-form"
            className="block w-full rounded-xl bg-green-600 text-white text-lg font-bold py-4 text-center active:scale-[0.98] transition-transform">
            🛒 اطلب الآن — {product.sale_price_mad.toFixed(0)} درهم
          </a>
        </div>
        {/* Spacer for sticky CTA on mobile */}
        <div className="h-20 sm:hidden" />
      </div>
    </>
  );
}
