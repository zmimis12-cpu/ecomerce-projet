// Landing page « BM2 » : page séparée, copie fidèle de la LP COD concurrente (brandmaall).
// Barre rouge collée en haut · titre turquoise + sous-titre · photo encadrée · formulaire en pointillés
// (champs arrondis, offre en liste, bouton vert) · bandeaux bleus + photo + listes « · cartes noires ✓
// · boutons orange · captures clients · FAQ noire. Tout se règle dans Admin → Boutique → Landing pages.
import type React from "react";

type Group = { title: string; items: string[] };

export function Bm2Landing(p: {
  title: string; subtitle: string; titleColor: string; topText: string;
  heroEl: React.ReactNode; titleScript?: string;
  formTitle: string; price: number; oldPrice: number | null; stars: boolean;
  form: React.ReactNode; note: string; badges: string[];
  groups: Group[]; images: string[]; ctaText: string;
  reviewsTitle: string; reviewImages: string[];
  faqTitle: string; faq: { q: string; a: string }[];
  storeName: string; logo?: string; waHref?: string; shipText?: string; stickyBottom?: boolean;
}) {
  const cta = <div className="b2-cta-w"><a href="#sp-form" className="b2-cta">{p.ctaText}</a></div>;
  return (
    <div className="b2" dir="rtl" lang="ar">
      <style>{CSS}</style>
      <header className="b2-head">
        {p.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.logo} alt="" className="b2-logo" width={44} height={44} decoding="async" />
        )}
        <span className="b2-brand">{p.storeName}</span>
      </header>
      <a href="#sp-form" className="b2-top">
        <span className="b2-hand" aria-hidden="true">👉</span>
        <span>{p.topText}</span>
      </a>

      <h1 className="b2-title" id="sp-title" style={{ color: p.titleColor }} suppressHydrationWarning>{p.title}</h1>
      <p className="b2-sub" id="sp-angle-sub" suppressHydrationWarning>{p.subtitle}</p>
      {p.titleScript && <script dangerouslySetInnerHTML={{ __html: p.titleScript }} />}

      <div className="b2-hero">{p.heroEl}</div>

      <div id="sp-form" className="b2-form">
        <h2 className="b2-form-h">{p.formTitle}</h2>
        {p.shipText && <div className="b2-ship">{p.shipText}</div>}
        {p.oldPrice && p.oldPrice > p.price && <div className="b2-old">{p.oldPrice.toFixed(0)}د.م</div>}
        <div className="b2-now">{p.price.toFixed(0)}د.م</div>
        {p.stars && <div className="b2-stars" aria-hidden="true">★★★★★</div>}
        <div className="b2-f">{p.form}</div>
        {p.note && <p className="b2-note">{p.note}</p>}
        {p.badges.length > 0 && (
          <div className="b2-badges">
            {p.badges.slice(0, 4).map((t, i) => (
              <div key={i} className="b2-badge">
                <span className="b2-badge-ic" aria-hidden="true">{ICONS[i % ICONS.length]}</span>
                <span className="b2-badge-t">{t}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {p.groups.map((g, i) => (
        <section key={i} className="b2-sec">
          {g.title && <h2 className="b2-band">{g.title}</h2>}
          {p.images[i] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.images[i]} alt="" className="b2-img" loading="lazy" fetchPriority="low" decoding="async" />
          )}
          {i % 2 === 1 ? (
            <ul className="b2-dark">
              {g.items.map((t, k) => <li key={k}><span className="b2-ck" aria-hidden="true">✓</span><span>{t}</span></li>)}
            </ul>
          ) : (
            <ul className="b2-list">
              {g.items.map((t, k) => <li key={k}><span className="b2-ch" aria-hidden="true">»</span><span>{t}</span></li>)}
            </ul>
          )}
          {cta}
        </section>
      ))}

      {p.reviewImages.length > 0 && (
        <section className="b2-sec">
          <h2 className="b2-band">{p.reviewsTitle}</h2>
          {p.reviewImages.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={u} alt="" className="b2-img b2-rev" loading="lazy" fetchPriority="low" decoding="async" />
          ))}
          {cta}
        </section>
      )}

      {p.faq.length > 0 && (
        <section className="b2-faq">
          <h2 className="b2-faq-h">{p.faqTitle}</h2>
          {p.faq.map((f, i) => (
            <div key={i} className="b2-faq-i">
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </section>
      )}

      {p.waHref && (
        <a href={p.waHref} target="_blank" rel="noopener noreferrer" className="b2-wa" aria-label="تواصل معنا فالواتساب">
          <span className="b2-wa-ic" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="34" height="34" fill="#fff"><path d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.5.7 4.8 2 6.8L3 29l6.8-2.2c1.9 1 4 1.6 6.2 1.6 7 0 12.7-5.6 12.7-12.6S23 3 16 3zm0 23.1c-2 0-3.9-.6-5.6-1.6l-.4-.2-4 1.3 1.3-3.9-.3-.4a10.4 10.4 0 0 1-1.7-5.7C5.3 9.8 10.1 5.1 16 5.1s10.6 4.7 10.6 10.5S21.9 26.1 16 26.1zm5.8-7.8c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.5-1.6-.9-.8-1.6-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.6.3-.5c.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.2 1.4 3.5c.2.2 2.4 3.6 5.8 5 2.9 1.1 3.4.9 4 .8.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z"/></svg>
          </span>
          <span className="b2-wa-t">تواصل معنا فالواتساب</span>
        </a>
      )}

      {p.stickyBottom && (<>
        <a href="#sp-form" className="b2-bot" id="b2-bot">{p.ctaText}</a>
        <script dangerouslySetInnerHTML={{ __html: "(function(){try{var b=document.getElementById('b2-bot'),f=document.getElementById('sp-form');if(!b||!f||!('IntersectionObserver' in window))return;new IntersectionObserver(function(e){b.classList.toggle('b2-bot-h',e[0].isIntersecting)},{threshold:0.15}).observe(f);}catch(e){}})();" }} />
      </>)}
      <footer className="b2-foot">
        <a href="/a-propos">من نحن</a> · <a href="/conditions">شروط البيع والاسترجاع</a> · <a href="/confidentialite">سياسة الخصوصية</a>
        <div>© {new Date().getFullYear()} {p.storeName}</div>
      </footer>
    </div>
  );
}

const sv = { viewBox: "0 0 24 24", width: 30, height: 30, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ICONS = [
  <svg key="cod" {...sv}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg>,
  <svg key="ship" {...sv}><path d="M1 3h15v13H1z" /><path d="M16 8h4l3 3v5h-7z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>,
  <svg key="box" {...sv}><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" /></svg>,
  <svg key="lock" {...sv}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>,
];

const CSS = `
html,body{background:#fff;margin:0}
.b2{max-width:520px;margin:0 auto;background:#fff;color:#1f2937;font-family:var(--font-cairo),"Cairo",Tahoma,sans-serif;padding:0 0 24px;overflow-x:hidden}
.b2 *{box-sizing:border-box}
.b2-head{display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 10px 0}
.b2-logo{width:44px;height:44px;border-radius:50%;display:block}
.b2-brand{font-size:20px;font-weight:900;letter-spacing:.5px;color:#111;direction:ltr}
.b2-top{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:center;gap:12px;margin:8px 10px 0;animation:b2in .6s ease-out both,b2top 2.4s ease-in-out .8s infinite;background:#e60000;color:#fff;text-decoration:none;font-size:clamp(22px,6.4vw,27px);font-weight:800;min-height:58px;padding:6px 52px;box-shadow:0 2px 6px rgba(0,0,0,.18)}
.b2-hand{position:absolute;left:16px;font-size:24px;filter:brightness(0) invert(1)}
.b2-title{margin:10px 10px 0;text-align:center;font-size:clamp(28px,8.4vw,38px);line-height:1.2;font-weight:900}
.b2-sub{margin:10px 10px 12px;text-align:center;font-size:clamp(20px,5.8vw,25px);font-weight:800;color:#111}
.b2-sub:empty{display:none}
.b2-hero{margin:0 10px}
.b2-hero .sp-hero{display:block;width:100%;height:auto;max-height:none;border:4px solid #6b6b6b;background:#fff;object-fit:cover}
.b2-form{margin:20px 10px 0;border:6px dotted #444;padding:18px 16px 18px;text-align:center}
.b2-form-h{margin:0 0 6px;font-size:clamp(21px,6.2vw,27px);font-weight:900;color:#111}
.b2-old{color:#e11d2a;font-size:clamp(24px,7vw,30px);font-weight:800;text-decoration:line-through;text-decoration-thickness:3px;line-height:1.2}
.b2-now{color:#3dbf2f;font-size:clamp(28px,8vw,36px);font-weight:900;line-height:1.25}
.b2-stars{color:#e8a838;font-size:26px;letter-spacing:4px;line-height:1.3}
.b2-f{margin-top:14px;text-align:right}
.b2-f input::placeholder{color:#6b7280}
.b2-note{margin:14px 0 0;color:#e11d2a;font-size:clamp(17px,5vw,21px);font-weight:700}
.b2-badges{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:14px}
.b2-badge{aspect-ratio:1;border:2.5px solid #555;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#444;padding:6px;text-align:center}
.b2-badge-t{font-size:clamp(8.5px,2.4vw,11px);font-weight:800;line-height:1.15;margin-top:2px}
.b2-sec{margin-top:26px}
.b2-band{margin:0;background:linear-gradient(180deg,#1f4fb0,#123c94);color:#fff;text-align:center;font-size:clamp(24px,7vw,31px);font-weight:900;padding:14px 12px;line-height:1.25}
.b2-img{display:block;width:calc(100% - 40px);margin:18px auto 0;border:4px solid #6b6b6b;border-radius:4px;height:auto}
.b2-rev{margin-top:14px}
.b2-list{list-style:none;margin:18px 20px 0;padding:0}
.b2-list li{display:flex;gap:14px;align-items:center;font-size:clamp(17px,5vw,20px);line-height:1.75;color:#222;margin-bottom:16px}
.b2-ch{color:#3dbf2f;font-size:30px;font-weight:900;flex-shrink:0;line-height:1}
.b2-dark{list-style:none;margin:18px 16px 0;padding:18px 16px 4px;background:#111;border-radius:16px}
.b2-dark li{display:flex;gap:12px;align-items:flex-start;color:#fff;font-size:clamp(17px,5vw,20px);line-height:1.7;margin-bottom:16px}
.b2-ck{flex-shrink:0;width:26px;height:26px;border-radius:50%;background:#22c55e;color:#fff;font-size:15px;font-weight:900;display:flex;align-items:center;justify-content:center;margin-top:5px}
.b2-cta-w{text-align:center;margin:20px 0 0}
.b2-cta{display:inline-block;min-width:58%;background:linear-gradient(180deg,#f79a1e,#ec5a14);color:#fff;text-decoration:none;font-size:clamp(25px,7.4vw,32px);font-weight:900;padding:12px 32px;border-radius:9999px;box-shadow:0 4px 12px rgba(236,90,20,.35);animation:b2p 1.5s ease-in-out infinite}
@keyframes b2in{from{opacity:0;transform:translateY(-24px) scale(.96)}to{opacity:1;transform:none}}
@keyframes b2top{0%,100%{transform:scale(1)}45%{transform:scale(1.035)}55%{transform:scale(1.035)}}
.b2-hand{animation:b2hand 1.2s ease-in-out infinite}
@keyframes b2hand{0%,100%{transform:translateX(0)}50%{transform:translateX(7px)}}
@keyframes b2p{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
.b2-faq{margin:28px 10px 0;background:#0b0b0b;border-radius:14px;padding:22px 18px 8px;text-align:center}
.b2-faq-h{margin:0 0 14px;color:#2fa7bb;font-size:clamp(25px,7.2vw,32px);font-weight:900}
.b2-faq-i h3{margin:0 0 10px;color:#2fa7bb;font-size:clamp(22px,6.4vw,28px);font-weight:900;line-height:1.3}
.b2-faq-i p{margin:0 0 22px;color:#fff;font-size:clamp(16px,4.6vw,19px);line-height:1.7;white-space:pre-line}
.b2-wa{position:fixed;right:12px;bottom:14px;z-index:60;display:flex;flex-direction:row;align-items:center;gap:8px;text-decoration:none}
.b2-wa-ic{width:58px;height:58px;border-radius:50%;background:#25d366;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.25)}
.b2-bot~.b2-wa .b2-wa-t,.b2:has(.b2-bot) .b2-wa-t{display:none}
.b2-wa-t{background:#f3f4f6;color:#111;font-size:15px;font-weight:600;padding:8px 14px;border-radius:16px;box-shadow:0 2px 6px rgba(0,0,0,.12)}
.b2-ship{display:inline-block;margin:4px 0 8px;background:#e8f8ec;color:#137a2e;border:1.5px solid #3dbf2f;border-radius:9999px;padding:5px 14px;font-size:clamp(15px,4.4vw,18px);font-weight:800}
.b2-bot{position:fixed;left:10px;right:84px;bottom:12px;z-index:59;display:flex;align-items:center;justify-content:center;min-height:56px;border-radius:9999px;background:linear-gradient(180deg,#f79a1e,#ec5a14);color:#fff;text-decoration:none;font-size:clamp(21px,6vw,25px);font-weight:900;box-shadow:0 6px 16px rgba(236,90,20,.4);animation:b2p 1.5s ease-in-out infinite;transition:opacity .25s,transform .25s}
.b2-bot-h{opacity:0;pointer-events:none;transform:translateY(90px)}
.b2-foot{margin-top:26px;padding-bottom:70px;text-align:center;font-size:12px;color:#6b7280;line-height:2}
.b2-foot a{color:#6b7280}
@media (prefers-reduced-motion:reduce){.b2-cta,.b2-top,.b2-hand{animation:none}}
`;
