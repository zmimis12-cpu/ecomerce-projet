/**
 * Habillage boutique (noir & doré) pour les pages publiques : من نحن, الشروط, الخصوصية…
 * Même en-tête et même pied de page que hajtek.ma → le client garde confiance.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { HajtekMark } from "@/components/brand/logo";
import { getStoreConfig } from "@/lib/store/config";
import { viaCdn } from "@/lib/media";

export const LEGAL_LINKS = [
  { href: "/a-propos", label: "من نحن" },
  { href: "/conditions", label: "شروط البيع والاسترجاع" },
  { href: "/confidentialite", label: "سياسة الخصوصية" },
  { href: "/suppression-donnees", label: "حذف المعطيات" },
];

export async function StoreShell({ title, subtitle, current, children }: {
  title: string; subtitle?: string; current: string; children: ReactNode;
}) {
  const cfg = await getStoreConfig().then(viaCdn).catch(() => null);
  const wa = (cfg?.whatsapp ?? "").replace(/\D/g, "");
  const waIntl = !wa ? "" : wa.startsWith("0") ? `212${wa.slice(1)}` : wa;
  const nav = [
    { href: "/", label: "الرئيسية" },
    { href: "/#products", label: "المنتجات" },
    { href: "/#contact", label: "تواصل معنا" },
  ];
  return (
    <main dir="rtl" lang="ar" className="min-h-screen bg-[#0b0b0b] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0b0b]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <HajtekMark className="h-9 w-9" />
            <span className="hidden whitespace-nowrap text-[12px] font-black tracking-[0.15em] min-[400px]:inline sm:text-[14px] sm:tracking-[0.2em]" dir="ltr">HAJTEK <span className="text-[#D4A93F]">ZONE</span></span>
          </Link>
          <nav className="flex gap-1">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-full px-2 py-1.5 text-[12px] text-white/75 hover:text-white sm:px-3 sm:text-sm">{n.label}</Link>
            ))}
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute -left-20 -top-10 h-64 w-64 rounded-full bg-[#D4A93F]/20 blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-4 py-10 text-center">
          <h1 className="bg-gradient-to-l from-[#F3D98B] to-[#D4A93F] bg-clip-text text-3xl font-black text-transparent sm:text-4xl">{title}</h1>
          {subtitle && <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/65">{subtitle}</p>}
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">{children}</div>

      {/* Autres pages d'information */}
      <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2 px-4 pb-10">
        {LEGAL_LINKS.filter((l) => l.href !== current).map((l) => (
          <Link key={l.href} href={l.href} className="rounded-full border border-[#D4A93F]/40 px-4 py-1.5 text-[13px] text-[#F3D98B] hover:bg-[#D4A93F]/10">{l.label}</Link>
        ))}
        <Link href="/#products" className="rounded-full bg-gradient-to-l from-[#F3D98B] to-[#D4A93F] px-5 py-1.5 text-[13px] font-black text-neutral-900">تسوق الآن</Link>
      </div>

      <footer className="border-t border-white/10 bg-black px-4 py-6 text-center text-[12px] text-white/45">
        <div className="mb-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-white/70">
          {LEGAL_LINKS.map((l) => <Link key={l.href} href={l.href} className={l.href === current ? "text-[#D4A93F]" : ""}>{l.label}</Link>)}
        </div>
        © {new Date().getFullYear()} HajtekZone · ODT Deals
      </footer>

      {waIntl && (
        <a href={`https://wa.me/${waIntl}`} target="_blank" rel="noopener" aria-label="WhatsApp"
          className="fixed bottom-4 left-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] shadow-lg">
          <svg viewBox="0 0 24 24" className="h-7 w-7 fill-white"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 2.4 1 2.9.8 3.4.7.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 0 0-8.6 15l-1.4 5 5.1-1.3A10 10 0 1 0 12 2z"/></svg>
        </a>
      )}
    </main>
  );
}

/** Bloc de contenu (carte sombre à bord doré) */
export function InfoCard({ icon, title, children }: { icon?: string; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#141414] p-5">
      <h2 className="mb-2 flex items-center gap-2 text-[17px] font-extrabold text-[#F3D98B]">{icon && <span>{icon}</span>}{title}</h2>
      <div className="space-y-2 text-[14px] leading-7 text-white/80">{children}</div>
    </section>
  );
}

/** Version anglaise / française repliée (utile pour Meta et TikTok) */
export function OtherLang({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="rounded-2xl border border-white/10 bg-[#111] p-5 text-left" dir="ltr">
      <summary className="cursor-pointer text-sm font-bold text-white/70">{label}</summary>
      <div className="mt-3 space-y-2 text-[13px] leading-6 text-white/65 [&_h3]:mt-3 [&_h3]:font-bold [&_h3]:text-white/80">{children}</div>
    </details>
  );
}
