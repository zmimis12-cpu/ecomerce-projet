// Landing page « SHOP » : style boutique Shopify COD (bandeau défilant, en-tête logo, galerie 1/3,
// titre + prix, formulaire tout de suite, confiance, grandes images, description, garanties, pied de page,
// bouton fixe en bas). Même formulaire / pixels / suivi que les autres modèles. Réglages : Admin → Boutique → Landing pages.
import type React from "react";
import { LpCountdown } from "./lp-countdown";

type Group = { title: string; items: string[] };

export function ShopLanding(p: {
  /** Compte à rebours : date de fin réelle (heure Maroc, "AAAA-MM-JJTHH:MM") ou "daily" ; vide = caché */
  countdownEnd?: string; countdownText?: string;
  title: string; subtitle: string; price: number; oldPrice: number | null; ctaText: string;
  gallery: string[]; images: string[]; groups: Group[]; faq: { q: string; a: string }[];
  form: React.ReactNode; ticker: string[]; trust: string[]; reassure: string; shipText: string;
  storeName: string; logo?: string; waHref?: string; valueLine?: string; color: string; titleScript?: string;
}) {
  const g = p.gallery.filter(Boolean);
  const cta = (
    <a href="#sp-form" className="sh-btn"><span aria-hidden="true">🛒</span> {p.ctaText} – {p.price.toFixed(2)} dh</a>
  );
  return (
    <div className="sh" dir="rtl" lang="ar" style={{ ["--c" as string]: p.color }}>
      <style>{CSS}</style>
      {p.ticker.length > 0 && (
        <div className="sh-tick" aria-hidden="true"><div className="sh-tick-in">
          {[0, 1].map((k) => <span key={k}>{p.ticker.map((t, i) => <i key={i}>{t}</i>)}</span>)}
        </div></div>
      )}
      <header className="sh-head">
        <span className="sh-ico" aria-hidden="true">☰</span>
        <span className="sh-brand">
          {p.logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.logo} alt={p.storeName} width={120} height={40} decoding="async" />
            : p.storeName}
        </span>
        <span className="sh-icons">
          {p.waHref && <a href={p.waHref} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="sh-wa">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#25D366"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.7-.1l.9-1.1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.2 1.2z"/></svg>
          </a>}
          <a href="#sp-form" aria-label="Commander" className="sh-ico">🛒</a>
        </span>
      </header>

      <div className="sh-gal">
        <div className="sh-track" id="sh-track">
          {g.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt={p.title} className={i === 0 ? "sp-hero" : ""} width={480} height={480}
              fetchPriority={i === 0 ? "high" : "low"} loading={i === 0 ? "eager" : "lazy"} decoding="async" />
          ))}
        </div>
        {g.length > 1 && <div className="sh-count" dir="ltr"><button type="button" id="sh-prev" aria-label="précédent">‹</button><span id="sh-n">1/{g.length}</span><button type="button" id="sh-next" aria-label="suivant">›</button></div>}
        <script dangerouslySetInnerHTML={{ __html: "(function(){var t=document.getElementById('sh-track'),n=document.getElementById('sh-n');if(!t||!n)return;var c=t.children.length;function cur(){return Math.round(Math.abs(t.scrollLeft)/t.clientWidth)}t.addEventListener('scroll',function(){n.textContent=(cur()+1)+'/'+c},{passive:true});function go(d){var i=Math.max(0,Math.min(c-1,cur()+d));var x=i*t.clientWidth;t.scrollTo({left:getComputedStyle(t).direction==='rtl'?-x:x,behavior:'smooth'})}document.getElementById('sh-prev').onclick=function(){go(-1)};document.getElementById('sh-next').onclick=function(){go(1)};})();" }} />
      </div>

      <div className="sh-main">
        <h1 className="sh-title" id="sp-title" suppressHydrationWarning>{p.title}</h1>
        {p.subtitle && <p className="sh-sub" id="sp-angle-sub" suppressHydrationWarning>{p.subtitle}</p>}
        {p.titleScript && <script dangerouslySetInnerHTML={{ __html: p.titleScript }} />}
        <div className="sh-price" dir="ltr">
          <b>{p.price.toFixed(2)} dh</b>
          {p.oldPrice && p.oldPrice > p.price && <><s>{p.oldPrice.toFixed(2)} dh</s><em>SAVE {Math.round((1 - p.price / p.oldPrice) * 100)}%</em></>}
        </div>
        {p.countdownEnd && (() => {
          const daily = p.countdownEnd === "daily";
          const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(p.countdownEnd || "");
          const endMs = daily ? 1 : m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 1, +m[5]) : 0;
          return endMs ? <LpCountdown endMs={endMs} daily={daily} text={p.countdownText} /> : null;
        })()}
        {p.valueLine && <p className="sh-val">{p.valueLine}</p>}

        <div id="sp-form" className="sh-card">
          {p.shipText && <div className="sh-ship"><span className="sh-radio" /> <span>{p.shipText}</span><b>مجاني</b></div>}
          {p.reassure && <p className="sh-reas">{p.reassure}</p>}
          <div className="sh-f">{p.form}</div>
        </div>
        {p.trust.length > 0 && <ul className="sh-trust">{p.trust.map((t, i) => <li key={i}>{t}</li>)}</ul>}

        <h2 className="sh-title2">{p.title}</h2>
      </div>

      {p.images.length > 0 && (
        <div className="sh-imgs">
          {p.images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="" width={480} height={600} loading="lazy" decoding="async" fetchPriority="low" />
          ))}
        </div>
      )}

      <div className="sh-main">
        {p.groups.map((gr, i) => (
          <section key={i} className="sh-desc">
            {gr.title && <h3>{gr.title}</h3>}
            <ul>{gr.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
          </section>
        ))}
        {p.faq.length > 0 && (
          <section className="sh-faq">
            <h3>الأسئلة الشائعة</h3>
            {p.faq.slice(0, 6).map((f, i) => <details key={i}><summary>{f.q}</summary><p>{f.a}</p></details>)}
          </section>
        )}
      </div>

      <section className="sh-gty">
        <h3>الضمانات والخدمة</h3>
        <div><span aria-hidden="true">🎧</span><b>خدمة ما بعد البيع</b><small>نجاوبوك على الواتساب ولا بالتيليفون</small></div>
        <div><span aria-hidden="true">🚚</span><b>توصيل لجميع المدن</b><small>كنوصلو المنتج لباب الدار</small></div>
        <div><span aria-hidden="true">💵</span><b>الدفع عند الاستلام</b><small>ما كتخلص حتى توصلك الكوموند</small></div>
      </section>

      <footer className="sh-foot">
        <div className="sh-fbrand">{p.storeName}</div>
        {p.waHref && <a href={p.waHref} target="_blank" rel="noopener noreferrer" className="sh-fwa">تواصل معنا على واتساب</a>}
        <p><a href="/confidentialite">سياسة الخصوصية</a></p>
      </footer>
      <div className="sh-sticky">{cta}</div>
    </div>
  );
}

const CSS = `
.sh{--bg:#f5f3ee;background:var(--bg);color:#1f2328;font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;max-width:520px;margin:0 auto;padding-bottom:84px;overflow-x:hidden}
.sh-tick{background:#111;color:#fff;font-size:12.5px;overflow:hidden;white-space:nowrap;height:30px;display:flex;align-items:center}
.sh-tick-in{display:inline-flex;animation:shT 22s linear infinite}
.sh-tick-in span{display:inline-flex}.sh-tick-in i{font-style:normal;padding:0 18px}
@keyframes shT{from{transform:translateX(0)}to{transform:translateX(50%)}}
.sh-head{display:grid;grid-template-columns:44px 1fr 80px;align-items:center;padding:12px 14px;background:var(--bg)}
.sh-brand{text-align:center;font:600 20px/1.1 Georgia,serif;letter-spacing:1px;color:#2b2b2b}.sh-brand img{height:40px;width:auto;display:inline-block}
.sh-icons{display:flex;gap:12px;justify-content:flex-start;align-items:center}.sh-ico{font-size:20px;color:#333;text-decoration:none}
.sh-gal{position:relative;padding:0 14px}
.sh-track{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;border-radius:14px;background:#fff}
.sh-track::-webkit-scrollbar{display:none}
.sh-track img{flex:0 0 100%;width:100%;height:auto;aspect-ratio:1/1;object-fit:contain;scroll-snap-align:center;background:#fff}
.sh-count{display:flex;justify-content:center;align-items:center;gap:18px;font-size:12px;color:#888;padding:8px 0}
.sh-count button{background:none;border:0;font-size:20px;color:#999;cursor:pointer;line-height:1}
.sh-main{padding:0 16px}
.sh-title{font-size:27px;font-weight:800;line-height:1.25;margin:6px 0 4px;color:#1a1a1a}
.sh-sub{font-size:15px;color:#555;margin:0 0 6px}
.sh-price{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-direction:row-reverse;margin:6px 0 10px}
.sh-price b{color:var(--c);font-size:21px;font-weight:800}.sh-price s{color:#777;font-size:15px}
.sh-price em{font-style:normal;font-size:11px;font-weight:800;border:1px solid #ddd;border-radius:6px;padding:2px 6px;background:#fff}
.sh-cd{margin:10px 0;padding:8px 6px 10px;border-radius:14px;background:#fff7ed;border:2px solid #fdba74;text-align:center}.sh-cd-t{font-size:15px;font-weight:800;color:#c2410c;margin-bottom:6px}.sh-cd-b{display:flex;justify-content:center;gap:8px}.sh-cd-b span{display:flex;flex-direction:column;align-items:center;min-width:52px;background:#ea580c;color:#fff;border-radius:10px;padding:4px 2px}.sh-cd-b b{font-size:22px;font-weight:900;line-height:1.15;font-variant-numeric:tabular-nums}.sh-cd-b i{font-style:normal;font-size:11px;font-weight:700}
.sh-val{background:#fff;border-radius:10px;padding:8px 12px;font-size:14px;font-weight:600;margin:0 0 10px;border-inline-start:4px solid var(--c)}
.sh-card{background:#fff;border-radius:14px;padding:14px;box-shadow:0 2px 14px rgba(0,0,0,.07);scroll-margin-top:12px}
.sh-ship{display:flex;align-items:center;gap:10px;border:1px solid #e5e5e5;border-radius:10px;padding:10px 12px;font-size:14px}
.sh-ship span:nth-child(2){flex:1}.sh-ship b{font-size:13px}
.sh-radio{width:18px;height:18px;border-radius:50%;border:5px solid #222;display:inline-block}
.sh-reas{text-align:center;font-size:14px;color:#444;margin:12px 4px;line-height:1.7}
.sh-f input,.sh-f select,.sh-f textarea{border-radius:10px!important;border:1px solid #ddd!important;background:#fafafa!important;min-height:48px;font-size:16px!important}
.sh-f button[type=submit]{background:var(--c)!important;border-radius:999px!important;min-height:52px;font-size:17px!important;font-weight:800!important;box-shadow:0 6px 18px color-mix(in srgb,var(--c) 35%,transparent)!important;color:#fff!important}
.sh-trust{list-style:none;padding:12px 4px;margin:0;font-size:13.5px;color:#333;display:grid;gap:6px}
.sh-title2{font-size:24px;font-weight:800;text-align:center;margin:18px 0 10px}
.sh-imgs{display:flex;flex-direction:column;gap:0;padding:0 16px}.sh-imgs img{width:100%;height:auto;display:block;border-radius:0}
.sh-desc{background:#fff;border-radius:14px;padding:14px;margin:14px 0}
.sh-desc h3{font-size:18px;margin:0 0 8px;color:var(--c)}.sh-desc ul{margin:0;padding:0 18px 0 0;display:grid;gap:6px;font-size:15px;line-height:1.6}
.sh-faq{margin:14px 0}.sh-faq h3{font-size:18px;text-align:center}
.sh-faq details{background:#fff;border-radius:10px;padding:12px 14px;margin:8px 0}.sh-faq summary{font-weight:700;cursor:pointer}.sh-faq p{margin:8px 0 0;color:#444;line-height:1.6}
.sh-gty{background:#fff;margin:16px;border-radius:14px;padding:0 0 14px;text-align:center;overflow:hidden}
.sh-gty h3{background:#111;color:#fff;margin:0 0 10px;padding:14px;font-size:19px}
.sh-gty div{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px}
.sh-gty span{font-size:34px}.sh-gty b{font-size:16px}.sh-gty small{font-size:13px;color:#555}
.sh-foot{background:#ece9e2;padding:28px 16px;text-align:center;color:#444;font-size:13px}
.sh-fbrand{font:600 26px Georgia,serif;letter-spacing:1px;margin-bottom:12px;color:#2b2b2b}
.sh-fwa{display:inline-block;background:#25D366;color:#fff;font-weight:700;border-radius:8px;padding:10px 16px;text-decoration:none;margin-bottom:12px}
.sh-foot a{color:#444}
.sh-sticky{position:fixed;left:0;right:0;bottom:0;z-index:50;padding:8px 10px calc(8px + env(safe-area-inset-bottom));background:linear-gradient(transparent,rgba(245,243,238,.95) 30%)}
.sh-btn{display:flex;justify-content:center;align-items:center;gap:8px;max-width:500px;margin:0 auto;background:var(--c);color:#fff;font-weight:800;font-size:17px;border-radius:999px;padding:14px;text-decoration:none;box-shadow:0 6px 18px rgba(0,0,0,.18);animation:shP 2.2s ease-in-out infinite}
@keyframes shP{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
@media (prefers-reduced-motion:reduce){.sh-tick-in,.sh-btn{animation:none}}
`;
