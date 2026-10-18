import type { Metadata } from "next";
import Link from "next/link";
import { Store, ExternalLink } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBumpConfig, getStoreProducts } from "@/lib/store/catalog";
import { readStoreConfig } from "@/lib/store/config";
import { StoreBumpsEditor } from "@/components/store/bumps-editor";
import { StoreSettingsEditor } from "@/components/store/settings-editor";
import { LpDesignEditor } from "@/components/store/lp-design-editor";
import { readLpDesign } from "@/lib/store/lp-design";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Boutique" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "accueil", label: "Accueil & design" },
  { key: "produits", label: "Produits" },
  { key: "upsells", label: "Upsells" },
  { key: "landing", label: "Landing pages" },
] as const;

export default async function StoreAdminPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireRole(["super_admin", "admin", "manager"]);
  const tab = (await searchParams).tab ?? "accueil";
  const [storeProducts, cfg, bumps, { data: all }, lpDesign, { data: lps }] = await Promise.all([
    getStoreProducts(),
    readStoreConfig(),
    getBumpConfig(),
    supabaseAdmin.from("products").select("id, name, sale_price_mad, purchase_price_mad, packaging_cost_mad").eq("is_active", true).order("name"),
    readLpDesign(),
    supabaseAdmin.from("landing_pages").select("slug, title, product_id, hero_image").eq("is_active", true).order("title"),
  ]);
  // Photos disponibles pour les choix « photo boutique » et « photo hero » : photos du produit + bannière de la LP
  type LpRow = { slug: string; title: string; product_id: string | null; hero_image: string | null };
  const lpRows = (lps ?? []) as LpRow[];
  const pids = [...new Set([...lpRows.map((l) => l.product_id), ...storeProducts.map((p) => p.productId)].filter(Boolean))] as string[];
  const { data: imgRows } = pids.length
    ? await supabaseAdmin.from("product_images").select("product_id, public_url, is_primary, display_order").in("product_id", pids)
    : { data: [] };
  const photosOf = new Map<string, { url: string; label?: string }[]>();
  for (const r of ((imgRows ?? []) as { product_id: string; public_url: string; is_primary: boolean; display_order: number | null }[])
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || (a.display_order ?? 99) - (b.display_order ?? 99))) {
    if (!r.public_url) continue;
    const arr = photosOf.get(r.product_id) ?? [];
    arr.push({ url: r.public_url, label: r.is_primary ? "Principale" : `Photo ${arr.length + 1}` });
    photosOf.set(r.product_id, arr);
  }
  const bannerOf = new Map(lpRows.filter((l) => l.product_id && l.hero_image).map((l) => [l.product_id!, l.hero_image!]));
  const lpPages = lpRows.map((l) => ({
    slug: l.slug, title: l.title,
    images: [...(l.product_id ? photosOf.get(l.product_id) ?? [] : []), ...(l.hero_image ? [{ url: l.hero_image, label: "Bannière LP" }] : [])],
  }));
  const catalog = ((all ?? []) as { id: string; name: string; sale_price_mad: number; purchase_price_mad: number | null; packaging_cost_mad: number | null }[])
    .map((p) => ({ id: p.id, name: p.name, price: Number(p.sale_price_mad), cost: p.purchase_price_mad != null ? Number(p.purchase_price_mad) + Number(p.packaging_cost_mad ?? 0) : null }));
  const mains = storeProducts.map((p) => ({ id: p.productId, title: p.title, image: p.image, price: p.price, slug: p.slug }));
  const productPhotos = Object.fromEntries(storeProducts.map((p) => [p.productId, {
    auto: photosOf.get(p.productId)?.[0]?.url ?? bannerOf.get(p.productId) ?? null,
    images: [...(photosOf.get(p.productId) ?? []), ...(bannerOf.get(p.productId) ? [{ url: bannerOf.get(p.productId)!, label: "Bannière LP" }] : [])],
  }]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><Store className="h-5 w-5 text-brand" /> Boutique hajtek.ma</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tout ce que voient tes clients : accueil, produits affichés, ordre, produits mis en avant et upsells.</p>
        </div>
        <a href="/?boutique=1" target="_blank" rel="noopener" className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-sm hover:bg-muted">
          Voir la boutique <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="flex gap-1 rounded-xl border bg-card p-1 shadow-sm">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/store?tab=${t.key}`}
            className={cn("flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium transition", tab === t.key ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted")}>
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "landing" ? (
        <>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Design de toutes tes landing pages <b>/lp/…</b> : sections (ordre, afficher/cacher), textes, options du formulaire, couleurs et vidéo.
            Règle pour <b>toutes</b> les pages ou pour <b>une seule</b>. Le contenu (titre, prix, offres X1/X2/X3, avantages, avis, FAQ) se modifie dans l&apos;éditeur de chaque landing page.
          </p>
          <LpDesignEditor initial={lpDesign} pages={lpPages} />
        </>
      ) : tab === "upsells" ? (
        <>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Pour chaque produit, jusqu&apos;à 3 produits proposés <b>« en même temps »</b> dans le formulaire (case « 🎁 أضف لطلبك بثمن خاص »).
            Le prix spécial est appliqué côté serveur ; l&apos;upsell part dans le même colis et est compté dans le profit.
          </p>
          <StoreBumpsEditor mains={mains} catalog={catalog} initial={bumps} />
        </>
      ) : (
        <StoreSettingsEditor tab={tab === "produits" ? "produits" : "accueil"} initial={cfg} products={mains} photos={productPhotos} />
      )}
    </div>
  );
}
