import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DeliveryNotesClient } from "@/components/delivery-batch/delivery-notes-client";

export const metadata: Metadata = { title: "Récap Tickets" };
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
  try {
    await requireRole(["super_admin", "admin", "manager"]);
  } catch (e) {
    console.error("DELIVERY_NOTES_ERROR auth:", e);
    throw e;
  }

  // Load batches — safe fallback
  let rows: Batch[] = [];
  try {
    const { data: batches, error } = await supabaseAdmin
      .from("delivery_batches")
      .select("id,batch_number,status,shipping_company,store_name,total_orders,total_products,created_at,labels_downloaded_at")
      .not("status", "eq", "cancelled")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("DELIVERY_NOTES_ERROR batches query:", error.message);
    } else {
      rows = (batches ?? []) as Batch[];
    }
  } catch (e) {
    console.error("DELIVERY_NOTES_ERROR batches:", e);
  }

  // Load product summaries — safe fallback
  const productsByBatch: Map<string, ProductSummary[]> = new Map();

  if (rows.length > 0) {
    try {
      const batchIds = rows.map((r) => r.id);
      const { data: prods } = await supabaseAdmin
        .from("delivery_batch_product_summary")
        .select("batch_id,product_name,sku,total_quantity,order_count")
        .in("batch_id", batchIds)
        .order("total_quantity", { ascending: false });

      for (const p of (prods ?? []) as ProductSummary[]) {
        if (!productsByBatch.has(p.batch_id)) productsByBatch.set(p.batch_id, []);
        const arr = productsByBatch.get(p.batch_id)!;
        const key = p.sku || p.product_name;
        if (!arr.some((x) => (x.sku || x.product_name) === key) && arr.length < 3) {
          arr.push(p);
        }
      }
    } catch (e) {
      console.warn("DELIVERY_NOTES_ERROR product_summary:", e instanceof Error ? e.message : e);
      // Not fatal — page still works, just no product previews
    }

    // Auto-rebuild empty summaries — best effort only
    try {
      const empty = rows.filter((b) => b.total_orders > 0 && b.total_products === 0);
      if (empty.length > 0) {
        const { rebuildBatchProductSummary } = await import("@/lib/delivery/batch/actions");
        await Promise.allSettled(empty.map((b) => rebuildBatchProductSummary(b.id)));
      }
    } catch (e) {
      console.warn("DELIVERY_NOTES_ERROR rebuild:", e instanceof Error ? e.message : e);
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
