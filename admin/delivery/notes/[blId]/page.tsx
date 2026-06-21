import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { BatchDetailClient } from "@/components/delivery-batch/batch-detail-client";

export const metadata: Metadata = { title: "Delivery Note" };
export const dynamic = "force-dynamic";

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

  const { data: batch } = await supabaseAdmin
    .from("delivery_batches")
    .select("id,batch_number,status,payment_status,total_orders,total_products,store_name,shipping_company,sent_at,created_at,labels_downloaded_at")
    .eq("id", blId)
    .maybeSingle();

  if (!batch) notFound();
  type BatchRow = {
    id: string; batch_number: string; status: string;
    payment_status: string|null; total_orders: number; total_products: number;
    store_name: string|null; shipping_company: string|null;
    sent_at: string|null; created_at: string; labels_downloaded_at: string|null;
  };
  const b = batch as unknown as BatchRow;

  // ── Product summary — auto-rebuild if empty ────────────────────────────────
  type ProdRow = { product_id: string|null; product_name: string; sku: string|null; total_quantity: number; order_count: number };
  let prodRows: ProdRow[] = [];

  try {
    const { data: products } = await supabaseAdmin
      .from("delivery_batch_product_summary")
      .select("product_id,product_name,sku,total_quantity,order_count")
      .eq("batch_id", blId)
      .order("total_quantity", { ascending: false });
    prodRows = (products ?? []) as ProdRow[];
  } catch { /* table may not exist */ }

  // Auto-rebuild if empty — reads from order_items + orders.notes
  if (prodRows.length === 0) {
    try {
      const { rebuildBatchProductSummary } = await import("@/lib/delivery/batch/actions");
      await rebuildBatchProductSummary(blId);
      const { data: rebuilt } = await supabaseAdmin
        .from("delivery_batch_product_summary")
        .select("product_id,product_name,sku,total_quantity,order_count")
        .eq("batch_id", blId)
        .order("total_quantity", { ascending: false });
      prodRows = (rebuilt ?? []) as ProdRow[];
    } catch (e) {
      console.warn("[batch detail] rebuild failed:", e instanceof Error ? e.message : e);
    }
  }
  const productIds = prodRows.map((p) => p.product_id).filter(Boolean) as string[];

  type ImgRow = { product_id: string; public_url: string; is_primary: boolean };
  const imgMap = new Map<string, string>();
  if (productIds.length) {
    const { data: imgs } = await supabaseAdmin
      .from("product_images")
      .select("product_id,public_url,is_primary")
      .in("product_id", productIds);
    for (const img of (imgs ?? []) as ImgRow[]) {
      if (!imgMap.has(img.product_id) || img.is_primary) {
        imgMap.set(img.product_id, img.public_url);
      }
    }
  }

  // ── Orders — sorted by top product priority ──────────────────────────────
  // Build product priority map: productId → rank (0 = highest)
  const prodPriority = new Map<string, number>();
  prodRows.forEach((p, i) => { if (p.product_id) prodPriority.set(p.product_id, i); });

  const { data: batchOrders } = await supabaseAdmin
    .from("delivery_batch_orders")
    .select(`
      order_id, tracking_number, status,
      orders (
        id, order_number, customer_name, customer_phone, customer_city,
        total_amount_mad, status, delivery_tracking_number, delivery_external_status,
        order_items ( quantity, products ( id, name, sku ) )
      )
    `)
    .eq("batch_id", blId);

  type BORow = {
    order_id: string; tracking_number: string|null; status: string;
    orders: {
      id: string; order_number: string; customer_name: string; customer_phone: string;
      customer_city: string; total_amount_mad: number; status: string;
      delivery_tracking_number: string|null; delivery_external_status: string|null;
      order_items: { quantity: number; products: { id: string; name: string; sku: string }|null }[];
    }|null;
  };

  const rawOrders = ((batchOrders ?? []) as BORow[]).filter((bo) => bo.orders);

  // Sort orders by product priority (order's highest-qty product)
  const sortedOrders = rawOrders.sort((a, b) => {
    const getMinRank = (bo: BORow) => {
      const items = bo.orders?.order_items ?? [];
      let best = 9999;
      for (const it of items) {
        const pid = it.products?.id;
        if (pid) {
          const rank = prodPriority.get(pid) ?? 9999;
          if (rank < best) best = rank;
        }
      }
      return best;
    };
    return getMinRank(a) - getMinRank(b);
  });

  const trackings = sortedOrders
    .map((bo) => bo.tracking_number ?? bo.orders?.delivery_tracking_number)
    .filter(Boolean) as string[];

  const totalCod = sortedOrders.reduce((s, bo) => s + (bo.orders?.total_amount_mad ?? 0), 0);
  const totalQty = prodRows.reduce((s, p) => s + p.total_quantity, 0);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/delivery/notes"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />Delivery Notes
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-semibold font-mono">{b.batch_number}</span>
      </div>

      {/* Header */}
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Delivery Note</p>
            <h1 className="text-2xl font-bold tracking-tight font-mono">{b.batch_number}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {b.store_name ?? "—"} · {b.shipping_company ?? "Digylog"}
            </p>
          </div>
          {b.labels_downloaded_at && (
            <span className="inline-flex rounded-full bg-green-100 text-green-700 border border-green-200 px-3 py-1 text-xs font-bold">
              ✓ Tickets imprimés {new Date(b.labels_downloaded_at!).toLocaleDateString("fr-MA")}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label:"Commandes",   value: String(b.total_orders ?? sortedOrders.length) },
            { label:"Unités",      value: `${totalQty}` },
            { label:"Total COD",   value: mad(totalCod) },
            { label:"Produits",    value: `${prodRows.length} ref.` },
          ].map((k) => (
            <div key={k.label} className="rounded-xl bg-secondary/40 px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
              <p className="text-sm font-bold">{k.value}</p>
            </div>
          ))}
        </div>

        {/* Product debug info */}
        {prodRows.length === 0 && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
            ⚠ Aucun produit trouvé pour ce batch — vérifiez que les order_items sont liés aux orders.
            Le PDF recap sera vide.
          </div>
        )}
        {prodRows.length > 0 && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-xs text-green-800">
            ✓ {prodRows.length} produit(s) — {totalQty} unités — recap PDF prêt
          </div>
        )}
      </div>

      {/* Actions */}
      <BatchDetailClient
        batchId={blId}
        status={b.status}
        paymentStatus={b.payment_status ?? "unpaid"}
        trackings={trackings}
      />

      {/* ── PRODUCT PREPARATION SUMMARY ── */}
      {prodRows.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b bg-amber-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-amber-900">📦 Récapitulatif produits à préparer</h2>
              <p className="text-xs text-amber-700 mt-0.5">
                Trié par quantité — préparez dans cet ordre avant d&apos;imprimer les tickets
              </p>
            </div>
            <span className="font-mono font-bold text-amber-900 text-sm">{totalQty} unités</span>
          </div>
          <div className="divide-y">
            {prodRows.map((p, i) => {
              const imgUrl = p.product_id ? imgMap.get(p.product_id) : null;
              const pct    = totalQty > 0 ? Math.round(p.total_quantity / totalQty * 100) : 0;
              return (
                <div key={p.product_id ?? i} className="flex items-center gap-4 px-5 py-3 hover:bg-secondary/10">
                  {/* Rank */}
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                    i === 0 ? "bg-amber-400 text-white"
                    : i === 1 ? "bg-slate-300 text-slate-700"
                    : i === 2 ? "bg-orange-300 text-white"
                    : "bg-secondary text-muted-foreground"
                  }`}>
                    {i + 1}
                  </span>

                  {/* Image */}
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-secondary shrink-0">
                    {imgUrl ? (
                      <Image src={imgUrl} alt={p.product_name} width={48} height={48}
                        className="w-full h-full object-cover" unoptimized />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl">📦</div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{p.product_name}</p>
                    {p.sku && <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>}
                    {/* Progress bar */}
                    <div className="mt-1.5 h-1.5 bg-secondary rounded-full overflow-hidden w-32">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  {/* Quantity */}
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-black text-primary leading-none">×{p.total_quantity}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{p.order_count} commande{p.order_count > 1 ? "s" : ""}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-5 py-3 bg-secondary/10 border-t flex justify-between text-xs text-muted-foreground">
            <span>{prodRows.length} référence(s)</span>
            <span className="font-bold">{totalQty} unités au total</span>
          </div>
        </div>
      )}

      {/* ── ORDERS TABLE — sorted by product priority ── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b bg-secondary/20 flex items-center justify-between">
          <h2 className="text-sm font-bold">Commandes ({sortedOrders.length})</h2>
          <p className="text-xs text-muted-foreground">Trié par produit prioritaire</p>
        </div>
        {sortedOrders.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Aucune commande</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-secondary/20">
                  {["#","Commande","Client","Ville","Produits","COD","Tracking","Statut"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedOrders.map((bo, idx) => {
                  const o = bo.orders!;
                  const items = o.order_items ?? [];
                  const mainProd = items.reduce((best, it) => {
                    if (!best) return it;
                    const bRank = prodPriority.get(best.products?.id ?? "") ?? 9999;
                    const iRank = prodPriority.get(it.products?.id ?? "") ?? 9999;
                    return iRank < bRank ? it : best;
                  }, items[0]);
                  const otherProds = items.filter((it) => it !== mainProd);

                  return (
                    <tr key={o.id} className="hover:bg-secondary/20">
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-mono font-medium">{o.order_number}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{o.customer_name}</p>
                        <p className="text-muted-foreground">{o.customer_phone}</p>
                      </td>
                      <td className="px-4 py-2.5">{o.customer_city}</td>
                      <td className="px-4 py-2.5">
                        {mainProd && (
                          <p className="font-semibold text-primary">
                            {mainProd.products?.name ?? "—"} ×{mainProd.quantity}
                          </p>
                        )}
                        {otherProds.map((it, j) => (
                          <p key={j} className="text-muted-foreground">{it.products?.name ?? "—"} ×{it.quantity}</p>
                        ))}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-semibold">{mad(o.total_amount_mad)}</td>
                      <td className="px-4 py-2.5">
                        {(bo.tracking_number ?? o.delivery_tracking_number)
                          ? <span className="font-mono bg-secondary px-1.5 py-0.5 rounded">
                              {bo.tracking_number ?? o.delivery_tracking_number}
                            </span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {o.delivery_external_status ?? o.status ?? "—"}
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
