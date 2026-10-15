import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getLandingPage } from "@/lib/public/queries";
import { OrderFormPublic, FALLBACK_CITIES } from "@/components/landing/order-form-public";
import { normalizeOffers } from "@/lib/landing-pages/offers";
import { getStoreProducts, getBumpsFor } from "@/lib/store/catalog";
import { StoreHeader } from "@/components/store/store-header";
import type { LPSection } from "@/lib/templates";

// Landing page « simple » (style boutique COD rapide) :
// photo → titre → prix → formulaire tout de suite → photos + 1 phrase → re-CTA.
// Utilisée pour TOUTES les /lp/. L'ancienne version longue reste sur /lp-classic/[slug].
export const revalidate = 60;
export const dynamic = "force-static";
export const dynamicParams = true;

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://ecomerce-projet.vercel.app").replace(/\/$/, "");

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getLandingPage(slug);
  if (!page) return { title: "منتج غير موجود", robots: { index: false, follow: false } };
  const image = page.product.images[0]?.public_url;
  return {
    title: page.title,
    description: page.description ?? `${page.product.name} — الدفع عند الاستلام`,
    alternates: { canonical: `${SITE_URL}/lp/${slug}` },
    robots: { index: true, follow: true },
    openGraph: { type: "website", locale: "ar_MA", title: page.title, images: image ? [image] : [] },
  };
}

export default async function LandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [{ data: lpData, error }, page, dg] = await Promise.all([
    supabaseAdmin.from("landing_pages").select("*").eq("slug", slug).eq("is_active", true).maybeSingle(),
    getLandingPage(slug),
    supabaseAdmin.from("digylog_settings").select("config").order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then((r) => r, () => ({ data: null, error: null })),
  ]);
  if (error) throw new Error(`lpData query failed: ${error.message}`);
  if (!page) notFound();

  const [storeProducts, bumps] = await Promise.all([
    getStoreProducts().catch(() => []),
    getBumpsFor(page.product.id).catch(() => []),
  ]);

  const cfg = (dg?.data as { config?: { cities?: string[] } } | null)?.config;
  const cities = Array.isArray(cfg?.cities) && cfg.cities.length > 0 ? cfg.cities : FALLBACK_CITIES;

  const lp = (lpData ?? {}) as Record<string, unknown>;
  const product = page.product;
  const sections = (lp.sections as LPSection[] | undefined) ?? [];
  const sec = (t: string) => sections.find((s) => s.type === t && s.enabled !== false) as (LPSection & Record<string, unknown>) | undefined;

  const price = product.sale_price_mad;
  const oldNum = Number(lp.old_price_num) || parseInt(String(lp.old_price_text ?? "").replace(/[^\d]/g, "")) || price * 1.3;
  const title = String(lp.hero_headline ?? page.title);
  // Textes = ceux de l'éditeur de la landing page (rien d'inventé)
  const subline = String(lp.hero_subheadline ?? "توصيل سريع · الدفع عند الاستلام · ضمان الجودة");
  const offerBar = String(lp.offer_text ?? "");
  const ctaText = String(lp.cta_text ?? "اطلب الآن");
  const formNote = String((sec("order_form")?.reassurance as string | undefined) ?? "معلوماتك محفوظة · لا دفع مسبق · توصيل مضمون");
  const waRaw = String(lp.whatsapp_number ?? "").replace(/[^\d]/g, "");
  const whatsapp = !waRaw ? "" : waRaw.startsWith("00") ? waRaw.slice(2) : waRaw.startsWith("0") ? `212${waRaw.slice(1)}` : waRaw;
  const b1 = Number(lp.bundle_1_price || price);
  const b2 = Number(lp.bundle_2_price || Math.round(price * 2 * 0.9));
  const b3 = Number(lp.bundle_3_price || Math.round(price * 3 * 0.8));

  // Offres X1 / X2 / X3… exactement comme configurées dans l'éditeur
  const offers = normalizeOffers(lp.offers, { price, b1: lp.bundle_1_price as number | null, b2: lp.bundle_2_price as number | null, b3: lp.bundle_3_price as number | null });
  const one = offers.find((o) => o.isDefault) ?? offers[0] ?? { id: "q1", qty: 1, price };
  const oldShown = one.qty > 1 ? price * one.qty : oldNum;

  // Photo principale = photo produit (pas le GIF/vidéo) ; puis photos d'ambiance avec une phrase chacune
  const productImgs = product.images.map((i) => i.public_url).filter(Boolean);
  const mainImg = productImgs[0] ?? (lp.hero_image as string | undefined) ?? null;

  const captions: string[] = [];
  const life = sec("lifestyle")?.scenarios as { title?: string; desc?: string }[] | undefined;
  life?.forEach((x) => x.desc && captions.push(x.desc));
  const ben = sec("benefits")?.items as { title?: string; desc?: string }[] | undefined;
  ben?.forEach((x) => x.desc && captions.push(x.desc));
  const ps = sec("problem_solution");
  (ps?.after_points as string[] | undefined)?.forEach((x) => captions.push(x));

  const storyImgs: string[] = [];
  const add = (u: unknown) => { if (typeof u === "string" && u && u !== mainImg && !storyImgs.includes(u)) storyImgs.push(u); };
  add(lp.hero_image);
  productImgs.slice(1).forEach(add);
  const story = storyImgs.slice(0, 6).map((src, i) => ({ src, text: captions[i] ?? "" }));

  const customerPhotos = ((lp.customer_photos as string[] | undefined) ?? []).slice(0, 6);
  const pixel = page.meta_pixel_id?.trim();
  const tt = page.tiktok_pixel_id?.trim();
  const pname = product.name.replace(/'/g, "\\'");

  return (
    <>
      {pixel && (
        <script dangerouslySetInnerHTML={{ __html:
          `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');${pixel.split(/[,\s]+/).filter(Boolean).map((id) => `fbq('init','${id}',{autoConfig:true});`).join("")}fbq('track','PageView');fbq('track','ViewContent',{content_name:'${pname}',content_ids:['${product.id}'],content_type:'product',value:${price},currency:'MAD'});`
        }} />
      )}
      {tt && (
        <script dangerouslySetInnerHTML={{ __html:
          `!function (w, d, t) {w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<e.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var a=document.createElement("script");a.type="text/javascript",a.async=!0,a.src=i+"?sdkid="+e+"&lib="+t;var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(a,s)};ttq.load('${tt}');ttq.page();ttq.track('ViewContent',{content_id:'${product.id}',content_name:'${pname}',value:${price},currency:'MAD'});}(window, document, 'ttq');`
        }} />
      )}
      <script dangerouslySetInnerHTML={{ __html:
        `document.documentElement.lang="ar";document.documentElement.dir="rtl";try{navigator.sendBeacon("/api/public/lp-view",JSON.stringify({slug:${JSON.stringify(slug)}}))}catch(e){}
        (function(){function go(){var b=document.getElementById('sp-sticky'),f=document.getElementById('sp-form');if(!b||!f||!('IntersectionObserver' in window))return;new IntersectionObserver(function(e){b.classList.toggle('sp-hide',e[0].isIntersecting);},{threshold:0.05}).observe(f);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();})();`
      }} />
      <link rel="preconnect" href="https://nccufqvnxoftzovfsako.supabase.co" />
      <style>{CSS}</style>

      <div className="sp" dir="rtl" lang="ar">
        <div className="sp-top">{offerBar || "🚚 توصيل مجاني · الدفع عند الاستلام"}</div>
        <StoreHeader current={slug} products={storeProducts.map((x) => ({ slug: x.slug, title: x.title, image: x.image, price: x.price }))} />

        <main className="sp-wrap">
          {mainImg && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mainImg} alt={product.name} className="sp-main" fetchPriority="high" loading="eager" decoding="async" />
          )}

          <h1 className="sp-title">{title}</h1>
          <p className="sp-sub">{subline}</p>
          <div className="sp-price">
            <span className="sp-now">{one.price.toFixed(0)} د.م</span>
            {oldShown > one.price && <span className="sp-old">{oldShown.toFixed(0)} د.م</span>}
          </div>

          <div id="sp-form" className="sp-card">
            <p className="sp-note" style={{ marginTop: 0, marginBottom: 12 }}>{formNote}</p>
            <OrderFormPublic product={product} productSlug={slug} ctaText={ctaText}
              b1={b1} b2={b2} b3={b3} offers={offers}
              pixelId={pixel || undefined} tiktokPixelId={tt || undefined}
              variants={(Array.isArray(lp.variant_options) ? lp.variant_options : []) as { name: string; options: { label: string; image?: string }[] }[]}
              bumps={bumps} cities={cities} />
          </div>

          {whatsapp && (
            <a className="sp-wa" target="_blank" rel="noopener noreferrer"
              href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`مرحبا 👋\nأريد الاستفسار عن المنتج التالي:\n\n🛒 المنتج: ${product.name}\n💰 العرض: ${one.qty > 1 ? `${one.qty} قطع بـ ` : ""}${one.price.toFixed(0)} درهم\n📦 الدفع عند الاستلام`)}`}>
              واتساب — تواصل معنا
            </a>
          )}

          {story.map((s, i) => (
            <div key={i} className="sp-story">
              {s.text && <p>{s.text}</p>}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.src} alt="" loading="lazy" decoding="async" />
            </div>
          ))}

          {customerPhotos.length > 0 && (
            <div className="sp-cust">
              <h2>صور من زبنائنا 📸</h2>
              <div className="sp-cust-grid">
                {customerPhotos.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt="" loading="lazy" decoding="async" />
                ))}
              </div>
            </div>
          )}

          <a href="#sp-form" className="sp-btn">{ctaText}</a>
        </main>

        <footer className="sp-foot">
          <a href="/a-propos">من نحن</a> · <a href="/conditions">شروط البيع والاسترجاع</a> · <a href="/confidentialite">سياسة الخصوصية</a>
          <div>HajtekZone © {new Date().getFullYear()}</div>
        </footer>

        <a id="sp-sticky" href="#sp-form" className="sp-sticky">{ctaText}</a>
      </div>
    </>
  );
}

const CSS = `
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;overflow-x:hidden}
body{margin:0;background:#fff;overflow-x:hidden;width:100%;position:relative}
.sp{overflow-x:hidden;width:100%;max-width:100vw;color:#111;font-family:var(--font-cairo),sans-serif;padding-bottom:84px}
.sp-top{background:#111;color:#fff;text-align:center;font-size:13px;font-weight:700;padding:7px 10px}
.sp-wrap{max-width:560px;margin:0 auto;padding:0 16px}
.sp-main{display:block;width:100%;aspect-ratio:1/1;object-fit:contain;background:#f6f6f6;border-radius:14px;margin-top:12px}
.sp-title{font-size:22px;line-height:1.5;font-weight:800;text-align:center;margin:16px 0 6px}
.sp-sub{text-align:center;color:#4b5563;font-size:14.5px;line-height:1.7;margin:0 0 8px}
.sp-wa{display:block;margin:14px 0 0;background:#22c55e;color:#fff;text-align:center;font-weight:800;font-size:16px;padding:13px;border-radius:12px;text-decoration:none}
.sp-price{display:flex;justify-content:center;align-items:baseline;gap:10px;margin-bottom:14px}
.sp-now{color:#15803d;font-size:30px;font-weight:900}
.sp-old{color:#9ca3af;text-decoration:line-through;font-size:16px}
.sp-card{border:2px solid #f59e0b;border-radius:16px;padding:16px 14px;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.06)}
.sp-card-h{text-align:center;font-weight:800;font-size:17px;margin:0 0 12px}
.sp-note{text-align:center;color:#15803d;font-size:12.5px;font-weight:700;margin:10px 0 0}
.sp-story{margin:26px 0 0;text-align:center}
.sp-story p{font-size:16px;font-weight:700;line-height:1.7;margin:0 0 10px}
.sp-story img{display:block;width:100%;border-radius:14px}
.sp-cust{margin-top:30px;text-align:center}
.sp-cust h2{font-size:19px;font-weight:800;margin:0 0 12px}
.sp-cust-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.sp-cust-grid img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:10px}
.sp-btn{display:block;margin:28px 0 8px;background:#f59e0b;color:#fff;text-align:center;font-weight:800;font-size:18px;padding:15px;border-radius:12px;text-decoration:none}
.sp-foot{text-align:center;font-size:12px;color:#6b7280;padding:24px 16px 10px;line-height:2}
.sp-foot a{color:#6b7280}
.sp-sticky{position:fixed;left:12px;right:12px;bottom:12px;z-index:50;background:#16a34a;color:#fff;text-align:center;font-weight:800;font-size:17px;padding:14px;border-radius:12px;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.25);transition:opacity .2s,transform .2s}
.sp-sticky.sp-hide{opacity:0;transform:translateY(120%);pointer-events:none}
@media (min-width:900px){.sp-sticky{max-width:520px;margin:0 auto}}
`;
