import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { EditOrderForm } from "@/components/orders/edit-order-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { data } = await supabaseAdmin.from("orders").select("order_number").eq("id", id).maybeSingle();
  return { title: `Modifier ${(data as { order_number?: string } | null)?.order_number ?? "commande"}` };
}

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(["super_admin","admin","manager"]);

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select(`
      id, order_number, customer_name, customer_phone,
      customer_city, customer_address, notes, status,
      shipping_charge, source,
      order_items (
        quantity, product_id,
        products ( id, name, sku, sale_price_mad )
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  type OItem = { quantity: number; product_id: string; products: { id: string; name: string; sku: string; sale_price_mad: number } | null };
  type Order = {
    id: string; order_number: string; customer_name: string; customer_phone: string;
    customer_city: string; customer_address: string; notes: string | null;
    status: string; shipping_charge: number; source: string | null;
    order_items: OItem[];
  };
  const o = order as unknown as Order;

  // Block editing of delivered/paid orders
  const blocked = ["sent_to_delivery","in_transit","delivered","paid","returned"];
  if (blocked.includes(o.status)) {
    redirect(`/admin/orders/${id}`);
  }

  // Load products for select
  const { data: products } = await supabaseAdmin
    .from("products")
    .select("id, name, sku, sale_price_mad")
    .eq("is_active", true)
    .order("name");

  type Prod = { id: string; name: string; sku: string; sale_price_mad: number };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link href={`/admin/orders/${id}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
          {o.order_number}
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Modifier la commande</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {o.order_number} · Statut: <strong>{o.status}</strong>
        </p>
      </div>

      <EditOrderForm
        orderId={o.id}
        defaultValues={{
          customer_name:    o.customer_name,
          customer_phone:   o.customer_phone,
          customer_city:    o.customer_city,
          customer_address: o.customer_address ?? "",
          notes:            o.notes ?? "",
          shipping_charge:  o.shipping_charge ?? 0,
          source:           o.source ?? "",
          product_id:       o.order_items[0]?.product_id ?? "",
          quantity:         o.order_items[0]?.quantity ?? 1,
        }}
        products={(products ?? []) as Prod[]}
      />
    </div>
  );
}
