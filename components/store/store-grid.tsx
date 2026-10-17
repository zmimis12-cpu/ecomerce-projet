"use client";
/** Boutique : recherche + filtres par catégorie + grille de produits (style noir & doré). */
import { useMemo, useState } from "react";
import { Search, Flame } from "lucide-react";
import type { StoreProduct } from "@/lib/store/catalog";
import { cn } from "@/lib/utils";

export function StoreGrid({ products, title, subtitle, sectionId = "products", filters = true }: {
  products: StoreProduct[]; title: string; subtitle?: string; sectionId?: string; filters?: boolean;
}) {
  const cats = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean) as string[])], [products]);
  const [cat, setCat] = useState<string>("");
  const [q, setQ] = useState("");
  const list = products.filter((p) =>
    (!cat || p.category === cat) &&
    (!q.trim() || `${p.title} ${p.subtitle ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <section id={sectionId} className="mx-auto max-w-6xl px-3 py-10">
      {filters && <div className="mx-auto mb-5 flex max-w-md items-center gap-2 rounded-full border border-[#D4A93F]/40 bg-white/5 px-4">
        <Search className="h-4 w-4 text-[#D4A93F]" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن منتج…"
          className="h-11 w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none" />
      </div>}

      {filters && cats.length > 0 && (
        <div className="mb-8 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center">
          {["", ...cats].map((c) => (
            <button key={c || "all"} type="button" onClick={() => setCat(c)}
              className={cn("shrink-0 rounded-full border px-5 py-2 text-sm font-bold transition",
                cat === c ? "border-[#F3D98B] bg-gradient-to-l from-[#F3D98B] to-[#D4A93F] text-neutral-900"
                  : "border-white/20 text-white/80 hover:border-[#D4A93F]/70 hover:text-white")}>
              {c || "الكل"}
            </button>
          ))}
        </div>
      )}

      <div className="mb-6 text-center">
        <h2 className="flex items-center justify-center gap-4 text-2xl font-black text-white">
          <span className="h-0.5 w-12 bg-[#D4A93F]" />{title}<span className="h-0.5 w-12 bg-[#D4A93F]" />
        </h2>
        {subtitle && <p className="mt-1 text-sm text-white/60">{subtitle}</p>}
      </div>

      {list.length ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => <DarkProductCard key={p.slug} p={p} />)}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-white/50">ما كاين حتى منتج بهاد البحث.</p>
      )}
    </section>
  );
}

export function DarkProductCard({ p }: { p: StoreProduct }) {
  const pct = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  return (
    // <a> (rechargement complet) : la page produit doit exécuter ses scripts (pixel).
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a href={`/lp/${p.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141414] transition duration-200 hover:-translate-y-1 hover:border-[#D4A93F]/60 hover:shadow-[0_8px_30px_rgba(212,169,63,0.15)]">
      <div className="relative aspect-square overflow-hidden bg-neutral-900">
        {p.image && /* eslint-disable-next-line @next/next/no-img-element */
          <img src={p.image} alt={p.title} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" />}
        {pct > 0 && <span className="absolute right-2 top-2 rounded-md bg-[#F3C93F] px-2 py-0.5 text-[11px] font-black text-neutral-900">-{pct}%</span>}
        {p.featured && <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white"><Flame className="h-3 w-3 text-orange-400" />الأكثر مبيعاً</span>}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="line-clamp-2 text-[14px] font-extrabold leading-snug text-white">{p.title}</p>
        {p.subtitle && <p className="mt-0.5 line-clamp-1 text-[12px] text-white/55">{p.subtitle}</p>}
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <span className="text-[18px] font-black text-[#F3C93F]" dir="ltr">{p.price} DH</span>
          {pct > 0 && <span className="text-[12px] text-white/40 line-through" dir="ltr">{p.oldPrice} DH</span>}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/70">
          <span className="rounded bg-white px-1.5 py-px text-[10px] font-black text-neutral-900">COD</span> الدفع عند الاستلام
        </p>
        <span className="mt-auto block rounded-lg bg-gradient-to-l from-[#F3D98B] to-[#D4A93F] py-2 text-center text-[13px] font-black text-neutral-900 transition group-hover:brightness-110 [margin-top:12px]">
          اطلب الآن 🛒
        </span>
      </div>
    </a>
  );
}
