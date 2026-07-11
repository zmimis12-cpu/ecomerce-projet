"use server";
/**
 * lib/orders/exchange-actions.ts
 * Gestion des échanges Digylog.
 *
 * Flow réel:
 * 1. Client livré a un problème → échange généré côté Digylog (manuel ou
 *    auto-détecté depuis le webhook) → nouveau tracking (même format qu'un
 *    tracking normal — le badge "EC" dans l'UI Digylog n'en fait PAS partie).
 * 2. On crée une NOUVELLE commande liée (même produit ou produit différent).
 *    L'argent de la 1ère commande reste acquis — le client ne paie que les
 *    frais de livraison (ou un montant négocié) sur le nouveau colis.
 * 3. L'ancienne commande passe "exchanged" (pas "returned" — ne fausse pas
 *    les stats de retour).
 */
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { getExpectedDeliveryCost } from "@/lib/delivery/reconciliation-utils";

const MANAGER = ["super_admin", "admin", "manager"] as const;

export interface CreateExchangeParams {
  originalOrderId: string;
  exchangeTracking: string;      // tracking donné par Digylog (sans le badge "EC")
  mode: "same_product" | "new_product";
  productId?: string;            // requis si mode = new_product
  quantity?: number;             // défaut: garde la quantité d'origine (same_product) ou 1 (new_product)
  codAmountOverride?: number;    // contre-remboursement du nouveau colis si différent du défaut (frais de livraison)
  notes?: string;
}

export async function createExchange(params: CreateExchangeParams): Promise<{
  success: boolean;
  newOrderId?: string;
  newOrderNumber?: string;
  error?: string;
}> {
  const session = await requireRole([...MANAGER]);
  return performExchange(params, session.authId);
}

/**
 * Coeur de la logique d'échange, sans vérification de rôle — utilisable
 * depuis une server action UI (createExchange, avec session) ou depuis le
 * webhook Digylog en auto-détection (actorId = null, système).
 */
export async function performExchange(
  params: CreateExchangeParams,
  actorId: string | null
): Promise<{
  success: boolean;
  newOrderId?: string;
  newOrderNumber?: string;
  error?: string;
}> {
  const tracking = params.exchangeTracking.trim().toUpperCase();
  if (!tracking) return { success: false, error: "Tracking d'échange requis." };

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

  const productValue = newItems.reduce((s, it) => s + it.unit_price * it.quantity * (1 - it.discount_pct / 100), 0);
  const cogs          = newItems.reduce((s, it) => s + it.unit_cost_mad * it.quantity, 0);
  // L'argent de la 1ère commande reste acquis. Le client ne paie, sur le
  // nouveau colis, que les frais de livraison (ou un montant négocié) —
  // jamais le prix plein du produit. Défaut = frais de livraison de la
  // commande d'origine, sinon calculé depuis la ville.
  const defaultCod = o.delivery_client_fee || getExpectedDeliveryCost(o.customer_city) || 35;
  const codAmount  = params.codAmountOverride ?? defaultCod;

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
      subtotal:                 codAmount,
      shipping_charge:          o.shipping_charge ?? 0,
      discount_amount:          0,
      cogs_total:               cogs,
      source:                   o.source,
      assigned_to:              o.assigned_to,
      notes:                    params.notes ?? `Échange de la commande ${o.order_number} (valeur produit: ${productValue} MAD, COD collecté: ${codAmount} MAD).`,
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
      changed_by:  actorId,
      notes:       `Échangée → nouvelle commande ${newOrderNumber} (tracking ${tracking}).`,
    },
    {
      order_id:    newOrderId,
      from_status: null,
      to_status:   "sent_to_delivery",
      changed_by:  actorId,
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
    await supabaseAdmin.from("orphan_webhooks").delete().eq("id", orph.id);
  }

  revalidatePath(`/admin/orders/${o.id}`);
  revalidatePath(`/admin/orders/${newOrderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/delivery");

  return { success: true, newOrderId, newOrderNumber };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-détection: appelée par le webhook Digylog quand un tracking orphelin
// arrive. On interroge Digylog pour ce tracking (GET /order/:tracking/infos),
// on essaie de retrouver le client par téléphone parmi les commandes
// livrées/payées récentes. Si UN SEUL match trouvé → échange auto-créé
// (même produit, COD = frais de livraison). Sinon on laisse l'admin lier
// manuellement via "Générer échange".
// ─────────────────────────────────────────────────────────────────────────────
export async function tryAutoDetectExchange(tracking: string): Promise<{
  linked: boolean;
  reason: string;
  newOrderNumber?: string;
}> {
  const { createDigylogClientFromDB } = await import("@/lib/delivery/digylog/client");
  const { normalizePhone } = await import("@/lib/delivery/phone-utils");

  const client = await createDigylogClientFromDB();
  if (!client.hasToken()) return { linked: false, reason: "Token Digylog manquant." };

  const info = await client.getOrderInfos(tracking);
  if (!info) return { linked: false, reason: "Digylog n'a pas retourné d'infos pour ce tracking." };

  console.log("DIGYLOG ORDER INFO (auto-detect exchange)", { tracking, info });

  // Digylog ne documente pas un nom de champ fixe pour le téléphone — on
  // essaie les variantes courantes observées sur leurs endpoints.
  const rawPhone = (info.phone ?? info.telephone ?? info.clientPhone ?? info.customerPhone ?? info.tel) as string | undefined;
  if (!rawPhone) return { linked: false, reason: "Téléphone client introuvable dans la réponse Digylog." };

  const phone = normalizePhone(String(rawPhone));

  const { data: candidates } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, customer_phone, status, delivered_at")
    .in("status", ["delivered", "paid"])
    .eq("is_exchange", false)
    .order("delivered_at", { ascending: false })
    .limit(500);

  type Cand = { id: string; order_number: string; customer_phone: string; status: string; delivered_at: string | null };
  const matches = ((candidates ?? []) as Cand[]).filter((c) => normalizePhone(c.customer_phone) === phone);

  if (matches.length === 0) {
    return { linked: false, reason: `Aucune commande livrée/payée trouvée pour le téléphone ${phone}.` };
  }
  if (matches.length > 1) {
    return { linked: false, reason: `${matches.length} commandes possibles pour ${phone} — lien ambigu, à faire manuellement.` };
  }

  const match = matches[0];
  const res = await performExchange({
    originalOrderId:  match.id,
    exchangeTracking: tracking,
    mode:             "same_product",
    notes:            `Échange auto-détecté depuis le webhook Digylog (tracking ${tracking}) — à vérifier.`,
  }, null);

  if (!res.success) return { linked: false, reason: res.error ?? "Erreur lors de la création auto." };

  return { linked: true, reason: `Lié automatiquement à ${match.order_number}.`, newOrderNumber: res.newOrderNumber };
}
