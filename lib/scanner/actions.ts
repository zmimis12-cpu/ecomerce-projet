"use server";
/**
 * lib/scanner/actions.ts
 * Scanner server actions — fast, minimal DB calls.
 * Features: outgoing scan, return scan, partial return, anti-duplicate,
 * scan_events table, stock before/after logs.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import type { ScanResult, ReturnCondition, ScanOrderItem } from "@/types/scanner";

const SCANNER_ROLES = ["super_admin", "admin", "manager", "scanner_agent"] as const;

async function getDefaultLocationId(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("stock_locations").select("id").eq("code", "MAIN").single();
  return (data as { id: string } | null)?.id ?? null;
}

async function getStockLevel(productId: string, locationId: string): Promise<number> {
  const { data } = await supabaseAdmin.from("stock_levels").select("quantity")
    .eq("product_id", productId).eq("location_id", locationId).maybeSingle();
  return (data as { quantity: number } | null)?.quantity ?? 0;
}

async function adjustStock(
  productId: string, delta: number, movementType: string,
  referenceId: string, agentId: string
): Promise<{ before: number; after: number }> {
  const locationId = await getDefaultLocationId();
  if (!locationId) return { before: 0, after: 0 };
  const before = await getStockLevel(productId, locationId);
  const { data: existingLevel } = await supabaseAdmin.from("stock_levels").select("id, quantity")
    .eq("product_id", productId).eq("location_id", locationId).maybeSingle();
  const existing = existingLevel as { id: string; quantity: number } | null;
  const after = Math.max(0, before + delta);
  if (existing) {
    await supabaseAdmin.from("stock_levels").update({ quantity: after } as never).eq("id", existing.id);
  } else if (delta > 0) {
    await supabaseAdmin.from("stock_levels").insert({ product_id: productId, location_id: locationId, quantity: after } as never);
  }
  await supabaseAdmin.from("stock_movements").insert({
    product_id: productId, to_location: delta > 0 ? locationId : null,
    from_location: delta < 0 ? locationId : null, movement_type: movementType,
    quantity: Math.abs(delta), reference_type: "order", reference_id: referenceId, created_by: agentId,
  } as never);
  return { before, after };
}

async function logScanEvent(params: {
  trackingNumber: string; orderId: string | null; scanType: string; scanStatus: string;
  operatorId: string; stockBefore: Record<string, number>; stockAfter: Record<string, number>;
  payload: Record<string, unknown>;
}) {
  await supabaseAdmin.from("scan_events").insert({
    tracking_number: params.trackingNumber, order_id: params.orderId,
    scan_type: params.scanType, scan_status: params.scanStatus, operator_id: params.operatorId,
    stock_before: params.stockBefore, stock_after: params.stockAfter, payload: params.payload,
  } as never).then(() => {}, () => {});
}

// ─── SCAN OUTGOING ─────────────────────────────────────────────────────────────
export async function scanExit(trackingNumber: string): Promise<ScanResult> {
  const session  = await requireRole([...SCANNER_ROLES]);
  const supabase = await createClient();
  const trimmed  = trackingNumber.trim().toUpperCase();

  if (!trimmed) return { success: false, isDuplicate: false, orderId: null, orderNumber: null, customerName: null, trackingNumber: trimmed, message: "Numéro de suivi vide.", error: "empty" };

  const { data: order } = await supabase.from("orders")
    .select("id, order_number, customer_name, status, delivery_status")
    .eq("delivery_tracking_number", trimmed).maybeSingle();
  const o = order as { id: string; order_number: string; customer_name: string; status: string; delivery_status: string | null } | null;

  if (!o) {
    console.log("SCANNER EVENT", { tracking: trimmed, type: "outgoing", status: "not_found", operator: session.authId });
    await logScanEvent({ trackingNumber: trimmed, orderId: null, scanType: "invalid", scanStatus: "error", operatorId: session.authId, stockBefore: {}, stockAfter: {}, payload: { reason: "not_found" } });
    return { success: false, isDuplicate: false, orderId: null, orderNumber: null, customerName: null, trackingNumber: trimmed, message: "❌ Aucune commande trouvée.", error: "not_found" };
  }

  if (["cancelled", "refused_delivery", "returned"].includes(o.status)) {
    return { success: false, isDuplicate: false, orderId: o.id, orderNumber: o.order_number, customerName: o.customer_name, trackingNumber: trimmed, message: `⚠️ Commande ${o.status} — scan bloqué.`, error: "invalid_status" };
  }

  const { data: existing } = await supabase.from("scanner_logs").select("id")
    .eq("tracking_number", trimmed).eq("scan_type", "exit").eq("is_duplicate", false).maybeSingle();
  const isDuplicate = !!existing;

  await supabaseAdmin.from("scanner_logs").insert({
    tracking_number: trimmed, scan_type: "exit", is_duplicate: isDuplicate,
    order_id: o.id, scanned_by: session.authId, processed: !isDuplicate,
  } as never);

  if (isDuplicate) {
    console.log("SCANNER EVENT", { tracking: trimmed, type: "outgoing", status: "duplicate", operator: session.authId });
    await logScanEvent({ trackingNumber: trimmed, orderId: o.id, scanType: "duplicate", scanStatus: "duplicate", operatorId: session.authId, stockBefore: {}, stockAfter: {}, payload: { orderNumber: o.order_number } });
    return { success: true, isDuplicate: true, orderId: o.id, orderNumber: o.order_number, customerName: o.customer_name, trackingNumber: trimmed, message: `⚠️ Doublon — ${o.order_number} déjà scanné en sortie.` };
  }

  const { data: items } = await supabase.from("order_items").select("product_id, quantity").eq("order_id", o.id);
  const locationId = await getDefaultLocationId();
  const stockBefore: Record<string, number> = {};
  const stockAfter:  Record<string, number> = {};

  for (const item of (items ?? []) as { product_id: string; quantity: number }[]) {
    const before = locationId ? await getStockLevel(item.product_id, locationId) : 0;
    stockBefore[item.product_id] = before;
    const { after } = await adjustStock(item.product_id, -item.quantity, "sale", o.id, session.authId);
    stockAfter[item.product_id] = after;
  }

  console.log("SCANNER EVENT", { tracking: trimmed, type: "outgoing", status: "success", operator: session.authId, stockBefore, stockAfter });
  await logScanEvent({ trackingNumber: trimmed, orderId: o.id, scanType: "outgoing", scanStatus: "success", operatorId: session.authId, stockBefore, stockAfter, payload: { orderNumber: o.order_number, customerName: o.customer_name } });
  await supabaseAdmin.from("orders").update({ delivery_status: "in_transit", status: "in_transit" } as never).eq("id", o.id);
  revalidatePath("/admin/scanner"); revalidatePath("/admin/delivery");
  return { success: true, isDuplicate: false, orderId: o.id, orderNumber: o.order_number, customerName: o.customer_name, trackingNumber: trimmed, message: `✓ Sortie enregistrée — ${o.order_number} (${o.customer_name})` };
}

// ─── FETCH ORDER FOR RETURN (show products/images before confirming) ───────────
export async function fetchOrderForReturn(trackingNumber: string): Promise<{
  found: boolean; alreadyReturned: boolean;
  order?: { id: string; order_number: string; customer_name: string; status: string };
  items?: ScanOrderItem[]; message: string;
}> {
  await requireRole([...SCANNER_ROLES]);
  const supabase = await createClient();
  const trimmed  = trackingNumber.trim().toUpperCase();

  const { data: order } = await supabase.from("orders")
    .select("id, order_number, customer_name, status")
    .eq("delivery_tracking_number", trimmed).maybeSingle();
  const o = order as { id: string; order_number: string; customer_name: string; status: string } | null;
  if (!o) return { found: false, alreadyReturned: false, message: "❌ Aucune commande trouvée." };

  const { data: existingReturn } = await supabase.from("scanner_logs").select("id")
    .eq("tracking_number", trimmed).eq("scan_type", "return").eq("is_duplicate", false).maybeSingle();
  if (existingReturn) return { found: true, alreadyReturned: true, order: o, message: `⚠️ Retour déjà enregistré pour ${o.order_number}.` };

  const { data: orderItems } = await supabase.from("order_items")
    .select("product_id, product_name, product_sku, quantity, unit_cost_mad, products(image_url)")
    .eq("order_id", o.id);

  type OI = { product_id: string; product_name: string; product_sku: string; quantity: number; unit_cost_mad: number; products: { image_url: string | null } | null };
  const items: ScanOrderItem[] = ((orderItems ?? []) as OI[]).map((i) => ({
    product_id: i.product_id, product_name: i.product_name ?? i.product_sku,
    product_sku: i.product_sku, quantity: i.quantity, unit_cost_mad: i.unit_cost_mad ?? 0,
    image_url: i.products?.image_url ?? null,
  }));

  return { found: true, alreadyReturned: false, order: o, items, message: `Commande ${o.order_number} trouvée.` };
}

// ─── SCAN RETURN (with partial quantity support) ───────────────────────────────
export async function scanReturn(
  trackingNumber: string, condition: ReturnCondition, notes: string,
  partialQtys?: Record<string, number>
): Promise<ScanResult & { returnId?: string }> {
  const session  = await requireRole([...SCANNER_ROLES]);
  const supabase = await createClient();
  const trimmed  = trackingNumber.trim().toUpperCase();

  if (!trimmed) return { success: false, isDuplicate: false, orderId: null, orderNumber: null, customerName: null, trackingNumber: trimmed, message: "Numéro de suivi vide." };

  const { data: order } = await supabase.from("orders")
    .select("id, order_number, customer_name, status")
    .eq("delivery_tracking_number", trimmed).maybeSingle();
  const o = order as { id: string; order_number: string; customer_name: string; status: string } | null;
  if (!o) return { success: false, isDuplicate: false, orderId: null, orderNumber: null, customerName: null, trackingNumber: trimmed, message: "❌ Aucune commande trouvée.", error: "not_found" };

  const { data: existingReturn } = await supabase.from("scanner_logs").select("id")
    .eq("tracking_number", trimmed).eq("scan_type", "return").eq("is_duplicate", false).maybeSingle();
  const isDuplicate = !!existingReturn;

  await supabaseAdmin.from("scanner_logs").insert({
    tracking_number: trimmed, scan_type: "return", is_duplicate: isDuplicate,
    return_condition: condition, notes: notes || null, order_id: o.id,
    scanned_by: session.authId, processed: !isDuplicate, partial_quantities: partialQtys ?? null,
  } as never);

  if (isDuplicate) {
    console.log("SCANNER EVENT", { tracking: trimmed, type: "return", status: "duplicate", operator: session.authId });
    await logScanEvent({ trackingNumber: trimmed, orderId: o.id, scanType: "duplicate", scanStatus: "duplicate", operatorId: session.authId, stockBefore: {}, stockAfter: {}, payload: { orderNumber: o.order_number, condition } });
    return { success: true, isDuplicate: true, orderId: o.id, orderNumber: o.order_number, customerName: o.customer_name, trackingNumber: trimmed, message: `⚠️ Doublon — retour déjà enregistré pour ${o.order_number}.` };
  }

  const { data: orderItems } = await supabase.from("order_items")
    .select("id, product_id, product_name, product_sku, quantity, unit_cost_mad").eq("order_id", o.id);
  const items = (orderItems ?? []) as { id: string; product_id: string; product_name: string; product_sku: string; quantity: number; unit_cost_mad: number }[];

  const isPartial = partialQtys && Object.keys(partialQtys).length > 0;
  const scanType  = isPartial ? "partial_return" : condition === "damaged" ? "damaged" : "return";

  const { data: ret } = await supabaseAdmin.from("returns").insert({
    order_id: o.id, reason: notes || RETURN_CONDITION_LABELS_MAP[condition], condition,
    status: "received", received_at: new Date().toISOString(), initiated_by: session.authId,
    refund_amount: 0, carrier_cost: 0, write_off_amount: 0,
  } as never).select("id, return_number").single();

  if (!ret) return { success: false, isDuplicate: false, orderId: o.id, orderNumber: o.order_number, customerName: o.customer_name, trackingNumber: trimmed, message: "Erreur création retour." };

  const returnId   = (ret as { id: string }).id;
  const locationId = await getDefaultLocationId();
  const stockBefore: Record<string, number> = {};
  const stockAfter:  Record<string, number> = {};
  let totalWriteOff = 0, totalClaimable = 0;

  for (const item of items) {
    const unitCost    = item.unit_cost_mad ?? 0;
    const returnedQty = partialQtys?.[item.product_id] ?? item.quantity;
    const missingQty  = item.quantity - returnedQty;
    const goodQty     = condition === "good" ? returnedQty : 0;
    const damagedQty  = condition === "damaged" ? returnedQty : 0;
    const lostQty     = condition === "lost" ? returnedQty : 0;
    const refusedQty  = condition === "client_refused" ? returnedQty : 0;
    const restockedQty = goodQty + refusedQty;
    const writeOff    = (damagedQty + lostQty + missingQty) * unitCost;
    totalWriteOff    += writeOff;
    totalClaimable   += (damagedQty + lostQty + missingQty) * unitCost;

    const before = locationId ? await getStockLevel(item.product_id, locationId) : 0;
    stockBefore[item.product_id] = before;

    await supabaseAdmin.from("return_items").insert({
      return_id: returnId, order_item_id: item.id, product_id: item.product_id,
      quantity: item.quantity, condition, returned_qty: returnedQty,
      good_qty: goodQty, damaged_qty: damagedQty, missing_qty: missingQty,
      restocked_qty: restockedQty, unit_cost_mad: unitCost, write_off_value: writeOff,
      restocked: restockedQty > 0, restocked_to: restockedQty > 0 ? locationId : null, notes: notes || null,
    } as never);

    if (restockedQty > 0) {
      const { after } = await adjustStock(item.product_id, restockedQty, "return_in", o.id, session.authId);
      stockAfter[item.product_id] = after;
    } else {
      stockAfter[item.product_id] = before;
    }
    if (damagedQty > 0) await adjustStock(item.product_id, 0, "damage", o.id, session.authId);
  }

  await supabaseAdmin.from("returns").update({ write_off_amount: totalWriteOff, total_loss_mad: totalWriteOff, claim_amount_mad: totalClaimable } as never).eq("id", returnId);
  await supabaseAdmin.from("orders").update({ status: "returned", delivery_status: "returned", returned_at: new Date().toISOString(), return_cost_mad: totalWriteOff } as never).eq("id", o.id);

  console.log("SCANNER EVENT", { tracking: trimmed, type: scanType, status: "success", operator: session.authId, condition, isPartial, partialQtys, stockBefore, stockAfter, totalWriteOff });
  await logScanEvent({ trackingNumber: trimmed, orderId: o.id, scanType, scanStatus: "success", operatorId: session.authId, stockBefore, stockAfter, payload: { orderNumber: o.order_number, condition, partialQtys, totalWriteOff, returnId } });

  revalidatePath("/admin/scanner"); revalidatePath("/admin/returns"); revalidatePath("/admin/delivery");
  const conditionLabel = RETURN_CONDITION_LABELS_MAP[condition];
  const partialMsg     = isPartial ? " (partiel)" : "";
  return { success: true, isDuplicate: false, returnId, orderId: o.id, orderNumber: o.order_number, customerName: o.customer_name, trackingNumber: trimmed, message: `✓ Retour enregistré — ${o.order_number} ${conditionLabel}${partialMsg}` };
}

const RETURN_CONDITION_LABELS_MAP: Record<ReturnCondition, string> = {
  good: "Bon état", damaged: "Endommagé", missing_items: "Pièces manquantes",
  lost: "Perdu", client_refused: "Refusé par le client", wrong_item: "Mauvais article",
};

export async function getRecentScans(limit = 20) {
  const supabase = await createClient();
  const { data } = await supabase.from("scanner_logs")
    .select("id, tracking_number, scan_type, is_duplicate, return_condition, notes, scanned_at, order_id")
    .order("scanned_at", { ascending: false }).limit(limit);
  return (data ?? []) as unknown as { id: string; tracking_number: string; scan_type: string; is_duplicate: boolean; return_condition: string | null; notes: string | null; scanned_at: string; order_id: string | null }[];
}
