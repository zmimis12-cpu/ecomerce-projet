import type { Metadata } from "next";
import Link from "next/link";
import { Store, ExternalLink } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBumpConfig, getStoreProducts } from "@/lib/store/catalog";
import { readStoreConfig } from "@/lib/store/config";
import { StoreBumpsEditor } from "@/components/store/bumps-editor";
import { StoreSettingsEditor } from "@/components/store/settings-editor";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Boutique" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "accueil", label: "Accueil & design" },
  { key: "produits", label: "Produits" },
  { key: "upsells", label: "Upsells" },
] as const;

export default async function StoreAdminPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireRole(["super_admin", "admin", "manager"]);
  const tab = (await searchParams).tab ?? "accueil";
  const [storeProducts, cfg, bumps, { data: all }] = await Promise.all([
    getStoreProducts(),
    readStoreConfig(),
    getBumpConfig(),
    supabaseAdmin.from("products").select("id, name, sale_price_mad, purchase_price_mad, packaging_cost_mad").eq("is_active", true).order("name"),
  ]);
  const catalog = ((all ?? []) as { id: string; name: string; sale_price_mad: number; purchase_price_mad: number | null; packaging_cost_mad: number | null }[])
    .map((p) => ({ id: p.id, name: p.name, price: Number(p.sale_price_mad), cost: p.purchase_price_mad != null ? Number(p.purchase_price_mad) + Number(p.packaging_cost_mad ?? 0) : null }));
  const mains = storeProducts.map((p) => ({ id: p.productId, title: p.title, image: p.image, price: p.price, slug: p.slug }));

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

      {tab === "upsells" ? (
        <>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Pour chaque produit, jusqu&apos;à 3 produits proposés <b>« en même temps »</b> dans le formulaire (case « 🎁 أضف لطلبك بثمن خاص »).
            Le prix spécial est appliqué côté serveur ; l&apos;upsell part dans le même colis et est compté dans le profit.
          </p>
          <StoreBumpsEditor mains={mains} catalog={catalog} initial={bumps} />
        </>
      ) : (
        <StoreSettingsEditor tab={tab === "produits" ? "produits" : "accueil"} initial={cfg} products={mains} />
      )}
    </div>
  );
}
