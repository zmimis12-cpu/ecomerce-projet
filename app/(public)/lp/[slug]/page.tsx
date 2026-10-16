import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getLandingPage } from "@/lib/public/queries";
import { OrderFormPublic, FALLBACK_CITIES } from "@/components/landing/order-form-public";
import { normalizeOffers } from "@/lib/landing-pages/offers";
import { getStoreProducts, getBumpsFor } from "@/lib/store/catalog";
import { StoreHeader } from "@/components/store/store-header";
import type { LPSection } from "@/lib/templates";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import { CrossSell } from "@/components/store/cross-sell";

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

  // ── Données (toutes viennent de l'éditeur de la landing page) ──
  const productImgs = product.images.map((i) => i.public_url).filter(Boolean);
  const heroImg = productImgs[0] ?? (lp.hero_image as string | undefined) ?? null;
  const discount = oldShown > one.price ? Math.round((1 - one.price / oldShown) * 100) : 0;

  type Ico = { icon?: string; title?: string; desc?: string; label?: string };
  const ben = (sec("benefits")?.items as Ico[] | undefined) ?? [];
  // Rangée d'icônes sous la photo : texte court (desc) de chaque avantage
  const quick = ben.slice(0, 4).map((b) => ({ icon: b.icon ?? "✓", text: b.desc || b.title || "" }));
  const lifeSec = sec("lifestyle");
  const why = ((lifeSec?.scenarios as Ico[] | undefined) ?? []).slice(0, 4);
  const whyTitle = String(lifeSec?.title ?? `لماذا تختار ${product.name}؟`);
  const ps = sec("problem_solution");
  const featureImg = productImgs[1] ?? (lp.hero_image as string | undefined);
  const featureTitle = String(lp.subtitle ?? ps?.after_title ?? title);
  const featureText = ben[0]?.title ?? subline;
  const tiles = productImgs.slice(2, 5).map((src, i) => ({ src, text: ben[i + 1]?.desc ?? "" }));
  const moreImgs = productImgs.slice(5);

  const revSec = sec("reviews");
  const reviews = ((revSec?.items as { name: string; city: string; stars: number; text: string }[] | undefined) ?? []);
  const customerPhotos = (lp.customer_photos as string[] | undefined) ?? [];
  const faqItems = ((sec("faq")?.items as { q: string; a: string }[] | undefined) ?? []);
  const gty = ((sec("guarantees")?.items as Ico[] | undefined) ?? []).slice(0, 4);

  const pixel = page.meta_pixel_id?.trim();
  const tt = page.tiktok_pixel_id?.trim();
  const pname = product.name.replace(/'/g, "\\'");
  const waHref = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`مرحبا 👋\nأريد الاستفسار عن المنتج التالي:\n\n🛒 المنتج: ${product.name}\n💰 العرض: ${one.qty > 1 ? `${one.qty} قطع بـ ` : ""}${one.price.toFixed(0)} درهم\n📦 الدفع عند الاستلام`)}` : "";

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
        {offerBar && <div className="sp-top">{offerBar}</div>}
        <StoreHeader current={slug} products={storeProducts.map((x) => ({ slug: x.slug, title: x.title, image: x.image, price: x.price }))} />

        {/* 1. Photo produit */}
        {heroImg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroImg} alt={product.name} className="sp-hero" fetchPriority="high" loading="eager" decoding="async" />
        )}

        <main className="sp-wrap">
          {/* 2. Icônes rapides */}
          {quick.length > 0 && (
            <div className="sp-quick">
              {quick.map((q, i) => (
                <div key={i} className="sp-quick-i"><span className="sp-ico">{q.icon}</span><span>{q.text}</span></div>
              ))}
            </div>
          )}

          {/* 3. Prix + formulaire directement */}
          <div id="sp-form" className="sp-card">
            <div className="sp-badges">
              <span className="sp-b-red">عرض خاص</span>
              {discount > 0 && <span className="sp-b-yel">تخفيض {discount}%</span>}
            </div>
            <h1 className="sp-title">{title}</h1>
            <div className="sp-price">
              <span className="sp-now">{one.price.toFixed(0)} DH</span>
              {oldShown > one.price && <span className="sp-old">{oldShown.toFixed(0)} DH</span>}
            </div>
            <div className="sp-cod">🚚 التوصيل لجميع المدن | الدفع عند الاستلام</div>
            <p className="sp-order-h">🛒 اطلب الآن</p>
            <p className="sp-order-sub">{formNote}</p>
            <OrderFormPublic product={product} productSlug={slug} ctaText={ctaText}
              b1={b1} b2={b2} b3={b3} offers={offers} askAddress
              pixelId={pixel || undefined} tiktokPixelId={tt || undefined}
              variants={(Array.isArray(lp.variant_options) ? lp.variant_options : []) as { name: string; options: { label: string; image?: string }[] }[]}
              bumps={bumps} cities={cities} />
            {waHref && <a className="sp-wa" href={waHref} target="_blank" rel="noopener noreferrer">واتساب — تواصل معنا</a>}
          </div>

          {/* 4. Pourquoi ce produit */}
          {why.length > 0 && (
            <section className="sp-sec">
              <h2 className="sp-h2">{whyTitle}</h2>
              <p className="sp-h2-sub">{subline}</p>
              <div className="sp-why">
                {why.map((w, i) => (
                  <div key={i} className="sp-why-i">
                    <span className="sp-ico sp-ico-lg">{w.icon}</span>
                    <b>{w.title}</b>
                    <span>{w.desc}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 5. Image + texte */}
          {featureImg && (
            <section className="sp-feature">
              <div className="sp-feature-txt">
                <h3>{featureTitle}</h3>
                <p>{featureText}</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={featureImg} alt="" loading="lazy" decoding="async" />
            </section>
          )}

          {/* 6. 3 photos avec légende */}
          {tiles.length > 0 && (
            <div className="sp-tiles">
              {tiles.map((t, i) => (
                <div key={i} className="sp-tile">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.src} alt="" loading="lazy" decoding="async" />
                  {t.text && <span>{t.text}</span>}
                </div>
              ))}
            </div>
          )}
          {moreImgs.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="" loading="lazy" decoding="async" className="sp-more" />
          ))}
        </main>

        {/* 7. Produits complémentaires */}
        <CrossSell products={storeProducts} exclude={slug} title="عروض و منتجات مكملة" />

        <main className="sp-wrap">
          {/* 8. Avis clients */}
          {(reviews.length > 0 || customerPhotos.length > 0) && (
            <section className="sp-sec">
              <h2 className="sp-h2">ماذا يقول عملاؤنا؟</h2>
              {!!revSec?.rating && <p className="sp-h2-sub">⭐ {String(revSec.rating)} / 5</p>}
              <div className="sp-revs">
                {reviews.map((r, i) => (
                  <div key={i} className="sp-rev">
                    <div className="sp-rev-h"><span className="sp-av">{(r.name || "?").slice(0, 1).toUpperCase()}</span><div><b>{r.name}</b><small>{r.city}</small></div></div>
                    <div className="sp-stars">{"★".repeat(Math.max(1, Math.min(5, r.stars || 5)))}</div>
                    <p>{r.text}</p>
                    {customerPhotos[i] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={customerPhotos[i]} alt="" loading="lazy" decoding="async" />
                    )}
                  </div>
                ))}
                {customerPhotos.slice(reviews.length).map((src, i) => (
                  <div key={`p${i}`} className="sp-rev sp-rev-photo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" loading="lazy" decoding="async" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 9. FAQ */}
          {faqItems.length > 0 && (
            <section className="sp-sec">
              <h2 className="sp-h2">أسئلة شائعة</h2>
              <FaqAccordion items={faqItems} />
            </section>
          )}

          {/* 10. Garanties */}
          {gty.length > 0 && (
            <div className="sp-gty">
              {gty.map((g, i) => (
                <div key={i} className="sp-gty-i"><span className="sp-ico">{g.icon}</span><b>{g.title}</b><small>{g.desc}</small></div>
              ))}
            </div>
          )}

          {/* 11. Dernier appel */}
          <section className="sp-final">
            <div>
              <h3>لا تفوت الفرصة!</h3>
              <p>{subline}</p>
              <a href="#sp-form" className="sp-final-btn">🛒 {ctaText}</a>
            </div>
            {heroImg && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={heroImg} alt="" loading="lazy" decoding="async" />
            )}
          </section>
        </main>

        <footer className="sp-foot">
          <div className="sp-foot-top">
            <b>{String(lp.store_name ?? "HajtekZone")}</b>
            {waHref && <a href={waHref} target="_blank" rel="noopener noreferrer">📞 {String(lp.whatsapp_number ?? "")}</a>}
          </div>
          <div className="sp-foot-links">
            <a href="/a-propos">من نحن</a> · <a href="/conditions">شروط البيع والاسترجاع</a> · <a href="/confidentialite">سياسة الخصوصية</a>
          </div>
          <div className="sp-foot-copy">© {new Date().getFullYear()} {String(lp.store_name ?? "HajtekZone")}</div>
        </footer>

        <a id="sp-sticky" href="#sp-form" className="sp-sticky">🛒 {ctaText}</a>
      </div>
    </>
  );
}

const CSS = `
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;overflow-x:hidden}
body{margin:0;background:#fff;overflow-x:hidden;width:100%;position:relative}
.sp{overflow-x:hidden;width:100%;max-width:100vw;color:#111827;font-family:var(--font-cairo),sans-serif;background:#f6f7f9}
.sp-top{background:#111;color:#fff;text-align:center;font-size:13px;font-weight:700;padding:7px 10px}
.sp-wrap{max-width:560px;margin:0 auto;padding:0 14px}
.sp-hero{display:block;width:100%;max-width:560px;margin:0 auto;aspect-ratio:1/1;object-fit:cover;background:#111}
.sp-ico{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:#eef6f0;font-size:20px;flex-shrink:0}
.sp-ico-lg{width:48px;height:48px;font-size:24px}
.sp-quick{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:#fff;border-radius:0 0 16px 16px;padding:12px 6px;box-shadow:0 2px 10px rgba(0,0,0,.05)}
.sp-quick-i{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;font-size:11.5px;font-weight:700;line-height:1.4;color:#374151}
.sp-card{background:#fff;border-radius:18px;padding:16px 14px;margin-top:14px;box-shadow:0 6px 24px rgba(0,0,0,.07);border:1px solid #eef0f3}
.sp-badges{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.sp-b-red{background:#dc2626;color:#fff;font-size:12px;font-weight:800;padding:3px 10px;border-radius:8px}
.sp-b-yel{background:#facc15;color:#111;font-size:12px;font-weight:800;padding:3px 10px;border-radius:8px}
.sp-title{font-size:19px;line-height:1.5;font-weight:800;margin:6px 0 2px}
.sp-price{display:flex;align-items:baseline;gap:10px;margin:2px 0 10px}
.sp-now{color:#15803d;font-size:34px;font-weight:900;letter-spacing:-.5px}
.sp-old{color:#9ca3af;text-decoration:line-through;font-size:18px;font-weight:700}
.sp-cod{background:#15803d;color:#fff;text-align:center;font-weight:800;font-size:14px;padding:11px;border-radius:12px}
.sp-order-h{text-align:center;font-size:20px;font-weight:900;color:#15803d;margin:14px 0 0}
.sp-order-sub{text-align:center;font-size:12.5px;color:#6b7280;margin:2px 0 14px}
.sp-wa{display:block;margin:12px 0 0;background:#fff;color:#16a34a;border:2px solid #22c55e;text-align:center;font-weight:800;font-size:15px;padding:11px;border-radius:12px;text-decoration:none}
.sp-sec{margin-top:28px}
.sp-h2{text-align:center;font-size:20px;font-weight:900;margin:0}
.sp-h2-sub{text-align:center;font-size:13px;color:#6b7280;margin:4px 0 14px}
.sp-why{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.sp-why-i{background:#fff;border-radius:14px;padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.04)}
.sp-why-i b{font-size:14px}
.sp-why-i span:last-child{font-size:12px;color:#6b7280;line-height:1.5}
.sp-feature{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:center;background:#fff;border-radius:16px;padding:12px;margin-top:22px;box-shadow:0 2px 10px rgba(0,0,0,.04)}
.sp-feature h3{font-size:17px;font-weight:900;margin:0 0 6px;line-height:1.4}
.sp-feature p{font-size:13px;color:#4b5563;line-height:1.7;margin:0}
.sp-feature img{width:100%;border-radius:12px;aspect-ratio:1/1;object-fit:cover}
.sp-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
.sp-tile{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.04);display:flex;flex-direction:column}
.sp-tile img{width:100%;aspect-ratio:1/1;object-fit:cover}
.sp-tile span{font-size:11.5px;font-weight:700;text-align:center;padding:6px 4px;line-height:1.4}
.sp-more{display:block;width:100%;border-radius:14px;margin-top:12px}
.sp-revs{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 2px 10px;-webkit-overflow-scrolling:touch}
.sp-rev{flex:0 0 78%;max-width:300px;scroll-snap-align:start;background:#fff;border-radius:14px;padding:12px;box-shadow:0 2px 10px rgba(0,0,0,.05);display:flex;flex-direction:column;gap:6px}
.sp-rev-h{display:flex;align-items:center;gap:8px}
.sp-rev-h b{display:block;font-size:14px}.sp-rev-h small{color:#6b7280;font-size:11.5px}
.sp-av{width:34px;height:34px;border-radius:50%;background:#15803d;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900}
.sp-stars{color:#f59e0b;letter-spacing:2px;font-size:14px}
.sp-rev p{font-size:13px;line-height:1.6;margin:0;color:#374151}
.sp-rev img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;margin-top:auto}
.sp-rev-photo{padding:6px}.sp-rev-photo img{aspect-ratio:3/4;height:100%}
.sp-gty{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:#fff;border-radius:16px;padding:14px 6px;margin-top:24px;box-shadow:0 2px 10px rgba(0,0,0,.04)}
.sp-gty-i{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center}
.sp-gty-i b{font-size:12px}.sp-gty-i small{font-size:10.5px;color:#6b7280;line-height:1.4}
.sp-final{display:grid;grid-template-columns:1.4fr 1fr;gap:10px;align-items:center;background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;border-radius:18px;padding:16px;margin-top:24px}
.sp-final h3{font-size:19px;font-weight:900;margin:0 0 4px}
.sp-final p{font-size:12.5px;color:#cbd5e1;margin:0 0 12px;line-height:1.6}
.sp-final img{width:100%;border-radius:12px;aspect-ratio:1/1;object-fit:cover}
.sp-final-btn{display:block;background:#16a34a;color:#fff;text-align:center;font-weight:800;font-size:14px;padding:12px 8px;border-radius:12px;text-decoration:none}
.sp-foot{background:#0f172a;color:#cbd5e1;text-align:center;font-size:12.5px;padding:22px 16px 96px;margin-top:28px;line-height:2}
.sp-foot-top{display:flex;justify-content:space-between;align-items:center;max-width:560px;margin:0 auto 6px;color:#fff}
.sp-foot a{color:#cbd5e1;text-decoration:none}
.sp-foot-copy{color:#64748b;font-size:11.5px}
.sp-sticky{position:fixed;left:12px;right:12px;bottom:12px;z-index:50;background:#16a34a;color:#fff;text-align:center;font-weight:800;font-size:16px;padding:14px;border-radius:14px;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.25);transition:opacity .2s,transform .2s}
.sp-sticky.sp-hide{opacity:0;transform:translateY(120%);pointer-events:none}
@media (min-width:900px){.sp-sticky{max-width:520px;margin:0 auto}}
`;
