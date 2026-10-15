import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Truck, ShieldCheck, PhoneCall, RefreshCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getStoreProducts } from "@/lib/store/catalog";
import { StoreHeader } from "@/components/store/store-header";
import { ProductCard } from "@/components/store/cross-sell";
import { Cairo } from "next/font/google";

const cairo = Cairo({ subsets: ["arabic", "latin"], weight: ["400", "600", "700", "800", "900"], variable: "--font-cairo", display: "swap" });

/**
 * Boutique HajtekZone — page d'accueil publique (catalogue + confiance).
 * Un membre de l'équipe déjà connecté est envoyé directement sur /admin.
 */
export const metadata: Metadata = {
  title: "HajtekZone — منتجات عملية، الدفع عند الاستلام",
  description: "HajtekZone (ODT Deals) : produits maison, bien-être et tech livrés partout au Maroc, paiement à la livraison.",
  robots: { index: true, follow: true },
};
export const dynamic = "force-dynamic";

export default async function HomePage() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/admin");
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
  }
  const products = await getStoreProducts().catch(() => []);

  return (
    <main dir="rtl" lang="ar" className={`${cairo.variable} min-h-screen bg-white text-neutral-900`} style={{ fontFamily: "var(--font-cairo), sans-serif" }}>
      <StoreHeader products={products.map((p) => ({ slug: p.slug, title: p.title, image: p.image, price: p.price }))} />

      {/* Hero */}
      <section className="relative overflow-hidden bg-neutral-950 text-white">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[#D4A93F]/25 blur-3xl" />
        <div className="relative mx-auto max-w-5xl px-4 py-12 text-center sm:py-16">
          <p className="mb-2 text-xs font-bold tracking-widest text-[#F3D98B]">HAJTEK ZONE</p>
          <h1 className="text-[26px] font-black leading-tight sm:text-4xl">منتجات عملية لحياة أسهل</h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-white/70">اختر منتجك، أكد طلبك فالهاتف، وخلص غير ملي يوصلك. توصيل لجميع مدن المغرب.</p>
          <a href="#products" className="mt-6 inline-block rounded-full bg-gradient-to-r from-[#F3D98B] to-[#B8860B] px-7 py-3 text-sm font-extrabold text-neutral-900 shadow-lg transition hover:scale-[1.03]">تسوق الآن</a>
        </div>
      </section>

      {/* Confiance */}
      <section className="border-b bg-[#faf7f0]">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 px-4 py-5 text-center text-[12px] font-bold sm:grid-cols-4">
          {[
            { i: Truck, t: "توصيل 24–72 ساعة" },
            { i: ShieldCheck, t: "الدفع عند الاستلام" },
            { i: PhoneCall, t: "تأكيد بالهاتف" },
            { i: RefreshCcw, t: "استبدال إلا كان عيب" },
          ].map(({ i: I, t }) => (
            <div key={t} className="flex flex-col items-center gap-1.5 rounded-xl bg-white p-3 shadow-sm">
              <I className="h-5 w-5 text-[#B8860B]" />{t}
            </div>
          ))}
        </div>
      </section>

      {/* Produits */}
      <section id="products" className="mx-auto max-w-5xl px-3 py-8">
        <h2 className="mb-4 text-center text-xl font-extrabold">منتجاتنا</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => <ProductCard key={p.slug} p={p} />)}
        </div>
      </section>

      {/* Entreprise (FR/EN — exigé par Meta / TikTok) */}
      <section dir="ltr" className="bg-neutral-50">
        <div className="mx-auto max-w-5xl px-4 py-8 text-sm leading-relaxed text-neutral-600">
          <h3 className="mb-2 text-base font-bold text-neutral-900">About HajtekZone</h3>
          <p>HajtekZone is an online store operated by <b>ODT Deals</b>. We sell practical home, wellness and tech products in Morocco,
            delivered by professional carriers and paid in cash on delivery. Contact: <a className="underline" href="mailto:contact@hajtek.ma">contact@hajtek.ma</a>.</p>
        </div>
      </section>

      <footer className="bg-neutral-950 px-4 py-8 text-center text-[12px] text-neutral-400">
        <div className="mb-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-neutral-300">
          <Link href="/a-propos">من نحن</Link>
          <Link href="/conditions">شروط البيع والاسترجاع</Link>
          <Link href="/confidentialite">سياسة الخصوصية</Link>
          <Link href="/suppression-donnees">حذف المعطيات</Link>
          <Link href="/login" className="text-neutral-500">Staff</Link>
        </div>
        © {new Date().getFullYear()} HajtekZone · ODT Deals
      </footer>
    </main>
  );
}
