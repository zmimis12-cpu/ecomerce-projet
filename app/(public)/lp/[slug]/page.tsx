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
import { getLpDesignFor, DEFAULT_LP_DESIGN, type LpBlockKey } from "@/lib/store/lp-design";
import { viaCdn } from "@/lib/media";

// Landing page « simple » (style boutique COD rapide) :
// photo → titre → prix → formulaire tout de suite → photos + 1 phrase → re-CTA.
// Utilisée pour TOUTES les /lp/. L'ancienne version longue reste sur /lp-classic/[slug].
export const revalidate = 300; // page régénérée au plus 1 fois / 5 min (les changements admin s'affichent tout de suite via revalidatePath)
export const dynamic = "force-static";
export const dynamicParams = true;

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://ecomerce-projet.vercel.app").replace(/\/$/, "");

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getLandingPage(slug);
  if (!page) return { title: "منتج غير موجود", robots: { index: false, follow: false } };
  // Aperçu du lien (Meta / WhatsApp) = LE produit de la page : sa photo hero choisie, son nom
  const d = await getLpDesignFor(slug).catch(() => null);
  const image = d?.heroImage || page.product.images[0]?.public_url;
  const description = page.description ?? `${page.product.name} — الدفع عند الاستلام · التوصيل لجميع المدن`;
  return {
    title: page.title,
    description,
    alternates: { canonical: `${SITE_URL}/lp/${slug}` },
    robots: { index: true, follow: true },
    openGraph: { type: "website", locale: "ar_MA", title: page.title, description, url: `${SITE_URL}/lp/${slug}`, images: image ? [image] : [] },
  };
}

export default async function LandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [{ data: lpRaw, error }, pageRaw, dg] = await Promise.all([
    supabaseAdmin.from("landing_pages").select("*").eq("slug", slug).eq("is_active", true).maybeSingle(),
    getLandingPage(slug),
    supabaseAdmin.from("digylog_settings").select("config").order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then((r) => r, () => ({ data: null, error: null })),
  ]);
  if (error) throw new Error(`lpData query failed: ${error.message}`);
  if (!pageRaw) notFound();
  // Images servies via le cache Vercel (/media/…) → presque plus de bande passante Supabase
  const lpData = viaCdn(lpRaw);
  const page = viaCdn(pageRaw);

  const [storeProducts, bumps, d] = await Promise.all([
    getStoreProducts().catch(() => []).then(viaCdn),
    getBumpsFor(page.product.id).catch(() => []).then(viaCdn),
    getLpDesignFor(slug).then(viaCdn),
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

  // ── Données (contenu = éditeur de la landing page ; design = Admin → Boutique → Landing pages) ──
  const productImgs = product.images.map((i) => i.public_url).filter(Boolean);
  const banner = lp.hero_image as string | undefined;
  // Photo choisie dans Admin → Boutique → Landing pages (prioritaire), sinon règle produit / bannière
  const heroImg = (d.heroImage || (d.heroSource === "banner" ? banner ?? productImgs[0] : productImgs[0] ?? banner)) ?? null;
  const discount = oldShown > one.price ? Math.round((1 - one.price / oldShown) * 100) : 0;

  type Ico = { icon?: string; title?: string; desc?: string; label?: string };
  const ben = (sec("benefits")?.items as Ico[] | undefined) ?? [];
  const quick = ben.slice(0, 4).map((b) => ({ icon: b.icon ?? "✓", text: b.desc || b.title || "" }));
  const lifeSec = sec("lifestyle");
  const why = ((lifeSec?.scenarios as Ico[] | undefined) ?? []).slice(0, 4);
  const whyTitle = d.whyTitle || String(lifeSec?.title ?? `لماذا تختار ${product.name}؟`);
  const ps = sec("problem_solution");
  // Photos ↔ textes : choisis dans Admin → Boutique → Landing pages (sinon automatique)
  const featureImg = d.featureImage || (productImgs[1] ?? banner);
  const featureTitle = d.featureTitle || String(lp.subtitle ?? ps?.after_title ?? title);
  const featureText = d.featureText || (ben[0]?.title ?? subline);
  const tiles = d.tiles.length
    ? d.tiles.filter((t) => t.image).map((t) => ({ src: t.image, text: t.text }))
    : productImgs.slice(2, 5).map((src, i) => ({ src, text: ben[i + 1]?.desc ?? "" }));
  const moreImgs = d.galleryImages.length ? d.galleryImages : productImgs.slice(5);

  const painTitle = String(ps?.title ?? "واش كتعاني من هادشي؟");
  const painPoints = ((ps?.points as string[] | undefined) ?? []).filter(Boolean);
  const whoSec = sec("suitable_for");
  const whoItems = ((whoSec?.items as { icon?: string; label?: string; desc?: string }[] | undefined) ?? []).filter((w) => w.label);
  const whoTitle = d.whoTitle || String(whoSec?.title ?? "لمن مناسب؟");
  const revSec = sec("reviews");
  const reviews = ((revSec?.items as { name: string; city: string; stars: number; text: string }[] | undefined) ?? []);
  const customerPhotos = (lp.customer_photos as string[] | undefined) ?? [];
  const faqItems = ((sec("faq")?.items as { q: string; a: string }[] | undefined) ?? []);
  const gty = ((sec("guarantees")?.items as Ico[] | undefined) ?? []).slice(0, 4);

  // Vidéo : YouTube → iframe, sinon fichier vidéo
  const yt = d.videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{6,})/);
  const videoEmbed = yt ? `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0` : "";

  // Angles : « V009, V010 » → liste de codes en majuscules
  const angles = d.angles.filter((a) => a.codes.trim() && (a.headline || a.sub || a.image))
    .map((a) => ({ c: a.codes.toUpperCase().split(/[\s,;]+/).filter(Boolean), h: a.headline, s: a.sub, i: a.image }));
  // Une photo hero par avatar → la photo est choisie AVANT son chargement (pas de double téléchargement)
  const angleHero = angles.some((a) => a.i);
  const angleJs = `var c=(new URLSearchParams(location.search).get('cr')||'').toUpperCase(),v=(new URLSearchParams(location.search).get('av')||'').toUpperCase(),A=${JSON.stringify(angles).replace(/</g, "\\u003c")},m=null;for(var i=0;i<A.length;i++){if((c&&A[i].c.indexOf(c)>-1)||(v&&A[i].c.indexOf(v)>-1)){m=A[i];break;}}`;
  const heroVid = d.heroVideo.trim();
  const heroVidIsImg = /\.(webp|gif|avif|png|jpe?g)(\?|$)/i.test(heroVid);

  const topBarText = d.topBar || offerBar;
  const orderSub = d.orderSub || formNote;
  const finalText = d.finalText || subline;
  const finalCta = d.finalCta || ctaText;
  const stickyText = d.stickyText || (d.sticky && d.stickyAlways ? "اشتري الآن" : ctaText);

  const pixel = page.meta_pixel_id?.trim();
  const tt = page.tiktok_pixel_id?.trim();
  const pname = product.name.replace(/'/g, "\\'");
  const waHref = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`مرحبا 👋\nأريد الاستفسار عن المنتج التالي:\n\n🛒 المنتج: ${product.name}\n💰 العرض: ${one.qty > 1 ? `${one.qty} قطع بـ ` : ""}${one.price.toFixed(0)} درهم\n📦 الدفع عند الاستلام`)}` : "";

  const colorVars = {
    "--c-primary": d.colorPrimary || DEFAULT_LP_DESIGN.colorPrimary,
    "--c-badge": d.colorBadge || DEFAULT_LP_DESIGN.colorBadge,
    "--c-disc": d.colorDiscount || DEFAULT_LP_DESIGN.colorDiscount,
    "--c-dark": d.colorDark || DEFAULT_LP_DESIGN.colorDark,
    "--c-bg": d.colorBg || DEFAULT_LP_DESIGN.colorBg,
  } as React.CSSProperties;

  const W = ({ children }: { children: React.ReactNode }) => <div className="sp-wrap">{children}</div>;

  const blocks: Record<LpBlockKey, React.ReactNode> = {
    quick: quick.length > 0 && (
      <W><div className="sp-quick">
        {quick.map((q, i) => <div key={i} className="sp-quick-i"><span className="sp-ico">{q.icon}</span><span>{q.text}</span></div>)}
      </div></W>
    ),
    form: (
      <W><div id="sp-form" className="sp-card">
        {(d.showBadge || (d.showDiscount && discount > 0)) && (
          <div className="sp-badges">
            {d.showBadge && d.badge ? <span className="sp-b-red">{d.badge}</span> : <span />}
            {d.showDiscount && discount > 0 && <span className="sp-b-yel">تخفيض {discount}%</span>}
          </div>
        )}
        {d.urgency && d.urgencyText && <div className="sp-urg">{d.urgencyText}</div>}
        <h1 className="sp-title" id="sp-title" suppressHydrationWarning>{title}</h1>
        {angles.length > 0 && (
          // Même message pub ↔ page : ?cr=V009 → titre de l'angle de cette pub (sans recharger, page toujours en cache)
          <script dangerouslySetInnerHTML={{ __html: `(function(){try{${angleJs}if(!m)return;function ap(){var t=document.getElementById('sp-title');if(t&&m.h&&t.textContent!==m.h)t.textContent=m.h;var s=document.getElementById('sp-angle-sub');if(s&&m.s&&s.textContent!==m.s){s.textContent=m.s;s.style.display='block';}}ap();setTimeout(ap,600);setTimeout(ap,2000);window.addEventListener('load',ap);}catch(e){}})();` }} />
        )}
        <p className="sp-angle-sub" id="sp-angle-sub" suppressHydrationWarning />
        <div className="sp-price">
          <span className="sp-now">{one.price.toFixed(0)} DH</span>
          {d.showOldPrice && oldShown > one.price && <span className="sp-old">{oldShown.toFixed(0)} DH</span>}
        </div>
        {d.showCodBar && d.codBar && <div className="sp-cod">{d.codBar}</div>}
        {d.openBeforePay && d.openBeforePayText && <div className="sp-open">{d.openBeforePayText}</div>}
        {d.orderTitle && <p className="sp-order-h">{d.orderTitle}</p>}
        {orderSub && <p className="sp-order-sub">{orderSub}</p>}
        {d.callNote && d.callNoteText && <p className="sp-call">{d.callNoteText}</p>}
        <OrderFormPublic product={product} productSlug={slug} ctaText={ctaText}
          b1={b1} b2={b2} b3={b3} offers={offers} askAddress={d.askAddress} addressRequired={d.addressRequired}
          pixelId={pixel || undefined} tiktokPixelId={tt || undefined}
          variants={(Array.isArray(lp.variant_options) ? lp.variant_options : []) as { name: string; options: { label: string; image?: string }[] }[]}
          bumps={d.showBumps ? bumps : []} cities={cities}
          offerImage={d.offerThumbs ? (productImgs[0] ?? heroImg) : null} offersAfterFields={d.offersAfterFields} />
        {d.showWhatsapp && waHref && <a className="sp-wa" href={waHref} target="_blank" rel="noopener noreferrer">واتساب — تواصل معنا</a>}
      </div></W>
    ),
    proof: d.proofImages.length > 0 && (
      <W><section className="sp-sec">
        {d.proofTitle && <h2 className="sp-h2">{d.proofTitle}</h2>}
        <div className="sp-proof">
          {d.proofImages.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="" loading="lazy" decoding="async" />
          ))}
        </div>
      </section></W>
    ),
    problems: painPoints.length > 0 && (
      <W><section className="sp-sec">
        <h2 className="sp-h2">{painTitle}</h2>
        <div className="sp-pain">{painPoints.map((t, i) => <div key={i}>❌ {t}</div>)}</div>
        {d.problemImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.problemImage} alt="" loading="lazy" decoding="async" className="sp-more" />
        )}
      </section></W>
    ),
    who: whoItems.length > 0 && (
      <W><section className="sp-sec">
        <h2 className="sp-h2">{whoTitle}</h2>
        <div className="sp-who">
          {whoItems.map((w, i) => <div key={i}><span>{w.icon ?? "✓"}</span><b>{w.label}</b>{w.desc && <small>{w.desc}</small>}</div>)}
        </div>
      </section></W>
    ),
    video: d.videoUrl && (
      <W><section className="sp-sec">
        {d.videoTitle && <h2 className="sp-h2">{d.videoTitle}</h2>}
        {d.videoSub && <p className="sp-h2-sub">{d.videoSub}</p>}
        <div className="sp-video">
          {videoEmbed
            ? <iframe src={videoEmbed} title={d.videoTitle || product.name} loading="lazy" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            : <video src={d.videoUrl} controls playsInline preload="none" poster={heroImg ?? undefined} />}
        </div>
      </section></W>
    ),
    why: why.length > 0 && (
      <W><section className="sp-sec">
        <h2 className="sp-h2">{whyTitle}</h2>
        <p className="sp-h2-sub">{subline}</p>
        <div className="sp-why">
          {why.map((w, i) => (
            <div key={i} className="sp-why-i"><span className="sp-ico sp-ico-lg">{w.icon}</span><b>{w.title}</b><span>{w.desc}</span></div>
          ))}
        </div>
      </section></W>
    ),
    feature: featureImg && (
      <W><section className="sp-feature">
        <div className="sp-feature-txt"><h3>{featureTitle}</h3><p>{featureText}</p></div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={featureImg} alt="" loading="lazy" decoding="async" />
      </section></W>
    ),
    tiles: tiles.length > 0 && (
      <W><div className="sp-tiles">
        {tiles.map((t, i) => (
          <div key={i} className="sp-tile">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.src} alt="" loading="lazy" decoding="async" />
            {t.text && <span>{t.text}</span>}
          </div>
        ))}
      </div></W>
    ),
    gallery: moreImgs.length > 0 && (
      // eslint-disable-next-line @next/next/no-img-element
      <W>{moreImgs.map((src, i) => <img key={i} src={src} alt="" loading="lazy" decoding="async" className="sp-more" />)}</W>
    ),
    crosssell: <div className="sp-cross"><CrossSell products={storeProducts} exclude={slug} title={d.crossTitle || "عروض و منتجات مكملة"} /></div>,
    reviews: (reviews.length > 0 || customerPhotos.length > 0) && (
      <W><section className="sp-sec">
        <h2 className="sp-h2">{d.reviewsTitle}</h2>
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
      </section></W>
    ),
    faq: faqItems.length > 0 && (
      <W><section className="sp-sec"><h2 className="sp-h2">{d.faqTitle}</h2><FaqAccordion items={faqItems} /></section></W>
    ),
    guarantees: gty.length > 0 && (
      <W><div className="sp-gty">
        {gty.map((g, i) => <div key={i} className="sp-gty-i"><span className="sp-ico">{g.icon}</span><b>{g.title}</b><small>{g.desc}</small></div>)}
      </div></W>
    ),
    final: (
      <W><section className="sp-final">
        <div>
          {d.finalTitle && <h3>{d.finalTitle}</h3>}
          {finalText && <p>{finalText}</p>}
          <a href="#sp-form" className="sp-final-btn">🛒 {finalCta}</a>
        </div>
        {heroImg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroImg} alt="" loading="lazy" decoding="async" />
        )}
      </section></W>
    ),
  };

  const heroEl = angleHero && !(heroVid && !heroVidIsImg) ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img id="sp-hero-img" data-src={(heroVid || heroImg) ?? ""} alt={product.name} className="sp-hero" fetchPriority="high" decoding="async" />
      <script dangerouslySetInnerHTML={{ __html: `(function(){var e=document.getElementById('sp-hero-img');if(!e)return;var u=e.getAttribute('data-src');try{${angleJs}if(m&&m.i)u=m.i;}catch(x){}e.src=u;})();` }} />
    </>
  ) : heroVid && !heroVidIsImg ? (
    // Vidéo courte en boucle, sans son : la photo s'affiche d'abord (poster), la vidéo démarre ensuite
    <video src={heroVid} poster={heroImg ?? undefined} className="sp-hero" autoPlay muted loop playsInline preload="metadata" aria-label={product.name} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={(heroVid || heroImg) ?? ""} alt={product.name} className="sp-hero" fetchPriority={d.heroPosition === "top" ? "high" : "auto"} loading={d.heroPosition === "top" ? "eager" : "lazy"} decoding="async" />
  );
  const hasHero = !!(heroImg || heroVid || angleHero);
  // Formulaire tout en haut (sauf si « photo en haut » est choisi) : le client commande sans descendre
  const shown = d.blocks.filter((b) => b.on && !(d.crossAtBottom && b.key === "crosssell"));
  const orderedBlocks = d.formFirst || d.heroPosition === "after_form"
    ? [...shown.filter((b) => b.key === "form"), ...shown.filter((b) => b.key !== "form")] : shown;
  const barAlways = d.sticky && d.stickyAlways;

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
        (function(){function buy(){var f=document.getElementById('sp-order-form');if(!f){var c=document.getElementById('sp-form');if(c)c.scrollIntoView({behavior:'smooth'});return;}if(f.requestSubmit)f.requestSubmit();else f.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));}document.addEventListener('click',function(e){var t=e.target;if(t&&t.closest&&t.closest('#sp-buy')){e.preventDefault();buy();}});})();
        (function(){function go(){var b=document.getElementById('sp-sticky'),f=document.getElementById('sp-form');if(!f||!('IntersectionObserver' in window))return;var w=document.getElementById('sp-wa-float');new IntersectionObserver(function(e){if(b)b.classList.toggle('sp-hide',e[0].isIntersecting);if(w)w.classList.toggle('sp-hide-wa',e[0].isIntersecting);},{threshold:0.05}).observe(f);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();})();`
      }} />
            <style>{CSS}</style>

      <div className="sp" dir="rtl" lang="ar" style={colorVars}>
        {d.showTopBar && topBarText && <div className="sp-top">{topBarText}</div>}
        {d.showStoreHeader && <StoreHeader current={slug} products={storeProducts.map((x) => ({ slug: x.slug, title: x.title, image: x.image, price: x.price }))} />}

        {hasHero && d.heroPosition === "top" && heroEl}

        {orderedBlocks.map((b) => (
          <div key={b.key}>
            {blocks[b.key] || null}
            {/* Formulaire en haut → la grande photo vient juste après */}
            {b.key === "form" && d.heroPosition === "after_form" && hasHero && <div className="sp-hero-after">{heroEl}</div>}
          </div>
        ))}
        {/* Le formulaire est indispensable : s'il est caché, on le garde quand même (sinon aucune commande possible) */}
        {!d.blocks.some((b) => b.key === "form" && b.on) && blocks.form}

        {/* Autres produits : tout en bas, bien séparés → la page reste centrée sur un seul produit */}
        {d.crossAtBottom && d.blocks.some((b) => b.key === "crosssell" && b.on) && (
          <div className="sp-more-products">{blocks.crosssell}</div>
        )}

        {/* Données produit structurées : indiquent clairement à Meta/Google le produit vendu sur cette page */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org", "@type": "Product",
          name: product.name, image: (heroImg ? [heroImg, ...productImgs.filter((u) => u !== heroImg).slice(0, 4)] : productImgs.slice(0, 5)).map((u) => u.startsWith("/") ? SITE_URL + u : u),
          description: String(lp.subtitle ?? lp.hero_subheadline ?? product.name),
          offers: { "@type": "Offer", priceCurrency: "MAD", price: one.price, availability: "https://schema.org/InStock", url: `${SITE_URL}/lp/${slug}` },
        }).replace(/</g, "\\u003c") }} />

        {d.showFooter && (
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
        )}
        {!d.showFooter && <div style={{ height: 96 }} />}

        {barAlways && (
          <div className="sp-bar">
            <button type="button" id="sp-buy" className="sp-bar-buy">{stickyText}</button>
            {d.showWhatsappFloat && waHref && (
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="sp-bar-wa" aria-label="تواصل عبر واتساب">
                <svg viewBox="0 0 24 24" fill="currentColor" width="30" height="30" aria-hidden="true"><path d={WA_PATH} /></svg>
              </a>
            )}
          </div>
        )}
        {d.sticky && !barAlways && <a id="sp-sticky" href="#sp-form" className="sp-sticky">🛒 {stickyText}</a>}
        {!barAlways && d.showWhatsappFloat && waHref && (
          <a id="sp-wa-float" href={waHref} target="_blank" rel="noopener noreferrer" className="sp-wa-float" aria-label="تواصل عبر واتساب" style={d.sticky ? undefined : { bottom: 20 }}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" aria-hidden="true"><path d={WA_PATH} /></svg>
          </a>
        )}
      </div>
    </>
  );
}

const WA_PATH = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z";

const CSS = `
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;overflow-x:hidden}
body{margin:0;background:#fff;overflow-x:hidden;width:100%;position:relative}
.sp{overflow-x:hidden;width:100%;max-width:100vw;color:#111827;font-family:var(--font-cairo),sans-serif;background:var(--c-bg)}
.sp-top{background:#111;color:#fff;text-align:center;font-size:13px;font-weight:700;padding:7px 10px}
.sp-wrap{max-width:560px;margin:0 auto;padding:0 14px}
.sp-hero{display:block;width:100%;max-width:560px;margin:0 auto;aspect-ratio:1/1;object-fit:cover;background:#111}
.sp-ico{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:#eef6f0;font-size:20px;flex-shrink:0}
.sp-ico-lg{width:48px;height:48px;font-size:24px}
.sp-quick{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:#fff;border-radius:0 0 16px 16px;padding:12px 6px;box-shadow:0 2px 10px rgba(0,0,0,.05)}
.sp-quick-i{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;font-size:11.5px;font-weight:700;line-height:1.4;color:#374151}
.sp-more-products{margin-top:28px;padding-top:8px;border-top:6px solid #eef0f3}
.sp-card{background:#fff;border-radius:18px;padding:16px 14px;margin-top:14px;box-shadow:0 6px 24px rgba(0,0,0,.07);border:1px solid #eef0f3}
.sp-badges{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.sp-b-red{background:var(--c-badge);color:#fff;font-size:12px;font-weight:800;padding:3px 10px;border-radius:8px}
.sp-b-yel{background:var(--c-disc);color:#111;font-size:12px;font-weight:800;padding:3px 10px;border-radius:8px}
.sp-title{font-size:19px;line-height:1.5;font-weight:800;margin:6px 0 2px}
.sp-price{display:flex;align-items:baseline;gap:10px;margin:2px 0 10px}
.sp-now{color:var(--c-primary);font-size:34px;font-weight:900;letter-spacing:-.5px}
.sp-old{color:#9ca3af;text-decoration:line-through;font-size:18px;font-weight:700}
.sp-cod{background:var(--c-primary);color:#fff;text-align:center;font-weight:800;font-size:14px;padding:11px;border-radius:12px}
.sp-order-h{text-align:center;font-size:20px;font-weight:900;color:var(--c-primary);margin:14px 0 0}
.sp-order-sub{text-align:center;font-size:12.5px;color:#6b7280;margin:2px 0 14px}
.sp-wa{display:block;margin:12px 0 0;background:#fff;color:#16a34a;border:2px solid #22c55e;text-align:center;font-weight:800;font-size:15px;padding:11px;border-radius:12px;text-decoration:none}
.sp-sec{margin-top:28px}
.sp-h2{text-align:center;font-size:20px;font-weight:900;margin:0}
.sp-h2-sub{text-align:center;font-size:13px;color:#6b7280;margin:4px 0 14px}
.sp-video{position:relative;width:100%;aspect-ratio:16/9;border-radius:16px;overflow:hidden;background:#000;box-shadow:0 6px 24px rgba(0,0,0,.12)}
.sp-video iframe,.sp-video video{position:absolute;inset:0;width:100%;height:100%;border:0}
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
.sp-cross{margin-top:24px}
.sp-revs{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 2px 10px;-webkit-overflow-scrolling:touch}
.sp-rev{flex:0 0 78%;max-width:300px;scroll-snap-align:start;background:#fff;border-radius:14px;padding:12px;box-shadow:0 2px 10px rgba(0,0,0,.05);display:flex;flex-direction:column;gap:6px}
.sp-rev-h{display:flex;align-items:center;gap:8px}
.sp-rev-h b{display:block;font-size:14px}.sp-rev-h small{color:#6b7280;font-size:11.5px}
.sp-av{width:34px;height:34px;border-radius:50%;background:var(--c-primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900}
.sp-stars{color:#f59e0b;letter-spacing:2px;font-size:14px}
.sp-rev p{font-size:13px;line-height:1.6;margin:0;color:#374151}
.sp-rev img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;margin-top:auto}
.sp-rev-photo{padding:6px}.sp-rev-photo img{aspect-ratio:3/4;height:100%}
.sp-gty{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:#fff;border-radius:16px;padding:14px 6px;margin-top:24px;box-shadow:0 2px 10px rgba(0,0,0,.04)}
.sp-gty-i{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center}
.sp-gty-i b{font-size:12px}.sp-gty-i small{font-size:10.5px;color:#6b7280;line-height:1.4}
.sp-final{display:grid;grid-template-columns:1.4fr 1fr;gap:10px;align-items:center;background:var(--c-dark);color:#fff;border-radius:18px;padding:16px;margin-top:24px}
.sp-final h3{font-size:19px;font-weight:900;margin:0 0 4px}
.sp-final p{font-size:12.5px;color:#cbd5e1;margin:0 0 12px;line-height:1.6}
.sp-final img{width:100%;border-radius:12px;aspect-ratio:1/1;object-fit:cover}
.sp-final-btn{display:block;background:var(--c-primary);color:#fff;text-align:center;font-weight:800;font-size:14px;padding:12px 8px;border-radius:12px;text-decoration:none}
.sp-foot{background:var(--c-dark);color:#cbd5e1;text-align:center;font-size:12.5px;padding:22px 16px 96px;margin-top:28px;line-height:2}
.sp-foot-top{display:flex;justify-content:space-between;align-items:center;max-width:560px;margin:0 auto 6px;color:#fff}
.sp-foot a{color:#cbd5e1;text-decoration:none}
.sp-foot-copy{color:#64748b;font-size:11.5px}
.sp-sticky{position:fixed;left:12px;right:12px;bottom:12px;z-index:50;background:var(--c-primary);color:#fff;text-align:center;font-weight:800;font-size:16px;padding:14px;border-radius:14px;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.25);transition:opacity .2s,transform .2s}
.sp-sticky.sp-hide{opacity:0;transform:translateY(120%);pointer-events:none}
@media (min-width:900px){.sp-sticky{max-width:520px;margin:0 auto}}
.sp-urg{background:#fef2f2;color:#b91c1c;border:1px dashed #fca5a5;text-align:center;font-weight:800;font-size:13.5px;padding:7px 10px;border-radius:10px;margin:4px 0 6px}
.sp-angle-sub{display:none;font-size:14px;font-weight:700;color:#374151;margin:0 0 6px;line-height:1.6}
.sp-open{margin-top:8px;background:#fffbeb;color:#92400e;border:2px solid #fbbf24;text-align:center;font-weight:900;font-size:14.5px;padding:10px;border-radius:12px}
.sp-call{text-align:center;font-size:13px;font-weight:700;color:#065f46;background:#ecfdf5;border-radius:10px;padding:8px 10px;margin:0 0 12px;line-height:1.6}
.sp-proof{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px}
.sp-proof img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:12px;background:#e5e7eb}
.sp-pain{background:#fff7ed;border-radius:16px;padding:10px 14px;margin-top:10px}.sp-pain div{font-size:14px;font-weight:700;padding:5px 0;line-height:1.5}
.sp-who{display:grid;grid-template-columns:1fr 1fr;gap:8px}.sp-who div{background:#fff;border-radius:14px;padding:12px 8px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.04);display:flex;flex-direction:column;gap:3px}
.sp-who span{font-size:28px}.sp-who b{font-size:14px}.sp-who small{font-size:11.5px;color:#6b7280;line-height:1.5}
.sp-hero-after{max-width:560px;margin:14px auto 0;padding:0 14px}.sp-hero-after .sp-hero{border-radius:16px}
.sp-bar{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;gap:10px;align-items:center;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:linear-gradient(to top,rgba(255,255,255,.98) 70%,rgba(255,255,255,0))}
.sp-bar-buy{flex:1;height:56px;border:0;border-radius:9999px;background:var(--c-primary);color:#fff;font-family:var(--font-cairo),sans-serif;font-size:19px;font-weight:800;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.18);animation:sp-buy-pulse 2.4s infinite}
.sp-bar-wa{flex:0 0 56px;height:56px;border-radius:50%;background:#25D366;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.18)}
@keyframes sp-buy-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
@media (min-width:900px){.sp-bar{max-width:560px;margin:0 auto;left:0;right:0}}
.sp-wa-float{position:fixed;bottom:84px;left:16px;z-index:60;width:56px;height:56px;border-radius:50%;background:#25D366;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.25);transition:opacity .2s,transform .2s;animation:sp-wa-pulse 2.4s infinite}
.sp-wa-float.sp-hide-wa{opacity:0;pointer-events:none;transform:scale(.6)}
@keyframes sp-wa-pulse{0%,100%{box-shadow:0 4px 16px rgba(37,211,102,.5)}50%{box-shadow:0 4px 24px rgba(37,211,102,.8),0 0 0 8px rgba(37,211,102,.15)}}
`;
