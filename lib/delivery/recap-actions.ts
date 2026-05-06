"use server";
/**
 * lib/delivery/recap-actions.ts
 * Generate a recap page (product preparation summary) as base64 HTML→PDF-ready data.
 * Returns the recap as an HTML string that the client renders/prints.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";

const MANAGER = ["super_admin","admin","manager"] as const;

export type RecapProduct = {
  rank: number;
  product_name: string;
  sku: string | null;
  total_quantity: number;
  order_count: number;
};

export type BatchRecap = {
  batch_number: string;
  store_name: string | null;
  shipping_company: string | null;
  created_at: string;
  total_orders: number;
  total_units: number;
  products: RecapProduct[];
};

export async function getBatchRecap(batchId: string): Promise<{
  ok: boolean;
  recap?: BatchRecap;
  error?: string;
}> {
  await requireRole([...MANAGER]);

  const { data: batch } = await supabaseAdmin
    .from("delivery_batches")
    .select("batch_number,store_name,shipping_company,created_at,total_orders")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) return { ok: false, error: "Batch introuvable." };

  const { data: prods } = await supabaseAdmin
    .from("delivery_batch_product_summary")
    .select("product_name,sku,total_quantity,order_count")
    .eq("batch_id", batchId)
    .order("total_quantity", { ascending: false });

  type PRow = { product_name: string; sku: string|null; total_quantity: number; order_count: number };
  const prodRows = (prods ?? []) as PRow[];

  const products: RecapProduct[] = prodRows.map((p, i) => ({
    rank: i + 1,
    product_name: p.product_name,
    sku: p.sku,
    total_quantity: p.total_quantity,
    order_count: p.order_count,
  }));

  const total_units = products.reduce((s, p) => s + p.total_quantity, 0);

  const b = batch as {
    batch_number: string; store_name: string|null;
    shipping_company: string|null; created_at: string; total_orders: number;
  };

  return {
    ok: true,
    recap: {
      batch_number:     b.batch_number,
      store_name:       b.store_name,
      shipping_company: b.shipping_company,
      created_at:       b.created_at,
      total_orders:     b.total_orders,
      total_units,
      products,
    },
  };
}
