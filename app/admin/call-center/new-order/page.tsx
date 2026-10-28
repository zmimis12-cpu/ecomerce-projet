import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { OrderForm } from "@/components/orders/order-form";
import { createOrder } from "@/lib/orders/actions";
import { agentProductList } from "@/lib/call-center/agent-products";

export const metadata: Metadata = { title: "Nouvelle commande — Call Center" };
export const dynamic = "force-dynamic";

/** Agent call center : créer une commande, seulement pour ses produits attribués. */
export default async function CcNewOrderPage() {
  const session = await requireRole(["call_center_agent", "super_admin", "admin", "manager"]);
  const mine = await agentProductList(session.authId);

  const { data } = mine.length
    ? await supabaseAdmin.from("products").select("id, name, sku, sale_price_mad")
        .eq("is_active", true).in("id", mine).order("name")
    : { data: [] };
  // coût jamais envoyé au navigateur de l'agent
  const products = ((data ?? []) as { id: string; name: string; sku: string; sale_price_mad: number; total_cost_mad: number }[])
    .map((p) => ({ ...p, total_cost_mad: 0 }));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Nouvelle commande</h1>
        <p className="text-sm text-muted-foreground mt-1">Commande prise par téléphone / WhatsApp — elle vous est assignée.</p>
      </div>
      {products.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun produit ne vous est attribué. Demandez à l&apos;administrateur.
        </div>
      ) : (
        <OrderForm products={products} agents={[]} agentMode onSubmit={createOrder} />
      )}
    </div>
  );
}
