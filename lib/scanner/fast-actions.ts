"use server";
/**
 * lib/scanner/fast-actions.ts
 * Ultra-fast scanner server actions.
 *
 * OUTGOING: fire-and-forget queue — minimal DB round-trips
 * RETURN:   validate against BR → add to pending queue → process conditions later
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import type { ReturnCondition } from "@/types/scanner";

const SCANNER_ROLES = ["super_admin", "admin", "manager", "scanner_agent"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function getDefaultLocationId(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("stock_locations").select("id").eq("code", "MAIN").single();
  return (data as { id: string } | null)?.id ?? null;
}

async function adjustStock(productId: string, delta: number, type: string, refId: string, agentId: string) {
  const locationId = await getDefaultLocationId();
  if (!locationId) return;
  const { data: lvl } = await supabaseAdmin.from("stock_levels").select("id,quantity")
    .eq("product_id", productId).eq("location_id", locationId).maybeSingle();
  const existing = lvl as { id: string; quantity: number } | null;
  const after = Math.max(0, (existing?.quantity ?? 0) + delta);
  if (existing) {
    await supabaseAdmin.from("stock_levels").update({ quantity: after } as never).eq("id", existing.id);
  } else if (delta > 0) {
    await supabaseAdmin.from("stock_levels").insert({ product_id: productId, location_id: locationId, quantity: after } as never);
  }
  await supabaseAdmin.from("stock_movements").insert({
    product_id: productId, to_location: delta > 0 ? locationId : null,
    from_location: delta < 0 ? locationId : null, movement_type: type,
    quantity: Math.abs(delta), reference_type: "order", reference_id: refId, created_by: agentId,
  } as never);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. OUTGOING SCAN — ultra fast, minimal DB calls
// ─────────────────────────────────────────────────────────────────────────────
export type FastScanResult = {
  ok:          boolean;
  duplicate:   boolean;
  tracking:    string;
  orderNumber: string | null;
  customer:    string | null;
  msg:         string;
  code:        "success" | "duplicate" | "not_found" | "blocked" | "error";
};

export async function scanOutgoing(tracking: string): Promise<FastScanResult> {
  const session  = await requireRole([...SCANNER_ROLES]);
  const supabase = await createClient();
  const t        = tracking.trim().toUpperCase();

  if (!t) return { ok: false, duplicate: false, tracking: t, orderNumber: null, customer: null, msg: "Vide", code: "error" };

  // Single query: order + check duplicate in one call
  const [{ data: order }, { data: existingScan }] = await Promise.all([
    supabase.from("orders")
      .select("id,order_number,customer_name,status")
      .eq("delivery_tracking_number", t)
      .maybeSingle(),
    supabase.from("scanner_logs").select("id")
      .eq("tracking_number", t).eq("scan_type", "exit").eq("is_duplicate", false)
      .maybeSingle(),
  ]);

  const o = order as { id: string; order_number: string; customer_name: string; status: string } | null;

  if (!o) {
    console.log("SCAN QUEUE EVENT", { tracking: t, status: "not_found", queuePosition: 0 });
    // Log async — don't await
    supabaseAdmin.from("scan_events").insert({
      tracking_number: t, order_id: null, scan_type: "invalid", scan_status: "error",
      operator_id: session.authId, payload: { reason: "not_found" },
    } as never).then(() => {}, () => {});
    return { ok: false, duplicate: false, tracking: t, orderNumber: null, customer: null, msg: "Introuvable", code: "not_found" };
  }

  if (["cancelled", "returned", "refused_delivery"].includes(o.status)) {
    return { ok: false, duplicate: false, tracking: t, orderNumber: o.order_number, customer: o.customer_name, msg: `Bloqué (${o.status})`, code: "blocked" };
  }

  const isDuplicate = !!existingScan;

  // Log scanner_log — async
  supabaseAdmin.from("scanner_logs").insert({
    tracking_number: t, scan_type: "exit", is_duplicate: isDuplicate,
    order_id: o.id, scanned_by: session.authId, processed: !isDuplicate,
  } as never).then(() => {}, () => {});

  if (isDuplicate) {
    console.log("SCAN QUEUE EVENT", { tracking: t, status: "duplicate", queuePosition: 0 });
    return { ok: true, duplicate: true, tracking: t, orderNumber: o.order_number, customer: o.customer_name, msg: `Doublon — ${o.order_number}`, code: "duplicate" };
  }

  // Stock + status update — async, don't await (fire and forget)
  const stockUpdate = async () => {
    const { data: items } = await supabase.from("order_items").select("product_id,quantity").eq("order_id", o.id);
    for (const item of (items ?? []) as { product_id: string; quantity: number }[]) {
      await adjustStock(item.product_id, -item.quantity, "sale", o.id, session.authId);
    }
    await supabaseAdmin.from("orders").update({ delivery_status: "in_transit", status: "in_transit" } as never).eq("id", o.id);
    await supabaseAdmin.from("scan_events").insert({
      tracking_number: t, order_id: o.id, scan_type: "outgoing", scan_status: "success",
      operator_id: session.authId, payload: { orderNumber: o.order_number, customer: o.customer_name },
    } as never).then(() => {}, () => {});
    revalidatePath("/admin/scanner");
  };
  stockUpdate(); // fire and forget

  console.log("SCAN QUEUE EVENT", { tracking: t, status: "success", queuePosition: 0 });
  return { ok: true, duplicate: false, tracking: t, orderNumber: o.order_number, customer: o.customer_name, msg: `✓ ${o.order_number} — ${o.customer_name}`, code: "success" };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. RETURN SCAN — validate against BR → add to pending queue
// ─────────────────────────────────────────────────────────────────────────────
export type ReturnScanResult = {
  ok:          boolean;
  duplicate:   boolean;
  tracking:    string;
  orderNumber: string | null;
  customer:    string | null;
  brNumber:    string | null;
  msg:         string;
  code:        "queued" | "duplicate" | "not_in_br" | "not_found" | "error";
};

export async function scanReturn_addToQueue(tracking: string): Promise<ReturnScanResult> {
  const session  = await requireRole([...SCANNER_ROLES]);
  const supabase = await createClient();
  const t        = tracking.trim().toUpperCase();

  if (!t) return { ok: false, duplicate: false, tracking: t, orderNumber: null, customer: null, brNumber: null, msg: "Vide", code: "error" };

  // Find order
  const { data: order } = await supabase.from("orders")
    .select("id,order_number,customer_name,status")
    .eq("delivery_tracking_number", t).maybeSingle();
  const o = order as { id: string; order_number: string; customer_name: string; status: string } | null;

  if (!o) {
    console.log("RETURN BR VALIDATION", { tracking: t, brNumber: null, existsInBR: false, reason: "not_found" });
    return { ok: false, duplicate: false, tracking: t, orderNumber: null, customer: null, brNumber: null, msg: "❌ Commande introuvable", code: "not_found" };
  }

  // Duplicate in pending queue check
  const { data: existingPending } = await supabase.from("pending_return_scans")
    .select("id,processing_status").eq("tracking_number", t)
    .not("processing_status", "eq", "rejected").maybeSingle();

  if (existingPending) {
    return { ok: false, duplicate: true, tracking: t, orderNumber: o.order_number, customer: o.customer_name, brNumber: null, msg: `⚠ Déjà dans la file — ${o.order_number}`, code: "duplicate" };
  }

  // ── BR Validation ──────────────────────────────────────────────────────────
  const { data: brBatch } = await supabaseAdmin
    .from("digylog_return_batches")
    .select("id,br_number")
    .eq("status", "active")
    .contains("tracking_numbers", [t])
    .maybeSingle();

  const br = brBatch as { id: string; br_number: string } | null;

  console.log("RETURN BR VALIDATION", { tracking: t, brNumber: br?.br_number ?? null, existsInBR: !!br });

  if (!br) {
    // No active BR found for this tracking — reject
    await supabaseAdmin.from("pending_return_scans").insert({
      tracking_number: t, order_id: o.id, operator_id: session.authId,
      processing_status: "rejected", rejection_reason: "not_in_active_br",
    } as never);
    return {
      ok: false, duplicate: false, tracking: t,
      orderNumber: o.order_number, customer: o.customer_name, brNumber: null,
      msg: `🚫 ${o.order_number} — Absent du BR actif`, code: "not_in_br",
    };
  }

  // ── Add to pending queue ───────────────────────────────────────────────────
  await supabaseAdmin.from("pending_return_scans").insert({
    tracking_number: t, order_id: o.id, br_number: br.br_number,
    operator_id: session.authId, processing_status: "pending_review",
  } as never);

  return {
    ok: true, duplicate: false, tracking: t,
    orderNumber: o.order_number, customer: o.customer_name, brNumber: br.br_number,
    msg: `✓ ${o.order_number} — BR ${br.br_number}`, code: "queued",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET PENDING RETURNS — load queue for condition processing
// ─────────────────────────────────────────────────────────────────────────────
export type PendingReturn = {
  id:            string;
  tracking:      string;
  orderNumber:   string;
  customerName:  string;
  brNumber:      string | null;
  scannedAt:     string;
  items: {
    product_id:   string;
    product_name: string;
    product_sku:  string;
    quantity:     number;
    unit_cost_mad:number;
    image_url:    string | null;
  }[];
};

export async function getPendingReturns(): Promise<PendingReturn[]> {
  const session = await requireRole([...SCANNER_ROLES]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("pending_return_scans")
    .select("id,tracking_number,order_id,br_number,scanned_at")
    .eq("processing_status", "pending_review")
    .eq("operator_id", session.authId)
    .order("scanned_at", { ascending: true });

  if (!data?.length) return [];

  const rows = data as { id: string; tracking_number: string; order_id: string | null; br_number: string | null; scanned_at: string }[];

  const results: PendingReturn[] = [];
  for (const row of rows) {
    if (!row.order_id) continue;
    const { data: order } = await supabase.from("orders")
      .select("order_number,customer_name").eq("id", row.order_id).maybeSingle();
    const o = order as { order_number: string; customer_name: string } | null;
    if (!o) continue;

    const { data: items } = await supabase.from("order_items")
      .select("product_id,product_name,product_sku,quantity,unit_cost_mad,products(image_url)")
      .eq("order_id", row.order_id);
    type OI = { product_id: string; product_name: string; product_sku: string; quantity: number; unit_cost_mad: number; products: { image_url: string | null } | null };

    results.push({
      id:           row.id,
      tracking:     row.tracking_number,
      orderNumber:  o.order_number,
      customerName: o.customer_name,
      brNumber:     row.br_number,
      scannedAt:    row.scanned_at,
      items: ((items ?? []) as OI[]).map((i) => ({
        product_id:    i.product_id,
        product_name:  i.product_name ?? i.product_sku,
        product_sku:   i.product_sku,
        quantity:      i.quantity,
        unit_cost_mad: i.unit_cost_mad ?? 0,
        image_url:     i.products?.image_url ?? null,
      })),
    });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. PROCESS RETURN CONDITION — stock update after validation
// ─────────────────────────────────────────────────────────────────────────────
export async function processReturnCondition(
  pendingId:    string,
  condition:    ReturnCondition,
  notes:        string,
  partialQtys?: Record<string, number>
): Promise<{ ok: boolean; msg: string }> {
  const session = await requireRole([...SCANNER_ROLES]);

  // Load pending scan
  const { data: pending } = await supabaseAdmin.from("pending_return_scans")
    .select("*").eq("id", pendingId).maybeSingle();
  const p = pending as { id: string; tracking_number: string; order_id: string; br_number: string | null } | null;
  if (!p) return { ok: false, msg: "Scan introuvable." };

  const supabase = await createClient();
  const { data: items } = await supabase.from("order_items")
    .select("id,product_id,product_name,product_sku,quantity,unit_cost_mad").eq("order_id", p.order_id);
  const orderItems = (items ?? []) as { id: string; product_id: string; product_name: string; product_sku: string; quantity: number; unit_cost_mad: number }[];

  // Create return
  const { data: ret } = await supabaseAdmin.from("returns").insert({
    order_id: p.order_id, reason: notes || condition, condition,
    status: "received", received_at: new Date().toISOString(), initiated_by: session.authId,
    refund_amount: 0, carrier_cost: 0, write_off_amount: 0,
  } as never).select("id").single();
  if (!ret) return { ok: false, msg: "Erreur création retour." };
  const returnId = (ret as { id: string }).id;

  const locationId = await getDefaultLocationId();
  let totalWriteOff = 0;

  for (const item of orderItems) {
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

    await supabaseAdmin.from("return_items").insert({
      return_id: returnId, order_item_id: item.id, product_id: item.product_id,
      quantity: item.quantity, condition, returned_qty: returnedQty,
      good_qty: goodQty, damaged_qty: damagedQty, missing_qty: missingQty,
      restocked_qty: restockedQty, unit_cost_mad: unitCost, write_off_value: writeOff,
      restocked: restockedQty > 0, restocked_to: restockedQty > 0 ? locationId : null, notes: notes || null,
    } as never);

    // Stock update ONLY after condition validated
    if (restockedQty > 0) await adjustStock(item.product_id, restockedQty, "return_in", p.order_id, session.authId);
    if (damagedQty > 0)   await adjustStock(item.product_id, 0, "damage", p.order_id, session.authId);
  }

  await supabaseAdmin.from("returns").update({ write_off_amount: totalWriteOff, total_loss_mad: totalWriteOff } as never).eq("id", returnId);
  await supabaseAdmin.from("orders").update({ status: "returned", delivery_status: "returned", returned_at: new Date().toISOString() } as never).eq("id", p.order_id);
  await supabaseAdmin.from("pending_return_scans").update({ processing_status: "processed", condition, notes: notes || null, return_id: returnId } as never).eq("id", pendingId);

  // Also add to scanner_logs for backward compat
  await supabaseAdmin.from("scanner_logs").insert({
    tracking_number: p.tracking_number, scan_type: "return", is_duplicate: false,
    return_condition: condition, notes: notes || null, order_id: p.order_id,
    scanned_by: session.authId, processed: true,
  } as never);

  revalidatePath("/admin/scanner");
  revalidatePath("/admin/returns");
  return { ok: true, msg: `✓ Retour traité — ${condition}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. IMPORT BR — import official Digylog return batch
// ─────────────────────────────────────────────────────────────────────────────
export async function importDigylogBR(params: {
  brNumber:        string;
  trackingNumbers: string[];
  notes?:          string;
}): Promise<{ ok: boolean; msg: string; imported?: number }> {
  await requireRole([...SCANNER_ROLES]);
  const session = await requireRole([...SCANNER_ROLES]);
  const { brNumber, trackingNumbers, notes } = params;

  if (!brNumber || !trackingNumbers.length) return { ok: false, msg: "BR vide ou numéro manquant." };

  const normalized = trackingNumbers.map((t) => t.trim().toUpperCase()).filter(Boolean);

  const { error } = await supabaseAdmin.from("digylog_return_batches").upsert({
    br_number:        brNumber,
    tracking_numbers: normalized,
    imported_by:      session.authId,
    status:           "active",
    notes:            notes ?? null,
  } as never, { onConflict: "br_number" });

  if (error) return { ok: false, msg: error.message };
  revalidatePath("/admin/scanner");
  return { ok: true, msg: `✓ BR ${brNumber} importé — ${normalized.length} trackings`, imported: normalized.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. GET ACTIVE BRs
// ─────────────────────────────────────────────────────────────────────────────
export async function getActiveBRs(): Promise<{ id: string; br_number: string; count: number; imported_at: string }[]> {
  await requireRole([...SCANNER_ROLES]);
  const { data } = await supabaseAdmin.from("digylog_return_batches")
    .select("id,br_number,tracking_numbers,imported_at").eq("status", "active").order("imported_at", { ascending: false });
  return ((data ?? []) as { id: string; br_number: string; tracking_numbers: string[]; imported_at: string }[])
    .map((r) => ({ id: r.id, br_number: r.br_number, count: r.tracking_numbers.length, imported_at: r.imported_at }));
}
