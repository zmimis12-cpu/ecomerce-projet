import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DeliveryNotesClient } from "@/components/delivery-batch/delivery-notes-client";

export const metadata: Metadata = { title: "Delivery Notes" };
export const dynamic = "force-dynamic";

type Batch = {
  id: string;
  batch_number: string;
  status: string;
  shipping_company: string | null;
  store_name: string | null;
  total_orders: number;
  total_products: number;
  created_at: string;
  labels_downloaded_at: string | null;
};

type ProductSummary = {
  batch_id: string;
  product_name: string;
  sku: string | null;
  total_quantity: number;
  order_count: number;
};

export default async function DeliveryNotesPage() {
  await requireRole(["super_admin", "admin", "manager"]);

  const { data: batches } = await supabaseAdmin
    .from("delivery_batches")
    .select("id,batch_number,status,shipping_company,store_name,total_orders,total_products,created_at,labels_downloaded_at")
    .not("status", "eq", "cancelled")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (batches ?? []) as Batch[];

  // Fetch top-3 products per batch for inline summary
  const productsByBatch: Map<string, ProductSummary[]> = new Map();

  if (rows.length > 0) {
    const batchIds = rows.map((r) => r.id);
    const { data: prods } = await supabaseAdmin
      .from("delivery_batch_product_summary")
      .select("batch_id,product_name,sku,total_quantity,order_count")
      .in("batch_id", batchIds)
      .order("total_quantity", { ascending: false });

    const allProds = (prods ?? []) as ProductSummary[];
    for (const p of allProds) {
      if (!productsByBatch.has(p.batch_id)) productsByBatch.set(p.batch_id, []);
      const arr = productsByBatch.get(p.batch_id)!;
      if (arr.length < 3) arr.push(p); // keep top-3 only
    }
  }

  // Auto-rebuild product summary for batches that have orders but no summary
  const emptyBatches = rows.filter((b) => b.total_orders > 0 && b.total_products === 0);
  if (emptyBatches.length > 0) {
    const { rebuildBatchProductSummary } = await import("@/lib/delivery/batch/actions");
    await Promise.all(emptyBatches.map((b) => rebuildBatchProductSummary(b.id)));
    // Refresh product data after rebuild
    if (rows.length > 0) {
      const batchIds = rows.map((r) => r.id);
      const { data: freshProds } = await supabaseAdmin
        .from("delivery_batch_product_summary")
        .select("batch_id,product_name,sku,total_quantity,order_count")
        .in("batch_id", batchIds)
        .order("total_quantity", { ascending: false });
      for (const p of (freshProds ?? []) as ProductSummary[]) {
        if (!productsByBatch.has(p.batch_id)) productsByBatch.set(p.batch_id, []);
        const arr = productsByBatch.get(p.batch_id)!;
        if (arr.length < 3) arr.push(p);
      }
    }
  }

  const stores    = [...new Set(rows.map((r) => r.store_name).filter(Boolean))] as string[];
  const companies = [...new Set(rows.map((r) => r.shipping_company ?? "Digylog"))] as string[];

  return (
    <DeliveryNotesClient
      rows={rows}
      stores={stores}
      companies={companies}
      productsByBatch={Object.fromEntries(productsByBatch)}
    />
  );
}
