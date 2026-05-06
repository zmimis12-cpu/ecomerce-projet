import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { BatchDetailClient } from "@/components/delivery-batch/batch-detail-client";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Détail Groupe Livraison" };
export const dynamic = "force-dynamic";

const STATUS_CFG = {
  draft:             { label:"Brouillon",          cls:"bg-gray-100 text-gray-700" },
  sent:              { label:"Envoyé Digylog",     cls:"bg-blue-100 text-blue-800" },
  labels_downloaded: { label:"Tickets téléchargés",cls:"bg-violet-100 text-violet-800" },
  bl_downloaded:     { label:"BL téléchargé",      cls:"bg-green-100 text-green-800" },
  completed:         { label:"Terminé",             cls:"bg-emerald-100 text-emerald-800" },
} as const;

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(["super_admin","admin","manager"]);

  const { data: batch } = await supabaseAdmin
    .from("delivery_batches")
    .select("*")
    .eq("id", id)
    .single();

  if (!batch) notFound();

  const b = batch as {
    id: string; batch_number: string; status: string;
    total_orders: number; total_products: number;
    bl_id: number | null; notes: string | null;
    sent_at: string | null; created_at: string;
  };

  // Product summary
  const { data: summary } = await supabaseAdmin
    .from("delivery_batch_product_summary")
    .select("product_name, sku, total_quantity, order_count")
    .eq("batch_id", id)
    .order("total_quantity", { ascending: false });

  // Batch orders with order details
  const { data: batchOrders } = await supabaseAdmin
    .from("delivery_batch_orders")
    .select(`
      id, tracking_number, status, error_message,
      orders (
        id, order_number, customer_name, customer_phone, customer_city,
        total_amount_mad, delivery_external_status, delivery_status,
        order_items ( quantity, products ( name, sku ) )
      )
    `)
    .eq("batch_id", id)
    .order("created_at");

  type ProdSummary = { product_name: string; sku: string; total_quantity: number; order_count: number };
  type BatchOrderRow = {
    id: string; tracking_number: string | null; status: string; error_message: string | null;
    orders: {
      id: string; order_number: string; customer_name: string; customer_phone: string;
      customer_city: string; total_amount_mad: number;
      delivery_external_status: string | null; delivery_status: string | null;
      order_items: { quantity: number; products: { name: string; sku: string } | null }[];
    } | null;
  };

  const cfg = STATUS_CFG[b.status as keyof typeof STATUS_CFG] ?? { label: b.status, cls: "bg-gray-100 text-gray-600" };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <Link href="/admin/delivery/batches"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Groupes
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">{b.batch_number}</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", cfg.cls)}>
              {cfg.label}
            </span>
            <span className="text-sm text-muted-foreground">
              {b.total_orders} commande(s) · {b.total_products} produit(s)
            </span>
            {b.bl_id && (
              <span className="text-sm font-mono text-violet-700 font-semibold">BL #{b.bl_id}</span>
            )}
            {b.sent_at && (
              <span className="text-xs text-muted-foreground">
                Envoyé: {new Date(b.sent_at).toLocaleString("fr-MA")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Product summary */}
      {(summary ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Préparation produits — par quantité
          </h2>
          <div className="rounded-xl border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {["Produit","SKU","Qté totale","Nb commandes"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {((summary ?? []) as ProdSummary[]).map((p, i) => (
                  <tr key={i} className="hover:bg-secondary/20">
                    <td className="px-4 py-3 font-medium">{p.product_name}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{p.sku || "—"}</td>
                    <td className="px-4 py-3 font-mono font-bold text-lg text-primary">{p.total_quantity}</td>
                    <td className="px-4 py-3 font-mono text-center">{p.order_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Actions + Orders table (client component for interactivity) */}
      <BatchDetailClient
        batchId={id}
        status={String(b.status)}
        paymentStatus={String((b as Record<string,unknown>).payment_status ?? "unpaid")}
        trackings={(batchOrders ?? []).map((bo: unknown) => (bo as Record<string,unknown>).tracking_number as string).filter(Boolean) as string[]}
      />
    </div>
  );
}
