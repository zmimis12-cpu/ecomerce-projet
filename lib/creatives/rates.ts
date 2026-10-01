/**
 * lib/creatives/rates.ts — calcul flexible du gain éditeur par commande livrée.
 * Priorité : tarif (éditeur + produit) > tarif produit (tous éditeurs) > tarif par défaut de l'éditeur.
 * Server-only.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { CommissionType } from "@/lib/creatives/queries";

export type Rate = { type: CommissionType; value: number; label: string };

export type RateBook = {
  defaults: Map<string, { type: CommissionType; value: number }>;
  rules: { editorId: string | null; productId: string; type: CommissionType; value: number }[];
};

export async function loadRateBook(): Promise<RateBook> {
  const [{ data: d }, { data: r }] = await Promise.all([
    supabaseAdmin.from("video_editor_settings" as never).select("user_id, commission_type, commission_value"),
    supabaseAdmin.from("video_editor_rates" as never).select("editor_id, product_id, commission_type, commission_value"),
  ]);
  return {
    defaults: new Map(((d ?? []) as { user_id: string; commission_type: CommissionType; commission_value: number }[])
      .map((x) => [x.user_id, { type: x.commission_type, value: Number(x.commission_value) }])),
    rules: ((r ?? []) as { editor_id: string | null; product_id: string; commission_type: CommissionType; commission_value: number }[])
      .map((x) => ({ editorId: x.editor_id, productId: x.product_id, type: x.commission_type, value: Number(x.commission_value) })),
  };
}

const fmt = (t: CommissionType, v: number) => (t === "percent" ? `${v}%` : `${v} MAD`);

export function resolveRate(book: RateBook, editorId: string, productId: string | null): Rate {
  if (productId) {
    const own = book.rules.find((x) => x.editorId === editorId && x.productId === productId);
    if (own) return { type: own.type, value: own.value, label: `${fmt(own.type, own.value)} (tarif produit de l'éditeur)` };
    const all = book.rules.find((x) => x.editorId === null && x.productId === productId);
    if (all) return { type: all.type, value: all.value, label: `${fmt(all.type, all.value)} (tarif produit)` };
  }
  const d = book.defaults.get(editorId) ?? { type: "fixed" as CommissionType, value: 5 };
  return { type: d.type, value: d.value, label: `${fmt(d.type, d.value)} (tarif de base)` };
}

export function earningFor(rate: Rate, amount: number) {
  return rate.type === "percent" ? Math.round(amount * rate.value) / 100 : rate.value;
}

/**
 * Cron : fige le gain des commandes livrées/payées qui n'en ont pas encore.
 * Une commande retournée après coup ne compte plus (statut ≠ livré/payé).
 */
export async function snapshotEditorEarnings() {
  const { data } = await supabaseAdmin
    .from("orders")
    .select("id, creative_id, total_amount_mad")
    .not("creative_id" as never, "is", null)
    .is("editor_earning_mad" as never, null)
    .in("status", ["delivered", "paid"])
    .limit(1000);
  const orders = (data ?? []) as unknown as { id: string; creative_id: string; total_amount_mad: number }[];
  if (!orders.length) return { ok: true, frozen: 0 };

  const { data: cr } = await supabaseAdmin
    .from("creatives" as never).select("id, editor_id, product_id").in("id", [...new Set(orders.map((o) => o.creative_id))]);
  const creatives = new Map(((cr ?? []) as { id: string; editor_id: string; product_id: string | null }[]).map((c) => [c.id, c]));
  const book = await loadRateBook();

  let frozen = 0;
  for (const o of orders) {
    const c = creatives.get(o.creative_id);
    if (!c) continue;
    const rate = resolveRate(book, c.editor_id, c.product_id);
    await supabaseAdmin.from("orders").update({
      editor_earning_mad: earningFor(rate, Number(o.total_amount_mad ?? 0)),
      editor_rate_label: rate.label,
    } as never).eq("id", o.id);
    frozen++;
  }
  return { ok: true, frozen };
}
