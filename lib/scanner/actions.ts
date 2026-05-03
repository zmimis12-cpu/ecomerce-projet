"use server";
/**
 * lib/scanner/actions.ts
 * Scanner server actions — fast, minimal DB calls.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import type { ScanResult, ReturnCondition } from "@/types/scanner";

const SCANNER_ROLES = ["super_admin", "admin", "manager", "scanner_agent"] as const;

// ─── Get default stock location ────────────────────────────────────────────────
async function getDefaultLocationId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("stock_locations")
    .select("id")
    .eq("code", "MAIN")
    .single();
  return (data as { id: string } | null)?.id ?? null;
}

// ─── Adjust stock level ────────────────────────────────────────────────────────
async function adjustStock(
  productId: string,
  delta: number,               // positive = add, negative = subtract
  movementType: string,
  referenceId: string,
  agentId: string
) {
  const locationId = await getDefaultLocationId();
  if (!locationId) return;

  // Upsert stock_levels — increment/decrement quantity
  // First try to get existing row
  const { data: existingLevel } = await supabaseAdmin
    .from("stock_levels")
    .select("id, quantity")
    .eq("product_id", productId)
    .eq("location_id", locationId)
    .maybeSingle();

  const existing = existingLevel as { id: string; quantity: number } | null;

  if (existing) {
    await supabaseAdmin
      .from("stock_levels")
      .update({ quantity: Math.max(0, existing.quantity + delta) } as never)
      .eq("id", existing.id);
  } else if (delta > 0) {
    await supabaseAdmin
      .from("stock_levels")
      .insert({ product_id: productId, location_id: locationId, quantity: delta } as never);
  }

  // Log stock movement
  await supabaseAdmin.from("stock_movements").insert({
    product_id:     productId,
    to_location:    delta > 0 ? locationId : null,
    from_location:  delta < 0 ? locationId : null,
    movement_type:  movementType,
    quantity:       delta,
    reference_type: "order",
    reference_id:   referenceId,
    created_by:     agentId,
  } as never);
}

// ─── SCAN EXIT (delivery) ──────────────────────────────────────────────────────
export async function scanExit(trackingNumber: string): Promise<ScanResult> {
  const session = await requireRole([...SCANNER_ROLES]);
  const supabase = await createClient();
  const trimmed  = trackingNumber.trim();

  if (!trimmed) return { success: false, isDuplicate: false, orderId: null, orderNumber: null, customerName: null, trackingNumber: trimmed, message: "Numéro de suivi vide.", error: "empty" };

  // Find order by tracking number
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, status, delivery_status")
    .eq("delivery_tracking_number", trimmed)
    .maybeSingle();

  const o = order as { id: string; order_number: string; customer_name: string; status: string; delivery_status: string | null } | null;

  if (!o) {
    return { success: false, isDuplicate: false, orderId: null, orderNumber: null, customerName: null, trackingNumber: trimmed, message: "Aucune commande trouvée pour ce numéro.", error: "not_found" };
  }

  // Check for duplicate exit scan
  const { data: existing } = await supabase
    .from("scanner_logs")
    .select("id")
    .eq("tracking_number", trimmed)
    .eq("scan_type", "exit")
    .eq("is_duplicate", false)
    .maybeSingle();

  const isDuplicate = !!existing;

  // Insert scanner log (trigger auto-marks duplicate if needed)
  await supabaseAdmin.from("scanner_logs").insert({
    tracking_number: trimmed,
    scan_type:       "exit",
    is_duplicate:    isDuplicate,
    order_id:        o.id,
    scanned_by:      session.authId,
    processed:       !isDuplicate,
  } as never);

  if (isDuplicate) {
    return {
      success: true, isDuplicate: true,
      orderId: o.id, orderNumber: o.order_number,
      customerName: o.customer_name, trackingNumber: trimmed,
      message: `⚠️ Doublon — ${o.order_number} déjà scanné en sortie.`,
    };
  }

  // Get order items to reduce stock
  const { data: items } = await supabase
    .from("order_items")
    .select("product_id, quantity")
    .eq("order_id", o.id);

  for (const item of (items ?? []) as { product_id: string; quantity: number }[]) {
    await adjustStock(item.product_id, -item.quantity, "sale", o.id, session.authId);
  }

  // Update order delivery status
  await supabaseAdmin.from("orders")
    .update({ delivery_status: "in_transit", status: "in_transit" } as never)
    .eq("id", o.id);

  revalidatePath("/admin/scanner");
  revalidatePath("/admin/delivery");

  return {
    success: true, isDuplicate: false,
    orderId: o.id, orderNumber: o.order_number,
    customerName: o.customer_name, trackingNumber: trimmed,
    message: `✓ Sortie enregistrée — ${o.order_number} (${o.customer_name})`,
  };
}

// ─── SCAN RETURN ───────────────────────────────────────────────────────────────
export async function scanReturn(
  trackingNumber: string,
  condition: ReturnCondition,
  notes: string
): Promise<ScanResult & { returnId?: string }> {
  const session = await requireRole([...SCANNER_ROLES]);
  const supabase = await createClient();
  const trimmed  = trackingNumber.trim();

  if (!trimmed) return { success: false, isDuplicate: false, orderId: null, orderNumber: null, customerName: null, trackingNumber: trimmed, message: "Numéro de suivi vide." };

  // Find order
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, status")
    .eq("delivery_tracking_number", trimmed)
    .maybeSingle();

  const o = order as { id: string; order_number: string; customer_name: string; status: string } | null;
  if (!o) return { success: false, isDuplicate: false, orderId: null, orderNumber: null, customerName: null, trackingNumber: trimmed, message: "Aucune commande trouvée.", error: "not_found" };

  // Duplicate return scan check
  const { data: existingReturn } = await supabase
    .from("scanner_logs")
    .select("id")
    .eq("tracking_number", trimmed)
    .eq("scan_type", "return")
    .eq("is_duplicate", false)
    .maybeSingle();

  const isDuplicate = !!existingReturn;

  // Log scan
  await supabaseAdmin.from("scanner_logs").insert({
    tracking_number:  trimmed,
    scan_type:        "return",
    is_duplicate:     isDuplicate,
    return_condition: condition,
    notes:            notes || null,
    order_id:         o.id,
    scanned_by:       session.authId,
    processed:        !isDuplicate,
  } as never);

  if (isDuplicate) {
    return { success: true, isDuplicate: true, orderId: o.id, orderNumber: o.order_number, customerName: o.customer_name, trackingNumber: trimmed, message: `⚠️ Doublon — retour déjà enregistré pour ${o.order_number}.` };
  }

  // Get order items
  const { data: orderItems } = await supabase
    .from("order_items")
    .select("id, product_id, product_name, product_sku, quantity, unit_cost_mad")
    .eq("order_id", o.id);

  const items = (orderItems ?? []) as { id: string; product_id: string; product_name: string; product_sku: string; quantity: number; unit_cost_mad: number }[];

  // Create return record
  const { data: ret } = await supabaseAdmin
    .from("returns")
    .insert({
      order_id:      o.id,
      reason:        notes || RETURN_CONDITION_LABELS_MAP[condition],
      condition,
      status:        "received",
      received_at:   new Date().toISOString(),
      initiated_by:  session.authId,
      refund_amount: 0,
      carrier_cost:  0,
      write_off_amount: 0,
    } as never)
    .select("id, return_number")
    .single();

  if (!ret) return { success: false, isDuplicate: false, orderId: o.id, orderNumber: o.order_number, customerName: o.customer_name, trackingNumber: trimmed, message: "Erreur création retour." };

  const returnId     = (ret as { id: string }).id;
  const locationId   = await getDefaultLocationId();
  let totalWriteOff  = 0;
  let totalClaimable = 0;

  // Create return_items and process stock
  for (const item of items) {
    const unitCost   = item.unit_cost_mad ?? 0;
    const goodQty    = condition === "good"    ? item.quantity : 0;
    const damagedQty = condition === "damaged" ? item.quantity : 0;
    const missingQty = condition === "missing_items" ? item.quantity : 0;
    const lostQty    = condition === "lost"    ? item.quantity : 0;
    const restockedQty = goodQty; // good items go back to stock
    const writeOff   = (damagedQty + lostQty) * unitCost;
    totalWriteOff   += writeOff;
    totalClaimable  += (damagedQty + lostQty + missingQty) * unitCost;

    await supabaseAdmin.from("return_items").insert({
      return_id:     returnId,
      order_item_id: item.id,
      product_id:    item.product_id,
      quantity:      item.quantity,
      condition,
      returned_qty:  item.quantity,
      good_qty:      goodQty,
      damaged_qty:   damagedQty,
      missing_qty:   missingQty,
      restocked_qty: restockedQty,
      unit_cost_mad: unitCost,
      write_off_value: writeOff,
      restocked:     restockedQty > 0,
      restocked_to:  restockedQty > 0 ? locationId : null,
      notes:         notes || null,
    } as never);

    // Return good items to stock
    if (restockedQty > 0) {
      await adjustStock(item.product_id, restockedQty, "return_in", o.id, session.authId);
    }
    // Log damaged/lost as damage movement
    if (damagedQty + lostQty > 0) {
      await adjustStock(item.product_id, 0, "damage", o.id, session.authId);
    }
  }

  // Update return financial totals
  await supabaseAdmin.from("returns")
    .update({
      write_off_amount: totalWriteOff,
      total_loss_mad:   totalWriteOff,
      claim_amount_mad: totalClaimable,
    } as never)
    .eq("id", returnId);

  // Update order status
  await supabaseAdmin.from("orders")
    .update({
      status:         "returned",
      delivery_status:"returned",
      returned_at:    new Date().toISOString(),
    } as never)
    .eq("id", o.id);

  revalidatePath("/admin/scanner");
  revalidatePath("/admin/returns");
  revalidatePath("/admin/delivery");

  return {
    success: true, isDuplicate: false,
    orderId: o.id, orderNumber: o.order_number,
    customerName: o.customer_name, trackingNumber: trimmed,
    returnId,
    message: `✓ Retour enregistré — ${o.order_number} (${RETURN_CONDITION_LABELS_MAP[condition]})`,
  };
}

const RETURN_CONDITION_LABELS_MAP: Record<ReturnCondition, string> = {
  good:           "Bon état",
  damaged:        "Endommagé",
  missing_items:  "Pièces manquantes",
  lost:           "Perdu",
  client_refused: "Refusé par le client",
  wrong_item:     "Mauvais article",
};

// ─── Get recent scans ──────────────────────────────────────────────────────────
export async function getRecentScans(limit = 20) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("scanner_logs")
    .select("id, tracking_number, scan_type, is_duplicate, return_condition, notes, scanned_at, order_id")
    .order("scanned_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as {
    id: string; tracking_number: string; scan_type: string;
    is_duplicate: boolean; return_condition: string | null;
    notes: string | null; scanned_at: string; order_id: string | null;
  }[];
}
