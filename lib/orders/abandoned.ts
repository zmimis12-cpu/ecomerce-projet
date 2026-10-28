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
  else q = q.neq("status", "converted"); // « Tous » = seulement les vrais abandons
  const { data, error } = await q;
  if (error) return { rows: [], missingTable: /abandoned_carts/.test(error.message) };
  let rows = (data ?? []) as unknown as AbandonedCart[];

  // Pas de commande créée : si le client a commandé (même numéro, n'importe quel produit)
  // après son panier, ce n'est plus un abandon → on le marque "converted" et on le cache.
  if (opts.status !== "converted") {
    const phones = [...new Set(rows.map((r) => r.customer_phone).filter(Boolean))];
    const ordered = new Map<string, { id: string; created_at: string }[]>();
    for (let i = 0; i < phones.length; i += 150) {
      const { data: os } = await supabaseAdmin.from("orders").select("id, customer_phone, created_at")
        .in("customer_phone", phones.slice(i, i + 150)).gte("created_at", since);
      for (const o of (os ?? []) as { id: string; customer_phone: string; created_at: string }[])
        (ordered.get(o.customer_phone) ?? ordered.set(o.customer_phone, []).get(o.customer_phone)!).push(o);
    }
    const done: { cart: string; order: string }[] = [];
    rows = rows.filter((r) => {
      const t = new Date(r.created_at).getTime() - 3600e3; // commande juste avant/après le panier
      const o = (ordered.get(r.customer_phone) ?? []).find((x) => new Date(x.created_at).getTime() >= t);
      if (o) { done.push({ cart: r.id, order: o.id }); return false; }
      return true;
    });
    if (done.length) {
      await Promise.all(done.map((d) => supabaseAdmin.from("abandoned_carts" as never)
        .update({ status: "converted", order_id: d.order, updated_at: new Date().toISOString() } as never).eq("id", d.cart)));
    }
  }
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

/** Message WhatsApp de relance (modifiable dans la page Paniers abandonnés).
 *  Variables : {prenom} {produit} {prix} {ville} */
export const DEFAULT_ABANDONED_WA = `السلام عليكم {prenom} 👋
معاك HajtekZone.
شفنا بلي بديتي الطلب ديال {produit} وما كملتيهش، واش كان شي مشكل؟ 🙏

إلا باغيه، غير صيفط لينا:
📍 المدينة
🏠 العنوان
وحنا نكملو ليك الطلب من هنا ✅

🚚 التوصيل لباب الدار لجميع المدن
💵 الدفع عند الاستلام
📦 تقدر تحل الكولية وتشوف السلعة قبل ما تخلص

الكمية محدودة فهاد الدفعة، واش نكملو ليك؟ 😊`;

export async function getAbandonedWaTemplate(): Promise<string> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "abandoned_wa_template").maybeSingle();
  const v = (data as { value?: unknown } | null)?.value;
  let t: unknown = v;
  try { if (typeof v === "string" && v.startsWith('"')) t = JSON.parse(v); } catch { /* texte brut */ }
  return typeof t === "string" && t.trim() ? t : DEFAULT_ABANDONED_WA;
}
