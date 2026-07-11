"use server";
/**
 * lib/orders/exchange-actions.ts
 * Gestion des échanges Digylog (EC-tracking).
 *
 * Flow réel:
 * 1. Client livré a un problème → admin génère l'échange dans Digylog (manuel,
 *    bouton "Générer échange" côté Digylog) → Digylog donne un nouveau tracking
 *    préfixé "EC" (ex: EC S15683FAC).
 * 2. Admin colle ce tracking ici avec createExchange() → on crée une NOUVELLE
 *    commande liée (même produit ou produit différent), on marque l'ancienne
 *    "exchanged" (pas "returned" — ne fausse pas les stats de retour).
 * 3. Le prochain webhook Digylog sur ce tracking EC matchera normalement la
 *    nouvelle commande (plus d'orphelin).
 */
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";

const MANAGER = ["super_admin", "admin", "manager"] as const;

export interface CreateExchangeParams {
  originalOrderId: string;
  exchangeTracking: string;      // tracking EC... donné par Digylog
  mode: "same_product" | "new_product";
  productId?: string;            // requis si mode = new_product
  quantity?: number;             // défaut: garde la quantité d'origine (same_product) ou 1 (new_product)
  codAmountOverride?: number;    // contre-remboursement du nouveau colis si différent du calcul auto
  notes?: string;
}

export async function createExchange(params: CreateExchangeParams): Promise<{
  success: boolean;
  newOrderId?: string;
  newOrderNumber?: string;
  error?: string;
}> {
  const session = await requireRole([...MANAGER]);

  const tracking = params.exchangeTracking.trim().toUpperCase();
  if (!tracking) return { success: false, error: "Tracking d'échange requis." };
  if (!tracking.startsWith("EC")) {
    return { success: false, error: `Tracking "${tracking}" ne ressemble pas à un tracking d'échange Digylog (préfixe attendu: EC).` };
  }

  // 1. Vérifier que ce tracking n'est pas déjà utilisé
  const { data: dup } = await supabaseAdmin
    .from("orders")
    .select("id, order_number")
    .eq("delivery_tracking_number", tracking)
    .maybeSingle();
  if (dup) {
    const d = dup as { id: string; order_number: string };
    return { success: false, error: `Ce tracking est déjà lié à la commande ${d.order_number}.` };
  }

  // 2. Charger la commande d'origine
  const { data: original, error: origErr } = await supabaseAdmin
    .from("orders")
    .select(`
      id, order_number, customer_name, customer_phone, customer_city,
      customer_address, customer_region, customer_country, status,
      delivery_company_id, source, assigned_to, shipping_charge,
      expected_delivery_cost, actual_delivery_cost, delivery_client_fee
    `)
    .eq("id", params.originalOrderId)
    .single();

  if (origErr || !original) return { success: false, error: "Commande d'origine introuvable." };

  const o = original as {
    id: string; order_number: string; customer_name: string; customer_phone: string;
    customer_city: string; customer_address: string; customer_region: string | null;
    customer_country: string; status: string; delivery_company_id: string | null;
    source: string | null; assigned_to: string | null; shipping_charge: number;
    expected_delivery_cost: number; actual_delivery_cost: number; delivery_client_fee: number;
  };

  if (!["delivered", "paid"].includes(o.status)) {
    return { success: false, error: `Impossible de générer un échange sur une commande en statut "${o.status}". Seules les commandes livrées/payées peuvent être échangées.` };
  }

  // 3. Charger les items d'origine
  const { data: origItems } = await supabaseAdmin
    .from("order_items")
    .select("product_id, product_name, product_sku, unit_price, unit_cost_mad, quantity, discount_pct")
    .eq("order_id", o.id);

  type Item = {
    product_id: string; product_name: string; product_sku: string;
    unit_price: number; unit_cost_mad: number; quantity: number; discount_pct: number;
  };
  const items = (origItems ?? []) as Item[];
  if (!items.length) return { success: false, error: "Commande d'origine sans articles." };

  // 4. Déterminer le(s) nouvel(le)(s) article(s)
  let newItems: { product_id: string; product_name: string; product_sku: string; unit_price: number; unit_cost_mad: number; quantity: number; discount_pct: number }[];

  if (params.mode === "same_product") {
    newItems = items.map((it) => ({ ...it, quantity: params.quantity ?? it.quantity }));
  } else {
    if (!params.productId) return { success: false, error: "Produit requis pour un échange avec changement de produit." };
    const { data: prod } = await supabaseAdmin
      .from("products")
      .select("id, name, sku, sale_price_mad, total_cost_mad")
      .eq("id", params.productId)
      .single();
    if (!prod) return { success: false, error: "Nouveau produit introuvable." };
    const p = prod as { id: string; name: string; sku: string; sale_price_mad: number; total_cost_mad: number };
    newItems = [{
      product_id:    p.id,
      product_name:  p.name,
      product_sku:   p.sku,
      unit_price:    p.sale_price_mad ?? 0,
      unit_cost_mad: p.total_cost_mad ?? 0,
      quantity:      params.quantity ?? 1,
      discount_pct:  0,
    }];
  }

  const subtotal  = newItems.reduce((s, it) => s + it.unit_price * it.quantity * (1 - it.discount_pct / 100), 0);
  const cogs      = newItems.reduce((s, it) => s + it.unit_cost_mad * it.quantity, 0);
  const codAmount = params.codAmountOverride ?? subtotal;

  // 5. Créer la nouvelle commande (order_number auto-généré par trigger)
  const { data: newOrder, error: newErr } = await supabaseAdmin
    .from("orders")
    .insert({
      customer_name:            o.customer_name,
      customer_phone:           o.customer_phone,
      customer_city:            o.customer_city,
      customer_address:         o.customer_address,
      customer_region:          o.customer_region,
      customer_country:         o.customer_country ?? "MA",
      status:                   "sent_to_delivery",
      subtotal,
      shipping_charge:          o.shipping_charge ?? 0,
      discount_amount:          0,
      cogs_total:               cogs,
      source:                   o.source,
      assigned_to:              o.assigned_to,
      notes:                    params.notes ?? `Échange de la commande ${o.order_number}.`,
      import_source:            "exchange",
      is_exchange:              true,
      exchange_of_order_id:     o.id,
      delivery_tracking_number: tracking,
      delivery_company_id:      o.delivery_company_id,
      delivery_status:          "in_transit",
      amount_collected:         0,
      expected_delivery_cost:   o.expected_delivery_cost,
      actual_delivery_cost:     o.actual_delivery_cost,
      delivery_client_fee:      o.delivery_client_fee,
    } as never)
    .select("id, order_number")
    .single();

  if (newErr || !newOrder) return { success: false, error: newErr?.message ?? "Erreur création commande d'échange." };

  const newOrderId     = (newOrder as { id: string }).id;
  const newOrderNumber = (newOrder as { order_number: string }).order_number;

  // 6. Insérer les items
  const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(
    newItems.map((it) => ({
      order_id:      newOrderId,
      product_id:    it.product_id,
      product_name:  it.product_name,
      product_sku:   it.product_sku,
      unit_price:    it.unit_price,
      unit_cost_mad: it.unit_cost_mad,
      quantity:      it.quantity,
      discount_pct:  it.discount_pct,
    })) as never
  );
  if (itemsErr) {
    await supabaseAdmin.from("orders").delete().eq("id", newOrderId);
    return { success: false, error: itemsErr.message };
  }

  // 7. Créer le shipment lié
  await supabaseAdmin.from("delivery_shipments").upsert({
    order_id:            newOrderId,
    delivery_company_id: o.delivery_company_id,
    tracking_number:     tracking,
    external_order_id:   newOrderNumber,
    internal_status:     "in_transit",
    last_synced_at:      new Date().toISOString(),
  } as never, { onConflict: "order_id" }).then(() => {}, () => {});

  // 8. Marquer l'ancienne commande "exchanged"
  await supabaseAdmin.from("orders").update({
    status:     "exchanged",
    updated_at: new Date().toISOString(),
  } as never).eq("id", o.id);

  // 9. Historique sur les deux commandes
  await supabaseAdmin.from("order_status_history").insert([
    {
      order_id:    o.id,
      from_status: o.status,
      to_status:   "exchanged",
      changed_by:  session.authId,
      notes:       `Échangée → nouvelle commande ${newOrderNumber} (tracking ${tracking}).`,
    },
    {
      order_id:    newOrderId,
      from_status: null,
      to_status:   "sent_to_delivery",
      changed_by:  session.authId,
      notes:       `Créée par échange de ${o.order_number}.`,
    },
  ] as never);

  // 10. Lier tout webhook orphelin déjà reçu pour ce tracking (arrivé avant le lien)
  const { data: orphan } = await supabaseAdmin
    .from("orphan_webhooks")
    .select("id, raw_payload")
    .eq("tracking_number", tracking)
    .maybeSingle();
  if (orphan) {
    const orph = orphan as { id: string; raw_payload: unknown };
    // On ne rejoue pas le webhook automatiquement ici — l'admin peut relancer
    // une synchro manuelle sur la commande si besoin. On nettoie juste l'entrée
    // orpheline pour ne pas polluer l'écran "Échanges non liés".
    await supabaseAdmin.from("orphan_webhooks").delete().eq("id", orph.id);
  }

  revalidatePath(`/admin/orders/${o.id}`);
  revalidatePath(`/admin/orders/${newOrderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/delivery");

  return { success: true, newOrderId, newOrderNumber };
}
