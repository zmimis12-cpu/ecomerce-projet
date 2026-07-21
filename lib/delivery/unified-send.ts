"use server";
/**
 * lib/delivery/unified-send.ts
 *
 * THE SINGLE source of truth for sending any order to Digylog.
 * Used by:
 *   - sidebar order action (sendOrderToDigylog)
 *   - single label button
 *   - future batch actions
 *
 * After sending:
 *   - saves tracking on orders + delivery_shipments
 *   - attaches order to today's open daily batch (delivery_batch_orders)
 *   - updates sent_to_delivery_at timestamp
 *   - logs clearly
 *
 * NEVER calls PUT /orders/send — that is only done by "Télécharger BL du jour".
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getDeliveryClient } from "@/lib/delivery/client-factory";
import { revalidatePath } from "next/cache";

// ── Types ──────────────────────────────────────────────────────────────────────
export type UnifiedSendResult = {
  success:  boolean;
  tracking?: string;
  batchId?:  string;
  error?:    string;
};

type OrderForSend = {
  id:                 string;
  order_number:       string;
  customer_name:      string;
  customer_phone:     string;
  customer_city:      string;
  customer_address:   string;
  total_amount_mad:   number;
  notes:              string | null;
  status:             string;
  delivery_tracking_number: string | null;
  delivery_batch_id:  string | null;
};

// ── Normalize phone ────────────────────────────────────────────────────────────
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("212") && digits.length === 12) return "0" + digits.slice(3);
  if (digits.startsWith("00212") && digits.length === 13) return "0" + digits.slice(5);
  return digits;
}

// ── Get or create today's open daily batch for an order ────────────────────────
async function getOrCreateDailyBatchForOrder(
  storeName:   string,
  provider = "Digylog"
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);

  // Find open batch (draft or tickets_printed, no BL yet)
  const { data: existing } = await supabaseAdmin
    .from("delivery_batches")
    .select("id")
    .eq("batch_date", today)
    .eq("store_name", storeName)
    .eq("shipping_company", provider)
    .in("status", ["draft", "tickets_printed"])
    .is("bl_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return (existing as unknown as { id: string }).id;

  // Create new daily batch
  const { data: created } = await supabaseAdmin
    .from("delivery_batches")
    .insert({
      batch_number:     "",
      batch_date:       today,
      status:           "draft",
      shipping_company: provider,
      store_name:       storeName,
      total_orders:     0,
      total_products:   0,
    } as never)
    .select("id")
    .single();

  return (created as unknown as { id: string }).id;
}

// ── Link order to batch ───────────────────────────────────────────────────────
async function linkOrderToBatch(
  batchId:  string,
  orderId:  string,
  tracking: string
) {
  // Check if already linked (avoid duplicate)
  const { data: existing } = await supabaseAdmin
    .from("delivery_batch_orders")
    .select("id")
    .eq("batch_id", batchId)
    .eq("order_id", orderId)
    .maybeSingle();

  if (existing) return; // already linked

  await supabaseAdmin.from("delivery_batch_orders").insert({
    batch_id:        batchId,
    order_id:        orderId,
    tracking_number: tracking,
    status:          "pending",
  } as never);

  // Update batch total_orders
  const { count } = await supabaseAdmin
    .from("delivery_batch_orders")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId);

  await supabaseAdmin.from("delivery_batches")
    .update({ total_orders: count ?? 0 } as never)
    .eq("id", batchId);

  // Update order delivery_batch_id
  await supabaseAdmin.from("orders")
    .update({ delivery_batch_id: batchId } as never)
    .eq("id", orderId);
}

// ── MAIN: unified send ────────────────────────────────────────────────────────
export async function unifiedSendToDigylog(
  orderId: string,
  source: "sidebar" | "batch" | "single_label" = "sidebar"
): Promise<UnifiedSendResult> {

  // Load order
  const { data: orderData } = await supabaseAdmin
    .from("orders")
    .select(`
      id, order_number, customer_name, customer_phone,
      customer_city, customer_address, total_amount_mad,
      notes, status, delivery_tracking_number, delivery_batch_id,
      order_items ( quantity, products ( name, sku ) )
    `)
    .eq("id", orderId)
    .single();

  if (!orderData) return { success: false, error: "Commande introuvable." };

  type OItem = { quantity: number; products: { name: string; sku: string } | null };
  const order = orderData as OrderForSend & { order_items: OItem[] };

  // Safety: don't duplicate if already has tracking
  if (order.delivery_tracking_number) {
    return {
      success:  false,
      error:    `Déjà envoyé — tracking: ${order.delivery_tracking_number}`,
      tracking: order.delivery_tracking_number,
    };
  }

  if (!["confirmed", "sent_to_delivery"].includes(order.status)) {
    return { success: false, error: `Statut invalide: ${order.status}. La commande doit être confirmée.` };
  }

  // Phone validation
  const phone = normalizePhone(order.customer_phone);
  if (phone.length !== 10 || !phone.startsWith("0")) {
    return { success: false, error: `Téléphone invalide: ${order.customer_phone} → ${phone}` };
  }

  // Load Digylog settings
  const { data: dgData } = await supabaseAdmin
    .from("digylog_settings").select("*").limit(1).maybeSingle();
  type DgSettings = {
    default_network_id?: number; default_store_name?: string;
    default_mode?: number; default_port?: number;
  };
  const dg = dgData as DgSettings | null;
  if (!dg?.default_network_id || !dg?.default_store_name) {
    return { success: false, error: "Paramètres Digylog incomplets." };
  }

  const networkId = parseInt(String(dg.default_network_id), 10);

  // Build refs
  const refs = (order.order_items ?? []).map((it) => ({
    designation: it.products?.name ?? "Produit",
    quantity:    it.quantity,
  }));
  if (!refs.length) refs.push({ designation: "Produit", quantity: 1 });

  // Build Digylog client
  const client = await getDeliveryClient();
  if (!client.hasToken()) {
    return { success: false, error: "Token Digylog manquant." };
  }

  // Send to Digylog — ALWAYS status=0 (add only, no BL per order)
  const result = await client.createOrders({
    network:        networkId,
    store:          dg.default_store_name,
    mode:           (dg.default_mode ?? 1) as 1 | 2,
    status:         0,                      // ← ALWAYS 0, never 1
    checkDuplicate: 1,
    orders: [{
      num:         order.order_number,
      type:        1,
      mode:        (dg.default_mode ?? 1) as 1 | 2,
      network:     String(networkId),
      fc:          null,
      store:       dg.default_store_name,
      name:        order.customer_name,
      phone,
      address:     order.customer_address || "N/A",
      city:        order.customer_city,
      price:       order.total_amount_mad,
      refs,
      openproduct: 1,
      port:        (dg.default_port ?? 1) as 1 | 2,
      note:        order.notes ?? "",
    }],
  });

  const uOrders = (result as { orders?: { tracking?: string }[] }).orders ?? [];
  if (!result.ok || !uOrders.length) {
    return { success: false, error: String((result as { error?: unknown }).error ?? "Digylog n'a pas retourné de tracking.") };
  }

  const tracking = uOrders[0]?.tracking;
  if (!tracking) {
    return { success: false, error: "Digylog a accepté mais n'a pas retourné de tracking." };
  }

  // Get Digylog company id
  const { data: dcData } = await supabaseAdmin
    .from("delivery_companies").select("id").eq("slug", "digylog").maybeSingle();
  const companyId = (dcData as { id: string } | null)?.id ?? null;

  const now = new Date().toISOString();

  // Save tracking to orders + shipments — no bl_id yet
  await Promise.all([
    supabaseAdmin.from("delivery_shipments").upsert({
      order_id:            orderId,
      delivery_company_id: companyId,
      tracking_number:     tracking,
      external_order_id:   order.order_number,
      external_status:     "Non envoyée",
      external_status_id:  0,
      internal_status:     "not_sent",
      bl_id:               null,
      raw_payload:         uOrders[0] as never,
      last_synced_at:      now,
    } as never, { onConflict: "order_id" }),

    supabaseAdmin.from("orders").update({
      delivery_tracking_number:    tracking,
      delivery_company_id:         companyId,
      external_delivery_id:        order.order_number,
      delivery_external_status:    "Non envoyée",
      delivery_external_status_id: 0,
      delivery_status:             "not_sent",
      delivery_last_sync_at:       now,
      sent_to_delivery_at:         now,
      status:                      "sent_to_delivery",
      bl_id:                       null,
    } as never).eq("id", orderId),
  ]);

  // Historique du statut — INDISPENSABLE pour que "Expédiés" compte cette
  // commande même si elle est annulée/perdue plus tard côté Digylog (sinon
  // elle disparaît à tort du décompte, comme observé: écart 61 vs 72 réels).
  await supabaseAdmin.from("order_status_history").insert({
    order_id:    orderId,
    from_status: order.status,
    to_status:   "sent_to_delivery",
    notes:       "Envoyée à Digylog.",
  } as never).then(() => {}, () => {});

  // Attach to today's daily batch (creates if not exists)
  let batchId: string | undefined;
  try {
    batchId = await getOrCreateDailyBatchForOrder(dg.default_store_name);
    await linkOrderToBatch(batchId, orderId, tracking);
  } catch (e) {
    console.error("[unified-send] batch link failed:", e);
  }

  console.log("DIGYLOG UNIFIED SEND DEBUG", {
    orderId,
    orderNumber:   order.order_number,
    trackingNumber: tracking,
    batchId,
    source,
  });

  revalidatePath("/admin/delivery/notes");
  revalidatePath("/admin/delivery/documents");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");

  return { success: true, tracking, batchId };
}
