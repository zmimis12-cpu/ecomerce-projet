import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getAgents } from "@/lib/orders/queries";
import { OrderForm } from "@/components/orders/order-form";
import { createOrder } from "@/lib/orders/actions";

export const metadata: Metadata = { title: "Nouvelle commande" };

export default async function NewOrderPage() {
  await requireRole(["super_admin", "admin", "manager"]);
  const supabase = await createClient();

  // Fetch active products
  const { data: products } = await supabase
    .from("products")
    .select("id, name, sku, sale_price_mad, total_cost_mad")
    .eq("is_active", true)
    .order("name");

  const agents = await getAgents();

  const productList = (products ?? []) as unknown as {
    id: string; name: string; sku: string;
    sale_price_mad: number; total_cost_mad: number;
  }[];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/orders"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" /> Commandes
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">Nouvelle commande</span>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Nouvelle commande</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Créez une commande manuellement.
        </p>
      </div>

      {productList.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-sm font-medium">Aucun produit actif</p>
          <p className="text-xs text-muted-foreground mt-1">
            Activez d&apos;abord un produit avant de créer une commande.
          </p>
          <Link href="/admin/products"
            className="mt-3 inline-flex text-sm text-primary hover:underline">
            Gérer les produits →
          </Link>
        </div>
      ) : (
        <OrderForm products={productList} agents={agents} onSubmit={createOrder} />
      )}
    </div>
  );
}
