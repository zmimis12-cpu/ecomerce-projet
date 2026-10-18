import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Truck, ShieldCheck, BadgeCheck, Headset, MapPin, ShoppingCart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getStoreProducts } from "@/lib/store/catalog";
import { getStoreConfig } from "@/lib/store/config";
import { StoreGrid } from "@/components/store/store-grid";
import { HajtekMark } from "@/components/brand/logo";
import { Cairo } from "next/font/google";

const cairo = Cairo({ subsets: ["arabic", "latin"], weight: ["400", "600", "700", "800", "900"], variable: "--font-cairo", display: "swap" });

/**
 * Boutique HajtekZone — page d'accueil publique, pilotée depuis
 * Admin → Marketing → Boutique (textes, bannière, produits visibles / mis en avant / ordre).
 * Un membre de l'équipe déjà connecté est envoyé directement sur /admin.
 */
export const metadata: Metadata = {
  title: "HajtekZone — منتجات عملية، الدفع عند الاستلام",
  description: "HajtekZone (ODT Deals) : produits maison, bien-être et tech livrés partout au Maroc, paiement à la livraison.",
  robots: { index: true, follow: true },
};
export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  // ?boutique=1 : l'équipe connectée peut voir la boutique comme un client
  const asClient = (await searchParams).boutique === "1";
  if (!asClient) try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/admin");
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
  }
  const [all, cfg] = await Promise.all([getStoreProducts().catch(() => []), getStoreConfig()]);
  const products = all.filter((p) => p.visible);
  const featured = products.filter((p) => p.featured);
  const wa = cfg.whatsapp.replace(/\D/g, "");
  const waIntl = !wa ? "" : wa.startsWith("0") ? `212${wa.slice(1)}` : wa;
  const trustIcons = [Truck, ShieldCheck, BadgeCheck, Headset];
  const nav = [
    { href: "#top", label: "الرئيسية" },
    { href: "#products", label: "المنتجات" },
    ...(featured.length ? [{ href: "#offers", label: "العروض" }] : []),
    { href: "#contact", label: "تواصل معنا" },
  ];

  return (
    <main id="top" dir="rtl" lang="ar" className={`${cairo.variable} min-h-screen bg-[#0b0b0b] text-white`} style={{ fontFamily: "var(--font-cairo), sans-serif" }}>
      {cfg.announcement && (
        <div className="bg-gradient-to-l from-[#F3D98B] to-[#D4A93F] px-3 py-1.5 text-center text-[12px] font-bold text-neutral-900">{cfg.announcement}</div>
      )}

      {/* En-tête */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0b0b]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <a href="#top" className="flex items-center gap-2.5">
            <HajtekMark className="h-10 w-10" />
            <span className="text-[15px] font-black tracking-[0.2em]" dir="ltr">HAJTEK <span className="text-[#D4A93F]">ZONE</span></span>
          </a>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((n, i) => (
              <a key={n.href} href={n.href}
                className={i === 1 ? "rounded-full bg-gradient-to-l from-[#F3D98B] to-[#D4A93F] px-4 py-1.5 text-sm font-bold text-neutral-900" : "rounded-full px-4 py-1.5 text-sm text-white/80 hover:text-white"}>
                {n.label}
              </a>
            ))}
          </nav>
          <a href="#products" aria-label="المنتجات" className="rounded-full border border-white/15 p-2 text-white/80 hover:text-white md:hidden"><ShoppingCart className="h-5 w-5" /></a>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
          {nav.map((n) => <a key={n.href} href={n.href} className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-[12px] text-white/80">{n.label}</a>)}
        </nav>
      </header>

      {/* Bannière — affichage réglable : Admin → Boutique → Accueil */}
      {(() => {
        const shopHref = featured.length ? "#offers" : "#products";
        // compact = sous une bannière : texte plus petit sur téléphone pour laisser la place à la bannière
        const text = (centered: boolean, compact = false) => (
          <div className={centered ? "text-center" : "text-center md:text-right"}>
            <p className={`text-xs font-black tracking-[0.3em] text-[#D4A93F] ${compact ? "mb-1 hidden sm:block" : "mb-2"}`} dir="ltr">HAJTEK ZONE</p>
            <h1 className={`font-black leading-tight sm:text-5xl ${compact ? "text-[22px]" : "text-[30px]"}`}>
              {cfg.heroTitle}
              {cfg.heroTitleGold && <span className="mt-1 block bg-gradient-to-l from-[#F3D98B] to-[#D4A93F] bg-clip-text text-transparent">{cfg.heroTitleGold}</span>}
            </h1>
            {cfg.heroSubtitle && <p className={`mx-auto max-w-md leading-relaxed text-white/70 ${compact ? "mt-2 text-[13px] sm:mt-4 sm:text-sm" : "mt-4 text-sm"} ${centered ? "" : "md:mx-0"}`}>{cfg.heroSubtitle}</p>}
            {cfg.heroCta && (
              <a href={shopHref}
                className={`${compact ? "mt-4 sm:mt-6" : "mt-6"} inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-[#F3D98B] to-[#D4A93F] px-7 py-3 text-sm font-black text-neutral-900 shadow-[0_8px_30px_rgba(212,169,63,0.35)] transition hover:scale-[1.03]`}>
                {cfg.heroCta} <ShoppingCart className="h-4 w-4" />
              </a>
            )}
          </div>
        );
        // Bannière : version téléphone si fournie, image en entier, pleine largeur
        const banner = (
          <picture>
            {cfg.heroImageMobile && <source media="(max-width: 767px)" srcSet={cfg.heroImageMobile} />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cfg.heroImage} alt="HajtekZone" fetchPriority="high" className="block h-auto w-full border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] sm:rounded-2xl sm:border" />
          </picture>
        );
        const layout = cfg.heroImage ? cfg.heroLayout : "side";

        if (layout === "banner") return (
          <section className="border-b border-white/10">
            <div className="mx-auto max-w-6xl sm:px-4 sm:py-6"><a href={shopHref} className="block">{banner}</a></div>
          </section>
        );
        if (layout === "full") return (
          <section className="relative overflow-hidden border-b border-white/10">
            <div className="pointer-events-none absolute -left-20 top-0 h-80 w-80 rounded-full bg-[#D4A93F]/20 blur-3xl" />
            <div className="relative mx-auto max-w-6xl sm:px-4 sm:pt-6"><a href={shopHref} className="block">{banner}</a></div>
            <div className="relative mx-auto max-w-3xl px-4 py-5 sm:py-8 md:py-10">{text(true, true)}</div>
          </section>
        );
        return (
          <section className="relative overflow-hidden border-b border-white/10">
            <div className="pointer-events-none absolute -left-20 top-0 h-80 w-80 rounded-full bg-[#D4A93F]/20 blur-3xl" />
            <div className="relative mx-auto grid max-w-6xl items-center gap-6 px-4 py-10 md:grid-cols-2 md:py-14">
              {text(false)}
              <div className="relative">
                {cfg.heroImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cfg.heroImage} alt="" className="mx-auto max-h-[360px] w-full rounded-2xl object-contain" />
                ) : (
                  <div className="mx-auto grid max-w-sm grid-cols-2 gap-3">
                    {products.slice(0, 4).map((p) => p.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p.slug} src={p.image} alt="" className="aspect-square w-full rounded-2xl border border-white/10 object-cover" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      })()}

      {/* Garanties */}
      {cfg.showTrust && (
        <section className="border-b border-white/10 bg-[#111]">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-5 px-4 py-6 md:grid-cols-4 md:divide-x md:divide-x-reverse md:divide-white/10">
            {cfg.trust.map((t, i) => {
              const I = trustIcons[i % trustIcons.length];
              return (
                <div key={i} className="flex items-center justify-center gap-3 px-2">
                  <I className="h-9 w-9 shrink-0 text-[#D4A93F]" strokeWidth={1.6} />
                  <div><p className="text-[14px] font-extrabold">{t.title}</p><p className="text-[11px] text-white/55">{t.sub}</p></div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Mis en avant */}
      {featured.length > 0 && (
        <StoreGrid products={featured} title={cfg.featuredTitle} sectionId="offers" filters={false} />
      )}

      {/* Tous les produits */}
      <StoreGrid products={products} title={cfg.allTitle} subtitle="منتجات مختارة بعناية من أجلك" />

      {/* Bandeau du bas */}
      <section id="contact" className="border-t border-[#D4A93F]/30 bg-gradient-to-b from-[#151208] to-[#0b0b0b]">
        <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 py-8 text-center md:grid-cols-4 md:text-right">
          <div className="flex flex-col items-center gap-1 md:items-start">
            <HajtekMark className="h-14 w-14" />
            <p className="text-sm font-black tracking-[0.2em]" dir="ltr">HAJTEK <span className="text-[#D4A93F]">ZONE</span></p>
          </div>
          <div className="flex items-center justify-center gap-3 md:justify-start">
            <Truck className="h-9 w-9 text-[#D4A93F]" strokeWidth={1.6} />
            <div><p className="font-extrabold">{cfg.bottomTitle1}</p><p className="text-[12px] text-white/60">{cfg.bottomSub1}</p></div>
          </div>
          <div className="flex items-center justify-center gap-3 md:justify-start">
            <MapPin className="h-9 w-9 text-[#D4A93F]" strokeWidth={1.6} />
            <div><p className="font-extrabold">{cfg.bottomTitle2}</p><p className="text-[12px] text-white/60">{cfg.bottomSub2}</p></div>
          </div>
          <div className="flex flex-col items-center gap-2 md:items-end">
            <a href="#products" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-[#F3D98B] to-[#D4A93F] px-6 py-3 text-sm font-black text-neutral-900">
              {cfg.heroCta || "تسوق الآن"} <ShoppingCart className="h-4 w-4" />
            </a>
            {waIntl && <a href={`https://wa.me/${waIntl}`} target="_blank" rel="noopener" className="text-[12px] text-[#F3D98B] underline">واتساب: {cfg.whatsapp}</a>}
            {cfg.contactEmail && <a href={`mailto:${cfg.contactEmail}`} className="text-[12px] text-white/60" dir="ltr">{cfg.contactEmail}</a>}
          </div>
        </div>
      </section>

      {cfg.showAbout && (
        <section dir="ltr" className="border-t border-white/10 bg-[#0e0e0e]">
          <div className="mx-auto max-w-6xl px-4 py-6 text-[13px] leading-relaxed text-white/55">
            <h3 className="mb-1 text-sm font-bold text-white/85">About HajtekZone</h3>
            <p>HajtekZone is an online store operated by <b>ODT Deals</b>. We sell practical home, wellness and tech products in Morocco,
              delivered by professional carriers and paid in cash on delivery. Contact: <a className="underline" href={`mailto:${cfg.contactEmail}`}>{cfg.contactEmail}</a>.</p>
          </div>
        </section>
      )}

      <footer className="border-t border-white/10 bg-black px-4 py-6 text-center text-[12px] text-white/45">
        <div className="mb-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-white/70">
          <Link href="/a-propos">من نحن</Link>
          <Link href="/conditions">شروط البيع والاسترجاع</Link>
          <Link href="/confidentialite">سياسة الخصوصية</Link>
          <Link href="/suppression-donnees">حذف المعطيات</Link>
          <Link href="/login" className="text-white/35">Staff</Link>
        </div>
        © {new Date().getFullYear()} HajtekZone · ODT Deals
      </footer>

      {waIntl && (
        <a href={`https://wa.me/${waIntl}`} target="_blank" rel="noopener" aria-label="WhatsApp"
          className="fixed bottom-4 left-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-2xl text-white shadow-lg">
          <svg viewBox="0 0 24 24" className="h-7 w-7 fill-white"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 2.4 1 2.9.8 3.4.7.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 0 0-8.6 15l-1.4 5 5.1-1.3A10 10 0 1 0 12 2z"/></svg>
        </a>
      )}
    </main>
  );
}
