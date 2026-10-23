/** Paniers abandonnés — lecture (admin / call center). */
import { supabaseAdmin } from "@/lib/supabase/admin";

export type AbandonedCart = {
  id: string; created_at: string; updated_at: string; product_id: string | null; landing_page_slug: string | null;
  customer_name: string | null; customer_phone: string; customer_city: string | null;
  total_amount: number | null; quantity: number | null; creative_code: string | null;
  status: "pending" | "called" | "converted" | "not_interested"; order_id: string | null; handled_at: string | null;
  product_name?: string | null;
};

/** Paniers à traiter : laissés depuis au moins 30 min (le client a peut-être juste fini d'écrire). */
export async function listAbandonedCarts(opts: { status?: string; days?: number } = {}): Promise<{ rows: AbandonedCart[]; missingTable: boolean }> {
  const since = new Date(Date.now() - (opts.days ?? 7) * 86400e3).toISOString();
  const ready = new Date(Date.now() - 30 * 60e3).toISOString();
  let q = supabaseAdmin.from("abandoned_carts" as never)
    .select("id, created_at, updated_at, product_id, landing_page_slug, customer_name, customer_phone, customer_city, total_amount, quantity, creative_code, status, order_id, handled_at")
    .gte("created_at", since).order("created_at", { ascending: false }).limit(500);
  if (opts.status === "pending") q = q.eq("status", "pending").lte("updated_at", ready);
  else if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) return { rows: [], missingTable: /abandoned_carts/.test(error.message) };
  const rows = (data ?? []) as unknown as AbandonedCart[];
  const ids = [...new Set(rows.map((r) => r.product_id).filter(Boolean))] as string[];
  if (ids.length) {
    const { data: pr } = await supabaseAdmin.from("products").select("id, name").in("id", ids);
    const m = new Map(((pr ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
    rows.forEach((r) => { r.product_name = r.product_id ? m.get(r.product_id) ?? null : null; });
  }
  return { rows, missingTable: false };
}

export async function abandonedStats(days = 7) {
  const since = new Date(Date.now() - days * 86400e3).toISOString();
  const { data } = await supabaseAdmin.from("abandoned_carts" as never).select("status").gte("created_at", since);
  const c = { total: 0, pending: 0, called: 0, converted: 0, not_interested: 0 } as Record<string, number>;
  for (const r of (data ?? []) as { status: string }[]) { c.total++; c[r.status] = (c[r.status] ?? 0) + 1; }
  return c;
}
