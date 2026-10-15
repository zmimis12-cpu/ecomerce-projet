import Link from "next/link";
import type { StoreProduct } from "@/lib/store/catalog";

/** « منتجات أخرى قد تعجبك » — autres produits de la boutique (page produit / accueil). */
export function CrossSell({ products, exclude, title = "منتجات أخرى قد تعجبك" }: { products: StoreProduct[]; exclude?: string; title?: string }) {
  const list = products.filter((p) => p.slug !== exclude).slice(0, 6);
  if (!list.length) return null;
  return (
    <section dir="rtl" className="bg-[#faf7f0] px-3 py-8">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-4 text-center text-lg font-extrabold text-neutral-900">{title}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {list.map((p) => <ProductCard key={p.slug} p={p} />)}
        </div>
      </div>
    </section>
  );
}

export function ProductCard({ p }: { p: StoreProduct }) {
  const pct = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  return (
    <Link href={`/lp/${p.slug}`}
      className="group block overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-square bg-neutral-100">
        {p.image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.image} alt={p.title} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />}
        {pct > 0 && <span className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">-{pct}%</span>}
      </div>
      <div className="p-2.5">
        <p className="line-clamp-2 min-h-[2.6em] text-[13px] font-bold leading-snug text-neutral-900">{p.title}</p>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-[15px] font-extrabold text-[#B8860B]">{p.price} درهم</span>
          {pct > 0 && <span className="text-[11px] text-neutral-400 line-through">{p.oldPrice} درهم</span>}
        </div>
        <span className="mt-2 block rounded-full bg-neutral-900 py-1.5 text-center text-[12px] font-bold text-white transition group-hover:bg-[#B8860B]">اطلب الآن</span>
      </div>
    </Link>
  );
}
