import type { Metadata } from "next";
import { Store } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBumpConfig, getStoreProducts } from "@/lib/store/catalog";
import { StoreBumpsEditor } from "@/components/store/bumps-editor";

export const metadata: Metadata = { title: "Boutique & upsells" };
export const dynamic = "force-dynamic";

export default async function StoreAdminPage() {
  await requireRole(["super_admin", "admin", "manager"]);
  const [storeProducts, cfg, { data: all }] = await Promise.all([
    getStoreProducts(),
    getBumpConfig(),
    supabaseAdmin.from("products").select("id, name, sale_price_mad, purchase_price_mad, packaging_cost_mad").eq("is_active", true).order("name"),
  ]);
  const catalog = ((all ?? []) as { id: string; name: string; sale_price_mad: number; purchase_price_mad: number | null; packaging_cost_mad: number | null }[])
    .map((p) => ({ id: p.id, name: p.name, price: Number(p.sale_price_mad), cost: p.purchase_price_mad != null ? Number(p.purchase_price_mad) + Number(p.packaging_cost_mad ?? 0) : null }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Store className="h-5 w-5 text-brand" /> Boutique & upsells</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Pour chaque produit vendu, choisis jusqu&apos;à 3 produits proposés <b>« en même temps »</b> dans le formulaire de commande
          (case à cocher « 🎁 أضف لطلبك بثمن خاص »). Le prix spécial est appliqué côté serveur, l&apos;upsell part dans le même colis
          (pas de livraison en plus) et est compté dans le profit.
        </p>
      </div>
      <StoreBumpsEditor
        mains={storeProducts.map((p) => ({ id: p.productId, title: p.title, image: p.image, price: p.price, slug: p.slug }))}
        catalog={catalog}
        initial={cfg}
      />
    </div>
  );
}
