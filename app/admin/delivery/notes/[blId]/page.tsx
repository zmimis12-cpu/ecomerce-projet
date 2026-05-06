import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import { BatchDetailClient } from "@/components/delivery-batch/batch-detail-client";

export const metadata: Metadata = { title: "Delivery Note" };
export const dynamic = "force-dynamic";

type ProductSummaryRow = {
  product_id: string | null;
  product_name: string;
  sku: string | null;
  total_quantity: number;
  order_count: number;
  image_url: string | null;
};

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_city: string;
  total_amount_mad: number;
  status: string;
  delivery_tracking_number: string | null;
  delivery_external_status: string | null;
  bl_id: number | null;
};

function mad(n: number) {
  return n.toLocaleString("fr-MA", { minimumFractionDigits: 0 }) + " MAD";
}

export default async function DeliveryNoteDetailPage({
  params,
}: {
  params: Promise<{ blId: string }>;
}) {
  const { blId } = await params;
  await requireRole(["super_admin","admin","manager"]);

  // Load batch
  const { data: batch } = await supabaseAdmin
    .from("delivery_batches")
    .select("*")
    .eq("id", blId)
    .maybeSingle();

  if (!batch) notFound();
  const b = batch as Record<string, unknown>;

  // Load product summary
  const { data: products } = await supabaseAdmin
    .from("delivery_batch_product_summary")
    .select(`
      product_id, product_name, sku, total_quantity, order_count,
      products ( images:product_images ( public_url, is_primary ) )
    `)
    .eq("batch_id", blId)
    .order("total_quantity", { ascending: false });

  // Load orders in this batch
  const { data: batchOrders } = await supabaseAdmin
    .from("delivery_batch_orders")
    .select(`
      order_id, tracking_number, status, error_message,
      orders (
        id, order_number, customer_name, customer_phone, customer_city,
        total_amount_mad, status, delivery_tracking_number,
        delivery_external_status, bl_id,
        order_items ( quantity, products ( name, sku ) )
      )
    `)
    .eq("batch_id", blId)
    .order("created_at");

  // Flatten product summary with images
  type RawProd = {
    product_id: string | null; product_name: string; sku: string | null;
    total_quantity: number; order_count: number;
    products: { images: { public_url: string; is_primary: boolean }[] } | null;
  };

  const productRows: ProductSummaryRow[] = ((products ?? []) as RawProd[]).map((p) => {
    const imgs = p.products?.images ?? [];
    const primary = imgs.find((i) => i.is_primary) ?? imgs[0] ?? null;
    return {
      product_id:    p.product_id,
      product_name:  p.product_name,
      sku:           p.sku,
      total_quantity:p.total_quantity,
      order_count:   p.order_count,
      image_url:     primary?.public_url ?? null,
    };
  });

  // Flatten orders
  type RawBO = {
    order_id: string; tracking_number: string | null;
    status: string; error_message: string | null;
    orders: OrderRow & {
      order_items: { quantity: number; products: { name: string; sku: string } | null }[];
    } | null;
  };

  const orderRows = ((batchOrders ?? []) as RawBO[]).map((bo) => ({
    ...bo.orders,
    batch_status:    bo.status,
    batch_error:     bo.error_message,
    tracking_number: bo.tracking_number ?? bo.orders?.delivery_tracking_number,
    items: bo.orders?.order_items ?? [],
  })).filter((o) => o?.id);

  const totalCod = orderRows.reduce((s, o) => s + ((o as { total_amount_mad?: number }).total_amount_mad ?? 0), 0);
  const totalQty = productRows.reduce((s, p) => s + p.total_quantity, 0);

  const PAY_CFG = {
    unpaid:  { label:"Non payé",  cls:"bg-red-100 text-red-700" },
    partial: { label:"Partiel",   cls:"bg-amber-100 text-amber-800" },
    paid:    { label:"Payé",      cls:"bg-green-100 text-green-800" },
  };
  const payStatus = String(b.payment_status ?? "unpaid") as keyof typeof PAY_CFG;
  const payCfg = PAY_CFG[payStatus] ?? PAY_CFG.unpaid;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/delivery/notes"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" /> Delivery Notes
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-semibold font-mono">{String(b.batch_number)}</span>
      </div>

      {/* Header card */}
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">
              Delivery Note
            </p>
            <h1 className="text-2xl font-bold tracking-tight font-mono">
              {String(b.batch_number)}
            </h1>
            {!!b.bl_id && (
              <p className="text-sm text-violet-700 font-semibold mt-1">
                BL Digylog #{Number(b.bl_id)}
              </p>
            )}
          </div>
          <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-bold", payCfg.cls)}>
            {payCfg.label}
          </span>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label:"Commandes",    value:String(b.total_orders ?? orderRows.length) },
            { label:"Produits",     value:`${totalQty} unités` },
            { label:"Total COD",    value:mad(totalCod) },
            { label:"Store",        value:String(b.store_name ?? "—") },
          ].map((k) => (
            <div key={k.label} className="rounded-xl bg-secondary/40 px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
              <p className="text-sm font-bold">{k.value}</p>
            </div>
          ))}
        </div>

        {/* Dates */}
        <div className="flex gap-4 mt-4 text-xs text-muted-foreground">
          <span>Créé: {new Date(String(b.created_at)).toLocaleDateString("fr-MA", { dateStyle:"long" })}</span>
          {!!b.sent_at && <span>Envoyé: {new Date(String(b.sent_at)).toLocaleDateString("fr-MA")}</span>}
        </div>
      </div>

      {/* Client actions — download labels, BL, sync, mark paid */}
      <BatchDetailClient
        batchId={blId}
        blId={b.bl_id as number | null}
        status={String(b.status)}
        paymentStatus={String(b.payment_status ?? "unpaid")}
        trackings={orderRows.map((o) => (o as {tracking_number?: string}).tracking_number).filter(Boolean) as string[]}
      />

      {/* ── Product preparation summary ── */}
      {productRows.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b bg-secondary/20">
            <h2 className="text-sm font-bold">Préparation stock — produits à préparer</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Trié par quantité décroissante</p>
          </div>
          <div className="divide-y">
            {productRows.map((p, i) => (
              <div key={p.product_id ?? i} className="flex items-center gap-4 px-5 py-3 hover:bg-secondary/10">
                {/* Rank */}
                <span className="text-xs font-bold text-muted-foreground w-5 text-center">{i+1}</span>

                {/* Image */}
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-secondary shrink-0">
                  {p.image_url ? (
                    <Image src={p.image_url} alt={p.product_name} width={48} height={48}
                      className="w-full h-full object-cover" unoptimized />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 text-xl">📦</div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{p.product_name}</p>
                  {p.sku && <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>}
                </div>

                {/* Stats */}
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-primary">{p.total_quantity}</p>
                  <p className="text-[10px] text-muted-foreground">{p.order_count} commandes</p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-secondary/10 border-t flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-bold text-sm">{totalQty} unités</p>
          </div>
        </div>
      )}

      {/* ── Orders table ── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b bg-secondary/20">
          <h2 className="text-sm font-bold">Commandes ({orderRows.length})</h2>
        </div>
        {orderRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Aucune commande</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {["N° Commande","Client","Ville","Produits","COD","Tracking","Statut Digylog",""].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {orderRows.map((o, i) => {
                  const ord = o as {
                    id?: string; order_number?: string; customer_name?: string;
                    customer_phone?: string; customer_city?: string;
                    total_amount_mad?: number; status?: string;
                    delivery_external_status?: string | null;
                    tracking_number?: string | null;
                    batch_error?: string | null;
                    items?: { quantity: number; products: { name: string; sku: string } | null }[];
                  };
                  const itemStr = (ord.items ?? [])
                    .map((it) => `${it.products?.name ?? it.products?.sku ?? "?"} ×${it.quantity}`)
                    .join(", ");
                  return (
                    <tr key={ord.id ?? i} className="hover:bg-secondary/20">
                      <td className="px-4 py-2.5 font-mono font-medium">{ord.order_number}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{ord.customer_name}</p>
                        <p className="text-muted-foreground">{ord.customer_phone}</p>
                      </td>
                      <td className="px-4 py-2.5">{ord.customer_city}</td>
                      <td className="px-4 py-2.5 max-w-[160px] truncate text-muted-foreground">{itemStr || "—"}</td>
                      <td className="px-4 py-2.5 font-mono font-semibold">{mad(ord.total_amount_mad ?? 0)}</td>
                      <td className="px-4 py-2.5">
                        {ord.tracking_number
                          ? <span className="font-mono bg-secondary px-1.5 py-0.5 rounded text-[10px]">{ord.tracking_number}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {ord.delivery_external_status
                          ? <span className="text-muted-foreground">{ord.delivery_external_status}</span>
                          : ord.batch_error
                          ? <span className="text-red-600 font-medium">✕ {ord.batch_error}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {ord.id && (
                          <Link href={`/admin/orders/${ord.id}`}
                            className="text-primary hover:underline">→</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
