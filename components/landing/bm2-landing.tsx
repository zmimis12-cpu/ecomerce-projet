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
  storeName: string;
}) {
  const cta = <div className="b2-cta-w"><a href="#sp-form" className="b2-cta">{p.ctaText}</a></div>;
  return (
    <div className="b2" dir="rtl" lang="ar">
      <style>{CSS}</style>
      <a href="#sp-form" className="b2-top">
        <span className="b2-hand" aria-hidden="true">👉</span>
        <span>{p.topText}</span>
      </a>

      <h1 className="b2-title" id="sp-title" style={{ color: p.titleColor }} suppressHydrationWarning>{p.title}</h1>
      {p.titleScript && <script dangerouslySetInnerHTML={{ __html: p.titleScript }} />}
      <p className="b2-sub" id="sp-angle-sub" suppressHydrationWarning>{p.subtitle}</p>

      <div className="b2-hero">{p.heroEl}</div>

      <div id="sp-form" className="b2-form">
        <h2 className="b2-form-h">{p.formTitle}</h2>
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
              {g.items.map((t, k) => <li key={k}><span className="b2-ch" aria-hidden="true">«</span><span>{t}</span></li>)}
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
.b2-top{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:center;gap:12px;margin:10px 10px 0;background:#e60000;color:#fff;text-decoration:none;font-size:clamp(22px,6.4vw,27px);font-weight:800;min-height:58px;padding:6px 52px;box-shadow:0 2px 6px rgba(0,0,0,.18)}
.b2-hand{position:absolute;left:16px;font-size:24px;filter:brightness(0) invert(1)}
.b2-title{margin:14px 10px 0;text-align:center;font-size:clamp(28px,8.4vw,38px);line-height:1.2;font-weight:900}
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
@keyframes b2p{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
.b2-faq{margin:28px 10px 0;background:#0b0b0b;border-radius:14px;padding:22px 18px 8px;text-align:center}
.b2-faq-h{margin:0 0 14px;color:#2fa7bb;font-size:clamp(25px,7.2vw,32px);font-weight:900}
.b2-faq-i h3{margin:0 0 10px;color:#2fa7bb;font-size:clamp(22px,6.4vw,28px);font-weight:900;line-height:1.3}
.b2-faq-i p{margin:0 0 22px;color:#fff;font-size:clamp(16px,4.6vw,19px);line-height:1.7;white-space:pre-line}
.b2-foot{margin-top:26px;text-align:center;font-size:12px;color:#6b7280;line-height:2}
.b2-foot a{color:#6b7280}
@media (prefers-reduced-motion:reduce){.b2-cta{animation:none}}
`;
