"use server";
/**
 * lib/delivery/batch/actions.ts
 * Server actions for delivery batch management.
 */
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { getDeliveryClient } from "@/lib/delivery/client-factory";
import { createDigylogClientFromDB } from "@/lib/delivery/digylog/client";

const MANAGER = ["super_admin","admin","manager"] as const;

// ── Find or create the open daily batch for today ─────────────────────────────
export async function findOrCreateDailyBatch(
  storeName: string,
  shippingCompany = "Digylog"
): Promise<{ batchId: string; batchNumber: string; isNew: boolean }> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Look for existing open batch today (draft = collecting orders, no BL yet)
  const { data: existing } = await supabaseAdmin
    .from("delivery_batches")
    .select("id, batch_number")
    .eq("batch_date", today)
    .eq("store_name", storeName)
    .eq("shipping_company", shippingCompany)
    .in("status", ["draft", "sent"])          // open = draft or sent (tickets downloaded but no BL)
    .is("bl_id", null)                        // no BL yet = still open
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      batchId:     (existing as { id: string; batch_number: string }).id,
      batchNumber: (existing as { id: string; batch_number: string }).batch_number,
      isNew: false,
    };
  }

  // Create new daily batch
  const { data: created, error } = await supabaseAdmin
    .from("delivery_batches")
    .insert({
      batch_number:     "",    // trigger sets BATCH-YYYYMMDD-NNN
      batch_date:       today,
      status:           "draft",
      shipping_company: shippingCompany,
      store_name:       storeName,
      total_orders:     0,
      total_products:   0,
    } as never)
    .select("id, batch_number")
    .single();

  if (error || !created) {
    throw new Error(`Cannot create daily batch: ${error?.message}`);
  }

  return {
    batchId:     (created as { id: string; batch_number: string }).id,
    batchNumber: (created as { id: string; batch_number: string }).batch_number,
    isNew: true,
  };
}

// ── Add orders to existing daily batch (no BL, just accumulate) ───────────────
export async function addOrdersToDailyBatch(
  batchId: string,
  orderIds: string[],
  trackingMap: Map<string, string>   // orderId → tracking
) {
  if (!orderIds.length) return;

  // Upsert batch_orders (ignore duplicates)
  const rows = orderIds.map((oid) => ({
    batch_id:        batchId,
    order_id:        oid,
    tracking_number: trackingMap.get(oid) ?? null,
    status:          "pending",
  }));

  await supabaseAdmin.from("delivery_batch_orders")
    .upsert(rows as never, { onConflict: "batch_id,order_id", ignoreDuplicates: true });

  // Update orders with batch id
  await supabaseAdmin.from("orders")
    .update({ delivery_batch_id: batchId } as never)
    .in("id", orderIds);

  // Update totals
  const { count } = await supabaseAdmin
    .from("delivery_batch_orders")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId);

  await supabaseAdmin.from("delivery_batches")
    .update({ total_orders: count ?? 0 } as never)
    .eq("id", batchId);
}

// ── Close daily batch: call PUT /orders/send with ALL trackings → get 1 BL ───
export async function closeDailyBatch(batchId: string): Promise<{
  ok: boolean; bl?: number; totalTrackings?: number; error?: string;
}> {
  await requireRole([...MANAGER]);

  // Collect all trackings for this batch
  const { data: boRows } = await supabaseAdmin
    .from("delivery_batch_orders")
    .select("tracking_number, order_id")
    .eq("batch_id", batchId)
    .not("order_id", "is", null);

  const items = (boRows ?? []) as { tracking_number: string | null; order_id: string }[];

  // Fill missing trackings from orders table
  const missingOrderIds = items.filter((r) => !r.tracking_number).map((r) => r.order_id);
  const trackMap = new Map<string, string>();

  if (missingOrderIds.length) {
    const { data: ordRows } = await supabaseAdmin
      .from("orders")
      .select("id, delivery_tracking_number")
      .in("id", missingOrderIds)
      .not("delivery_tracking_number", "is", null);

    for (const o of (ordRows ?? []) as { id: string; delivery_tracking_number: string }[]) {
      trackMap.set(o.id, o.delivery_tracking_number);
    }
  }

  const allTrackings = [
    ...items.filter((r) => r.tracking_number).map((r) => r.tracking_number!),
    ...[...trackMap.values()],
  ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

  if (!allTrackings.length) {
    return { ok: false, error: "Aucun tracking dans ce batch." };
  }

  console.log(`[closeDailyBatch] Calling PUT /orders/send with ${allTrackings.length} trackings:`, allTrackings);

  // ONE single PUT /orders/send call
  // Load store_id for this batch to use correct token
  let batchStoreIdForSend: string | undefined;
  try {
    const { data: batchForStore } = await supabaseAdmin
      .from("delivery_batches")
      .select("delivery_store_id")
      .eq("id", batchId)
      .maybeSingle();
    batchStoreIdForSend = (batchForStore as { delivery_store_id?: string | null } | null)?.delivery_store_id ?? undefined;
  } catch { /* use default */ }
  const client = await getDeliveryClient(batchStoreIdForSend);
  const sendRes = await client.sendOrders(allTrackings);

  if (!sendRes.ok || !sendRes.bl) {
    return { ok: false, error: sendRes.error ?? "Digylog n'a pas retourné de BL." };
  }

  const blId = sendRes.bl;
  console.log(`[closeDailyBatch] Got BL: ${blId} for ${allTrackings.length} trackings`);

  // Save bl_id — mark as bl_generated (closed, no more orders can be added)
  await supabaseAdmin.from("delivery_batches")
    .update({
      bl_id:        blId,
      status:       "bl_generated",
      completed_at: new Date().toISOString(),
    } as never)
    .eq("id", batchId);

  // Update all orders
  const allOrderIds = items.map((r) => r.order_id).filter(Boolean);
  if (allOrderIds.length) {
    await supabaseAdmin.from("orders")
      .update({ bl_id: blId } as never)
      .in("id", allOrderIds);
    await supabaseAdmin.from("delivery_shipments")
      .update({ bl_id: blId } as never)
      .in("order_id", allOrderIds);
  }

  // Update tracking_numbers in batch_orders for any that were missing
  for (const [ordId, tracking] of trackMap.entries()) {
    await supabaseAdmin.from("delivery_batch_orders")
      .update({ tracking_number: tracking, status: "sent" } as never)
      .eq("batch_id", batchId)
      .eq("order_id", ordId);
  }
  // Mark all as sent
  await supabaseAdmin.from("delivery_batch_orders")
    .update({ status: "sent" } as never)
    .eq("batch_id", batchId);

  try { const { revalidatePath } = await import("next/cache"); revalidatePath("/admin/delivery/notes"); revalidatePath("/admin/delivery/documents"); } catch {}

  return { ok: true, bl: blId, totalTrackings: allTrackings.length };
}

// ── Types ──────────────────────────────────────────────────────────────────────
export interface BatchOrder {
  id: string; order_number: string; customer_name: string;
  customer_phone: string; customer_city: string; customer_address: string;
  total_amount_mad: number; notes: string | null;
  products: { name: string; sku: string; quantity: number }[];
}

function normalizePhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("212") && d.length === 12) return "0" + d.slice(3);
  if (d.startsWith("0")   && d.length === 10) return d;
  return ("0" + d).slice(-10).padStart(10, "0");
}

// ── Get confirmed orders available for batching ────────────────────────────────
export async function getConfirmedOrdersForBatch() {
  await requireRole([...MANAGER]);

  const { data } = await supabaseAdmin
    .from("orders")
    .select(`
      id, order_number, customer_name, customer_phone,
      customer_city, customer_address, total_amount_mad, notes,
      created_at, delivery_batch_id,
      order_items (
        quantity,
        products ( id, name, sku )
      )
    `)
    .eq("status", "confirmed")
    .is("delivery_tracking_number", null)
    .is("delivery_batch_id", null)
    .order("created_at", { ascending: false });

  type Raw = {
    id: string; order_number: string; customer_name: string;
    customer_phone: string; customer_city: string; customer_address: string;
    total_amount_mad: number; notes: string | null; created_at: string;
    order_items: { quantity: number; products: { id: string; name: string; sku: string } | null }[];
  };

  return ((data ?? []) as Raw[]).map((o) => ({
    id:               o.id,
    order_number:     o.order_number,
    customer_name:    o.customer_name,
    customer_phone:   o.customer_phone,
    customer_city:    o.customer_city,
    customer_address: o.customer_address,
    total_amount_mad: o.total_amount_mad,
    notes:            o.notes,
    created_at:       o.created_at,
    products: o.order_items.map((item) => ({
      id:       item.products?.id ?? "",
      name:     item.products?.name ?? "Produit",
      sku:      item.products?.sku ?? "",
      quantity: item.quantity,
    })),
  }));
}

// ── Create batch ───────────────────────────────────────────────────────────────
export async function createBatch(orderIds: string[], notes?: string) {
  await requireRole([...MANAGER]);

  if (!orderIds.length) return { success: false, error: "Sélectionnez au moins une commande." };

  // Load orders with items
  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select(`
      id, order_number, customer_name, customer_phone, customer_city,
      customer_address, total_amount_mad, notes,
      order_items ( quantity, products ( id, name, sku ) )
    `)
    .in("id", orderIds);

  if (!orders?.length) return { success: false, error: "Commandes introuvables." };

  type OrderRow = {
    id: string; order_number: string;
    order_items: { quantity: number; products: { id: string; name: string; sku: string } | null }[];
  };
  const rows = orders as unknown as OrderRow[];

  // Create batch
  const { data: batch, error: batchErr } = await supabaseAdmin
    .from("delivery_batches")
    .insert({
      batch_number:    "",  // trigger will set
      status:          "draft",
      total_orders:    rows.length,
      notes:           notes ?? null,
      shipping_company:"Digylog",
    } as never)
    .select("id, batch_number")
    .single();

  if (batchErr || !batch) {
    return { success: false, error: batchErr?.message ?? "Erreur création batch." };
  }
  const batchId     = (batch as { id: string; batch_number: string }).id;
  const batchNumber = (batch as { id: string; batch_number: string }).batch_number;

  // Link orders to batch
  await supabaseAdmin.from("delivery_batch_orders").insert(
    rows.map((o) => ({ batch_id: batchId, order_id: o.id, status: "pending" })) as never
  );

  // Update orders with batch_id
  await supabaseAdmin.from("orders")
    .update({ delivery_batch_id: batchId } as never)
    .in("id", orderIds);

  // Build product summary
  const prodMap = new Map<string, { product_id: string; product_name: string; sku: string; total_quantity: number; order_count: number }>();
  for (const o of rows) {
    for (const item of o.order_items) {
      const pid  = item.products?.id  ?? "unknown";
      const name = item.products?.name ?? "Produit";
      const sku  = item.products?.sku  ?? "";
      const key  = pid;
      if (!prodMap.has(key)) prodMap.set(key, { product_id: pid, product_name: name, sku, total_quantity: 0, order_count: 0 });
      const entry = prodMap.get(key)!;
      entry.total_quantity += item.quantity;
      entry.order_count    += 1;
    }
  }

  const summaryRows = [...prodMap.values()].map((p) => ({
    batch_id:       batchId,
    product_id:     p.product_id === "unknown" ? null : p.product_id,
    product_name:   p.product_name,
    sku:            p.sku,
    total_quantity: p.total_quantity,
    order_count:    p.order_count,
  }));

  if (summaryRows.length) {
    await supabaseAdmin.from("delivery_batch_product_summary").insert(summaryRows as unknown as never);
  }

  // Update total_products
  const totalQty = summaryRows.reduce((s, r) => s + r.total_quantity, 0);
  await supabaseAdmin.from("delivery_batches")
    .update({ total_products: totalQty } as never)
    .eq("id", batchId);

  revalidatePath("/admin/delivery/batches");
  return { success: true, batchId, batchNumber };
}

// ── Send entire batch to Digylog ───────────────────────────────────────────────
export async function sendBatchToDigylog(batchId: string) {
  await requireRole([...MANAGER]);

  // Load batch + pending orders
  const { data: batchData } = await supabaseAdmin
    .from("delivery_batches")
    .select("id, batch_number, status")
    .eq("id", batchId)
    .single();

  if (!batchData) return { success: false, error: "Batch introuvable." };

  const { data: batchOrdersData } = await supabaseAdmin
    .from("delivery_batch_orders")
    .select("id, order_id, status")
    .eq("batch_id", batchId)
    .eq("status", "pending");

  const batchOrders = (batchOrdersData ?? []) as { id: string; order_id: string; status: string }[];
  if (!batchOrders.length) return { success: false, error: "Aucune commande en attente dans ce batch." };

  const orderIds = batchOrders.map((bo) => bo.order_id);

  // Load order details
  const { data: ordersData } = await supabaseAdmin
    .from("orders")
    .select(`
      id, order_number, customer_name, customer_phone,
      customer_city, customer_address, total_amount_mad, notes,
      order_items ( quantity, products ( name, sku ) )
    `)
    .in("id", orderIds);

  type ORow = {
    id: string; order_number: string; customer_name: string;
    customer_phone: string; customer_city: string; customer_address: string;
    total_amount_mad: number; notes: string | null;
    order_items: { quantity: number; products: { name: string; sku: string } | null }[];
  };
  const orders = (ordersData ?? []) as unknown as ORow[];

  // Load Digylog settings
  const { data: dgSettings } = await supabaseAdmin
    .from("digylog_settings")
    .select("default_network_id, default_store_name, default_port, default_mode, default_status_on_create")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const settings = dgSettings as {
    default_network_id: number; default_store_name: string;
    default_port: 1|2; default_mode: 1|2; default_status_on_create: 0|1;
  } | null;

  if (!settings?.default_store_name) {
    return { success: false, error: "Paramètres Digylog manquants. Configurez dans Paramètres → Transporteur." };
  }

  const networkId = parseInt(String(settings.default_network_id), 10);
  if (!networkId || isNaN(networkId)) {
    return { success: false, error: `ID réseau invalide: ${settings.default_network_id}` };
  }

  const client = await getDeliveryClient();
  if (!client.hasToken()) return { success: false, error: "Token Digylog manquant." };

  // Get Digylog company id
  const { data: dcData } = await supabaseAdmin
    .from("delivery_companies")
    .select("id")
    .eq("slug", "digylog")
    .maybeSingle();
  const companyId = (dcData as { id: string } | null)?.id ?? null;

  // Build Digylog payload — all orders in one request
  const digylogOrders = orders.map((o) => {
    const refs = o.order_items.map((item) => ({
      designation: item.products?.name ?? "Produit",
      quantity:    item.quantity,
    }));
    if (!refs.length) refs.push({ designation: "Produit", quantity: 1 });

    return {
      num:         o.order_number,
      type:        1 as const,
      mode:        (settings.default_mode ?? 1) as 1|2,
      network:     String(networkId),
      fc:          null,
      store:       settings.default_store_name,
      name:        o.customer_name,
      phone:       normalizePhone(o.customer_phone),
      address:     o.customer_address || "N/A",
      city:        o.customer_city,
      price:       o.total_amount_mad,
      refs,
      openproduct: 1 as const,
      port:        (settings.default_port ?? 1) as 1|2,
      note:        o.notes ?? "",
    };
  });

  console.log(`📤 DIGYLOG BATCH PAYLOAD: ${orders.length} commandes`);

  const result = await client.createOrders({
    network:        networkId,
    store:          settings.default_store_name,
    mode:           (settings.default_mode ?? 1) as 1|2,
    status:         (settings.default_status_on_create ?? 1) as 0|1,
    checkDuplicate: 1,
    orders:         digylogOrders,
  });

  const typedResult = result as { ok: boolean; orders: { num?: string; tracking?: string; bl?: number }[]; error?: string };
  console.log(`📥 DIGYLOG BATCH RESULT: ok=${typedResult.ok} orders=${typedResult.orders?.length}`);

  // Process results — match by num (order_number)
  const trackingByNum = new Map<string, { tracking: string; bl?: number }>();
  for (const created of typedResult.orders ?? []) {
    if (created.tracking) {
      trackingByNum.set(created.num ?? "", { tracking: created.tracking, bl: created.bl });
    }
  }

  let sent = 0, failed = 0, batchBlId: number | null = null;
  const errors: string[] = [];

  for (const o of orders) {
    const found = trackingByNum.get(o.order_number);
    const batchOrderRow = batchOrders.find((bo) => bo.order_id === o.id);

    if (found?.tracking) {
      sent++;
      if (found.bl) batchBlId = found.bl;

      // Update batch_orders
      if (batchOrderRow) {
        await supabaseAdmin.from("delivery_batch_orders").update({
          tracking_number: found.tracking,
          status:          "sent",
        } as never).eq("id", batchOrderRow.id);
      }

      // Upsert shipment
      await supabaseAdmin.from("delivery_shipments").upsert({
        order_id:            o.id,
        delivery_company_id: companyId,
        tracking_number:     found.tracking,
        external_order_id:   o.order_number,
        external_status:     "Non envoyée",
        external_status_id:  0,
        internal_status:     "not_sent",
        bl_id:               found.bl ?? null,
        raw_payload:         found as never,
        last_synced_at:      new Date().toISOString(),
      } as never, { onConflict: "order_id" });

      // Update order
      await supabaseAdmin.from("orders").update({
        delivery_tracking_number:    found.tracking,
        delivery_company_id:         companyId,
        delivery_external_status:    "Non envoyée",
        delivery_external_status_id: 0,
        delivery_status:             "not_sent",
        delivery_last_sync_at:       new Date().toISOString(),
        status:                      "sent_to_delivery",
        bl_id:                       found.bl ?? null,
      } as never).eq("id", o.id);

    } else {
      failed++;
      const errMsg = typedResult.ok
        ? `Pas de tracking retourné pour ${o.order_number}`
        : (typedResult.error ?? "Erreur Digylog");
      errors.push(errMsg);

      if (batchOrderRow) {
        await supabaseAdmin.from("delivery_batch_orders").update({
          status:        "failed",
          error_message: errMsg,
        } as never).eq("id", batchOrderRow.id);
      }
    }
  }

  // Update batch
  const newStatus = sent > 0 ? "sent" : "draft";
  await supabaseAdmin.from("delivery_batches").update({
    status:   newStatus,
    bl_id:    batchBlId,
    sent_at:  sent > 0 ? new Date().toISOString() : null,
  } as never).eq("id", batchId);

  revalidatePath(`/admin/delivery/batches/${batchId}`);
  revalidatePath("/admin/delivery/batches");

  return {
    success: sent > 0,
    sent,
    failed,
    errors,
    blId: batchBlId,
    error: sent === 0 ? (result.error ?? errors[0] ?? "Toutes les commandes ont échoué.") : undefined,
  };
}

// ── Shared: build sorted ticket orders for a batch ────────────────────────────
// Single source of truth used by both downloadBatchLabels and generateRecapAndLabels.
// Always re-queries DB — never uses cached/old arrays.
interface SortedTicketOrder {
  tracking:           string;
  orderNumber:        string;
  primaryProductName: string;
  primaryProductQty:  number;
  recapIndex:         number;
}

async function buildSortedTicketOrders(batchId: string): Promise<SortedTicketOrder[]> {
  // ── Step 1: Load batch orders with items + products (use snapshot fields) ──
  const { data: boRows } = await supabaseAdmin
    .from("delivery_batch_orders")
    .select(`
      order_id,
      tracking_number,
      orders (
        id,
        order_number,
        delivery_tracking_number,
        order_items (
          quantity,
          product_id,
          product_name,
          product_sku,
          products ( id, name, sku )
        )
      )
    `)
    .eq("batch_id", batchId)
    .not("order_id", "is", null);

  type OItem = {
    quantity:     number;
    product_id:   string | null;
    product_name: string | null;
    product_sku:  string | null;
    products:     { id: string; name: string; sku: string } | null;
  };
  type ORow = {
    id: string;
    order_number: string;
    delivery_tracking_number: string | null;
    order_items: OItem[];
  };
  type BORow = {
    order_id:        string;
    tracking_number: string | null;
    orders:          ORow | null;
  };

  const rows = (boRows ?? []) as BORow[];

  // ── Step 2: Build productTotals — key is product_id → totalQty + name ──────
  // Use product_id as primary key (stable), fallback to product_sku then name.
  // This is IDENTICAL to the recap page logic — single source of truth.
  const productTotals = new Map<string, { total: number; name: string }>();

  for (const bo of rows) {
    for (const item of bo.orders?.order_items ?? []) {
      const key  = item.product_id ?? item.products?.id ?? item.product_sku ?? item.product_name ?? "unknown";
      const name = item.products?.name ?? item.product_name ?? item.product_sku ?? "unknown";
      const qty  = item.quantity ?? 1;
      const prev = productTotals.get(key);
      if (prev) {
        prev.total += qty;
      } else {
        productTotals.set(key, { total: qty, name });
      }
    }
  }

  // ── Step 3: Build recapProductOrder — totalQty DESC, name ASC on tie ───────
  const recapProductOrder: string[] = [...productTotals.entries()]
    .sort(([, a], [, b]) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.name.localeCompare(b.name);
    })
    .map(([key]) => key);

  const recapIndex = new Map<string, number>();
  recapProductOrder.forEach((key, i) => recapIndex.set(key, i));

  console.log("RECAP PRODUCT ORDER", recapProductOrder.map((k) => ({
    key:   k,
    name:  productTotals.get(k)?.name,
    total: productTotals.get(k)?.total,
  })));

  // ── Step 3b: Fallback if order_items empty — use order-level product data ────
  if (productTotals.size === 0 && rows.length > 0) {
    console.warn("[buildSortedTicketOrders] order_items empty, using order-level fallback");
    const orderIds = rows.map(r => r.order_id).filter(Boolean);
    if (orderIds.length > 0) {
      const { data: ordFallback } = await supabaseAdmin
        .from("orders")
        .select("id, first_product_name, first_product_sku, total_quantity, notes")
        .in("id", orderIds);
      for (const o of (ordFallback ?? []) as { id: string; first_product_name: string | null; first_product_sku: string | null; total_quantity: number | null; notes: string | null }[]) {
        let name = (o.first_product_name ?? "").trim();
        if (!name && o.notes) {
          name = o.notes.replace(/_x[0-9]+/i, "").replace(/\u00d7[0-9]+/, "").replace(/[×x][0-9]+/g, "").trim();
        }
        console.log("[buildSorted fallback]", { id: o.id, first_product_name: o.first_product_name, notes: o.notes, resolved: name });
        const key = o.first_product_sku || name || "Produit";
        productTotals.set(key, { total: o.total_quantity ?? 1, name: name || key });
      }
    }
    if (productTotals.size === 0) {
      productTotals.set("__unknown__", { total: rows.length, name: "Produit" });
    }
    // Rebuild recapProductOrder + recapIndex from fallback data (was missing — caused empty PDF)
    recapProductOrder.length = 0;
    recapIndex.clear();
    [...productTotals.entries()]
      .sort(([, a], [, b]) => b.total !== a.total ? b.total - a.total : a.name.localeCompare(b.name))
      .forEach(([key], i) => { recapProductOrder.push(key); recapIndex.set(key, i); });
  }

  // ── Step 4: For each order, determine primary product via recapIndex ────────
  const sortable: SortedTicketOrder[] = [];

  for (const bo of rows) {
    const tracking = bo.tracking_number ?? bo.orders?.delivery_tracking_number;
    if (!bo.orders || !tracking) continue;

    const orderNumber = bo.orders.order_number;
    const items       = bo.orders.order_items;

    let primaryName = "unknown";
    let primaryIdx  = Number.MAX_SAFE_INTEGER;
    let primaryQty  = 0;

    for (const item of items) {
      const key  = item.product_id ?? item.products?.id ?? item.product_sku ?? item.product_name ?? "unknown";
      const name = item.products?.name ?? item.product_name ?? item.product_sku ?? "unknown";
      const idx  = recapIndex.get(key) ?? Number.MAX_SAFE_INTEGER;
      const qty  = item.quantity ?? 1;

      const better =
        idx < primaryIdx ||
        (idx === primaryIdx && qty > primaryQty) ||
        (idx === primaryIdx && qty === primaryQty && name < primaryName);

      if (better) {
        primaryName = name;
        primaryIdx  = idx;
        primaryQty  = qty;
      }
    }

    // order_items vide (cas sheet-sync) → résoudre via recapIndex construit en fallback
    if (items.length === 0 && recapIndex.size > 0) {
      for (const [key, idx] of recapIndex.entries()) {
        if (idx < primaryIdx) {
          primaryIdx  = idx;
          primaryName = productTotals.get(key)?.name ?? key;
          primaryQty  = productTotals.get(key)?.total ?? 1;
        }
        break;
      }
    }

    sortable.push({ tracking, orderNumber, primaryProductName: primaryName,
      primaryProductQty: primaryQty, recapIndex: primaryIdx });
  }

  // ── Step 5: Sort — recapIndex ASC → primaryQty DESC → orderNumber ASC ──────
  sortable.sort((a, b) => {
    if (a.recapIndex !== b.recapIndex)          return a.recapIndex - b.recapIndex;
    if (b.primaryProductQty !== a.primaryProductQty) return b.primaryProductQty - a.primaryProductQty;
    return a.orderNumber.localeCompare(b.orderNumber);
  });

  console.log("DIGYLOG LABEL INPUT ORDER", sortable.map((o) => ({
    orderNumber: o.orderNumber,
    tracking:    o.tracking,
    product:     o.primaryProductName,
    qty:         o.primaryProductQty,
    recapIndex:  o.recapIndex,
  })));

  return sortable;
}

// ── Download tickets for batch ─────────────────────────────────────────────────
async function getSortedTrackingsForBatch(batchId: string): Promise<string[]> {
  const sortedOrders = await buildSortedTicketOrders(batchId);
  let trackings = sortedOrders.map((o) => o.tracking);

  // Fallback: if no batch_orders found, get from orders table (unsorted)
  if (!trackings.length) {
    const { data: ordRows } = await supabaseAdmin
      .from("orders")
      .select("delivery_tracking_number")
      .eq("delivery_batch_id", batchId)
      .not("delivery_tracking_number", "is", null);
    trackings = ((ordRows ?? []) as { delivery_tracking_number: string }[])
      .map((r) => r.delivery_tracking_number);
  }

  return trackings;
}

export async function downloadBatchLabels(batchId: string): Promise<{
  ok: boolean; blobBase64?: string; error?: string;
}> {
  await requireRole([...MANAGER]);
  const trackings = await getSortedTrackingsForBatch(batchId);
  if (!trackings.length) {
    return { ok: false, error: "Aucun tracking trouvé pour ce batch." };
  }

  const digylogClient2 = await (await import("@/lib/delivery/digylog/client")).createDigylogClientFromDB();
  const result = await digylogClient2.downloadLabels({ orders: trackings, format: 3 });
  if (!result.ok || !result.blob) return { ok: false, error: result.error };
  const resultData = result.blob;

  // Mark as tickets_printed — batch is now CLOSED to new orders
  // New synced orders will go into a new draft batch
  await supabaseAdmin.from("delivery_batches")
    .update({
      status: "tickets_printed",
      labels_downloaded_at: new Date().toISOString(),
    } as never)
    .eq("id", batchId)
    .in("status", ["draft", "tickets_printed"]);  // idempotent

  try { (await import("next/cache")).revalidatePath("/admin/delivery/notes"); } catch {}

  const buf = await resultData.arrayBuffer();
  return { ok: true, blobBase64: Buffer.from(buf).toString("base64") };
}

// ── Download BL ────────────────────────────────────────────────────────────────
export async function downloadBatchBl(batchId: string): Promise<{
  ok: boolean; blobBase64?: string; error?: string; blId?: number;
}> {
  await requireRole([...MANAGER]);

  const { data: batch } = await supabaseAdmin
    .from("delivery_batches")
    .select("bl_id")
    .eq("id", batchId)
    .single();

  const blId = (batch as { bl_id?: number } | null)?.bl_id;
  if (!blId) return { ok: false, error: "BL non disponible — envoyez le batch à Digylog d'abord." };

  const digylogClient3 = await (await import("@/lib/delivery/digylog/client")).createDigylogClientFromDB();
  const result = await digylogClient3.downloadBlPdf(blId);
  if (!result.ok || !result.blob) return { ok: false, error: result.error };

  await supabaseAdmin.from("delivery_batches")
    .update({ status: "bl_downloaded" } as never)
    .eq("id", batchId);

  revalidatePath(`/admin/delivery/batches/${batchId}`);

  const buf = await result.blob.arrayBuffer();
  return { ok: true, blobBase64: Buffer.from(buf).toString("base64"), blId };
}

// ── Sync batch statuses from Digylog ──────────────────────────────────────────
export async function syncBatchStatuses(batchId: string) {
  await requireRole([...MANAGER]);

  const { data: rows } = await supabaseAdmin
    .from("delivery_batch_orders")
    .select("order_id, tracking_number")
    .eq("batch_id", batchId)
    .eq("status", "sent")
    .not("tracking_number", "is", null);

  const items = (rows ?? []) as { order_id: string; tracking_number: string }[];
  if (!items.length) return { success: false, error: "Aucun tracking à synchroniser." };

  const digylogClient4 = await (await import("@/lib/delivery/digylog/client")).createDigylogClientFromDB();
  const trackings = items.map((r) => r.tracking_number);
  const historicsRes = await digylogClient4.getHistorics(trackings);
  const historics = (historicsRes as Record<string, { "new value"?: string; date?: string }[]> | null) ?? {};

  const { applyDigylogStatusUpdate } = await import("@/lib/delivery/shipment-actions");
  let synced = 0;

  for (const item of items) {
    const events = (historics as Record<string, { "new value"?: string; date?: string }[]>)[item.tracking_number];
    if (!events?.length) continue;
    const last = events[events.length - 1];
    const newVal = last["new value"] ?? "";
    if (newVal) {
      await applyDigylogStatusUpdate({
        tracking: item.tracking_number, externalStatus: newVal,
        idStatus: 0, motif: "", postponedTo: null,
        eventTime: last.date ?? new Date().toISOString(),
        rawPayload: last as unknown as Record<string, unknown>,
      });
      synced++;
    }
  }

  revalidatePath(`/admin/delivery/batches/${batchId}`);
  return { success: true, synced };
}

// ── Send batch to Digylog PUT /orders/send → get real BL ID ───────────────────
export async function sendBatchGetBl(batchId: string): Promise<{
  ok: boolean; bl?: number; error?: string;
}> {
  await requireRole([...MANAGER]);

  // Get all trackings for this batch
  const { data: batchOrders } = await supabaseAdmin
    .from("delivery_batch_orders")
    .select("orders(delivery_tracking_number)")
    .eq("batch_id", batchId);

  type BO = { orders: { delivery_tracking_number: string | null } | null };
  const trackings = ((batchOrders ?? []) as BO[])
    .map((bo) => bo.orders?.delivery_tracking_number)
    .filter(Boolean) as string[];

  if (!trackings.length) return { ok: false, error: "Aucun tracking trouvé dans ce batch." };

  const client = await getDeliveryClient();
  const result = await client.sendOrders(trackings);

  if (!result.ok || !result.bl) {
    return { ok: false, error: result.error ?? "Digylog n'a pas retourné de BL." };
  }

  const blId = result.bl;

  // Update batch
  await supabaseAdmin.from("delivery_batches").update({
    bl_id:   blId,
    status:  "sent",
    sent_at: new Date().toISOString(),
  } as never).eq("id", batchId);

  // Update orders and shipments by tracking
  for (const tracking of trackings) {
    await supabaseAdmin.from("orders")
      .update({ bl_id: blId, status: "sent_to_delivery" } as never)
      .eq("delivery_tracking_number", tracking);
    await supabaseAdmin.from("delivery_shipments")
      .update({ bl_id: blId, internal_status: "not_sent" } as never)
      .eq("tracking_number", tracking);
  }

  revalidatePath("/admin/delivery/notes");
  revalidatePath(`/admin/delivery/notes/${batchId}`);
  revalidatePath("/admin/delivery/batches");
  return { ok: true, bl: blId };
}

// ── Repair: Regenerate BL for batch (call PUT /orders/send with ALL trackings) ─
export async function regenerateBatchBl(batchId: string): Promise<{
  ok: boolean; bl?: number; trackingsUsed?: number; error?: string;
}> {
  await requireRole([...MANAGER]);

  // Get ALL trackings for this batch from multiple sources
  const { data: boRows } = await supabaseAdmin
    .from("delivery_batch_orders")
    .select("tracking_number, order_id")
    .eq("batch_id", batchId);

  const boItems = (boRows ?? []) as { tracking_number: string | null; order_id: string }[];

  // Collect trackings from batch_orders and fallback to orders table
  let trackings = boItems.map((r) => r.tracking_number).filter(Boolean) as string[];

  if (trackings.length < boItems.length) {
    // Some trackings missing — get from orders table
    const orderIds = boItems.map((r) => r.order_id).filter(Boolean);
    const { data: ordRows } = await supabaseAdmin
      .from("orders")
      .select("id, delivery_tracking_number")
      .in("id", orderIds)
      .not("delivery_tracking_number", "is", null);

    const trackMap = new Map<string, string>();
    for (const o of (ordRows ?? []) as { id: string; delivery_tracking_number: string }[]) {
      trackMap.set(o.id, o.delivery_tracking_number);
    }

    // Update delivery_batch_orders with missing trackings
    for (const bo of boItems) {
      if (!bo.tracking_number) {
        const t = trackMap.get(bo.order_id);
        if (t) {
          await supabaseAdmin.from("delivery_batch_orders")
            .update({ tracking_number: t, status: "sent" } as never)
            .eq("batch_id", batchId)
            .eq("order_id", bo.order_id);
        }
      }
    }

    // Re-collect all trackings
    trackings = [
      ...new Set([
        ...trackings,
        ...[...trackMap.values()],
      ])
    ];
  }

  if (!trackings.length) {
    return { ok: false, error: "Aucun tracking trouvé pour ce batch." };
  }

  // Call PUT /orders/send with ALL trackings → get ONE grouped BL
  const client = await getDeliveryClient();
  const sendRes = await client.sendOrders(trackings);

  if (!sendRes.ok || !sendRes.bl) {
    return { ok: false, error: sendRes.error ?? "Digylog n'a pas retourné de BL groupé." };
  }

  const newBlId = sendRes.bl;

  // Update batch bl_id
  await supabaseAdmin.from("delivery_batches")
    .update({ bl_id: newBlId, status: "sent" } as never)
    .eq("id", batchId);

  // Update all orders in this batch
  const orderIds = boItems.map((r) => r.order_id).filter(Boolean);
  if (orderIds.length) {
    await supabaseAdmin.from("orders")
      .update({ bl_id: newBlId } as never)
      .in("id", orderIds);
    await supabaseAdmin.from("delivery_shipments")
      .update({ bl_id: newBlId } as never)
      .in("order_id", orderIds);
  }

  revalidatePath("/admin/delivery/notes");
  revalidatePath(`/admin/delivery/notes/${batchId}`);
  revalidatePath("/admin/delivery/documents");

  return { ok: true, bl: newBlId, trackingsUsed: trackings.length };
}

// ── Generate recap page(s) + sorted Digylog labels — merged PDF ─────────────
export async function generateRecapAndLabels(batchId: string): Promise<{
  ok: boolean; blobBase64?: string; totalTrackings?: number;
  productsFound?: number; error?: string; warning?: string; labelsOk?: number; labelsSkipped?: number;
}> {
  await requireRole([...MANAGER]);

  // ── 1. Fetch batch meta ────────────────────────────────────────────────────
  const { data: batchData, error: batchErr } = await supabaseAdmin
    .from("delivery_batches")
    .select("batch_number, total_orders")
    .eq("id", batchId)
    .maybeSingle();

  if (batchErr) {
    console.error("DELIVERY_NOTES_ERROR generateRecapAndLabels batch fetch:", batchErr.message);
    return { ok: false, error: `Batch introuvable: ${batchErr.message}` };
  }

  type BD = { batch_number: string; total_orders: number };
  const batchNum    = (batchData as BD | null)?.batch_number ?? "";
  const totalOrders = (batchData as BD | null)?.total_orders ?? 0;
  const batchStoreId: string | null = null; // delivery_store_id not yet in production

  // ── 2-5. Use shared buildSortedTicketOrders — single source of truth ────────
  // This guarantees recap order === ticket order === Digylog label input order.
  const sortedOrders = await buildSortedTicketOrders(batchId);
  const trackings = sortedOrders.map((o) => o.tracking).filter(Boolean) as string[];

  // ── Build product list from all available sources ─────────────────────────
  type ProdEntry = { id: string; name: string; sku: string; totalQty: number; orderCount: number };
  const prodMap = new Map<string, ProdEntry>();

  // Get all order IDs in this batch
  const { data: batchOrderIds } = await supabaseAdmin
    .from("delivery_batch_orders")
    .select("order_id")
    .eq("batch_id", batchId);
  const orderIds = ((batchOrderIds ?? []) as { order_id: string }[]).map(r => r.order_id).filter(Boolean);

  if (orderIds.length > 0) {
    // SOURCE 1 (priorité): order_items — quantités exactes par produit
    const { data: itemRows } = await supabaseAdmin
      .from("order_items")
      .select("order_id, product_id, product_name, product_sku, quantity")
      .in("order_id", orderIds);

    const ordersWithItems = new Set<string>();
    for (const item of (itemRows ?? []) as { order_id: string; product_id: string|null; product_name: string|null; product_sku: string|null; quantity: number }[]) {
      const name = (item.product_name ?? item.product_sku ?? "").trim();
      const sku  = (item.product_sku ?? "").trim();
      if (!name && !sku) continue;
      const key = item.product_id ?? (sku || name);
      if (!prodMap.has(key)) prodMap.set(key, { id: key, name: name || sku, sku, totalQty: 0, orderCount: 0 });
      const e = prodMap.get(key)!;
      e.totalQty   += item.quantity ?? 1;
      e.orderCount += 1;
      ordersWithItems.add(item.order_id);
    }

    // SOURCE 2 (fallback): orders.first_product_name + notes — seulement pour les orders sans order_items
    const orderIdsWithoutItems = orderIds.filter(id => !ordersWithItems.has(id));
    if (orderIdsWithoutItems.length > 0) {
      const { data: ordRows } = await supabaseAdmin
        .from("orders")
        .select("id, first_product_name, first_product_sku, total_quantity, notes")
        .in("id", orderIdsWithoutItems);

      type OrdRow = { id: string; first_product_name: string|null; first_product_sku: string|null; total_quantity: number|null; notes: string|null };

      for (const o of (ordRows ?? []) as OrdRow[]) {
        // Priority 1: first_product_name (set by sheet-sync)
        let name = (o.first_product_name ?? "").trim();
        const sku = (o.first_product_sku ?? "").trim();

        // Priority 2: extract from notes field "نافورة شمسية_x2" → "نافورة شمسية"
        if (!name && o.notes) {
          name = o.notes
            .replace(/_x[0-9]+/gi, "")
            .replace(/[×x][0-9]+/g, "")
            .replace(/\s*[0-9]+$/, "")
            .trim();
        }

        // Priority 3: SKU
        if (!name) name = sku;

        console.log("[recap products fallback]", { id: o.id, name, sku, notes: o.notes });
        if (!name) continue;

        const key = sku || name;
        if (!prodMap.has(key)) prodMap.set(key, { id: key, name, sku, totalQty: 0, orderCount: 0 });
        const e = prodMap.get(key)!;
        e.totalQty   += o.total_quantity ?? 1;
        e.orderCount += 1;
      }
    }
  }


  const products = [...prodMap.values()].sort((a, b) =>
    b.totalQty !== a.totalQty ? b.totalQty - a.totalQty : a.name.localeCompare(b.name)
  );

  // trackings already sorted by buildSortedTicketOrders — no backfill needed
  if (!trackings.length) {
    // Last resort: get from orders in any order
    const { data: fallback } = await supabaseAdmin
      .from("orders")
      .select("delivery_tracking_number")
      .eq("delivery_batch_id", batchId)
      .not("delivery_tracking_number", "is", null);
    trackings.push(...((fallback ?? []) as { delivery_tracking_number: string }[]).map((r) => r.delivery_tracking_number));
  }

  if (!trackings.length) return { ok: false, error: "Aucun tracking trouvé pour ce batch.", productsFound: products.length };

  // ── 4. Build recap PDF — 10×10 format (100mm = 283.46pt) ──────────────────
  try { // PDF generation wrapped — never crash the page
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const arabicReshaper = await import("arabic-reshaper");
  const reshapeArabic = (arabicReshaper.default ?? arabicReshaper).convertArabic;

  // WinAnsi font (Helvetica) only supports Latin chars.
  // Strip/replace any char outside Latin-1 range before drawText.
  // Arabic text must also be "reshaped" into presentation-form glyphs
  // (pdf-lib draws each character in isolation — without reshaping, Arabic
  // letters render disconnected and unreadable, e.g. "نافورة" → "ز ا ف و ر ة").
  function pdfSafe(text: string): string {
    const fixed = text
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .trim();
    // Reshape only if the text actually contains Arabic characters
    if (/[\u0600-\u06FF]/.test(fixed)) {
      try { return reshapeArabic(fixed); } catch { return fixed; }
    }
    return fixed;
  }

  const SZ = 283.46;            // 100mm in PDF points
  const MARGIN = 10;
  const LINE_H = 14;
  const HEADER_H = 52;
  const FOOTER_H = 16;
  const usableH = SZ - HEADER_H - FOOTER_H - MARGIN;
  const ROWS_PER_PAGE = Math.floor(usableH / LINE_H);  // ~13 rows

  const recapDoc   = await PDFDocument.create();

  // Register fontkit for custom font embedding
  const fontkit = await import("@pdf-lib/fontkit");
  recapDoc.registerFontkit(fontkit.default ?? fontkit);

  // Load Amiri font — try fs first (local dev), then fetch (Vercel production)
  let fontBold: import("pdf-lib").PDFFont;
  let fontNormal: import("pdf-lib").PDFFont;

  async function loadFontBytes(filename: string): Promise<Uint8Array> {
    // Try fs (local/dev)
    try {
      const fs   = await import("fs");
      const path = await import("path");
      const buf  = fs.readFileSync(path.join(process.cwd(), "public/fonts", filename));
      return new Uint8Array(buf);
    } catch { /* not available */ }

    // Try fetch (Vercel — public/ is served as static)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      ?? process.env.VERCEL_URL
      ?? "http://localhost:3000";
    const url = `${baseUrl.startsWith("http") ? baseUrl : "https://" + baseUrl}/fonts/${filename}`;
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error(`Font fetch failed: ${url} → ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  try {
    const boldBytes   = await loadFontBytes("Amiri-Bold.ttf");
    const normalBytes = await loadFontBytes("Amiri-Regular.ttf");
    fontBold   = await recapDoc.embedFont(boldBytes, { subset: false });
    fontNormal = await recapDoc.embedFont(normalBytes, { subset: false });
    console.log("[PDF] Amiri font loaded successfully");
  } catch (fontErr) {
    console.error("[PDF] Font load failed, using Helvetica (Arabic will not render):", fontErr);
    fontBold   = await recapDoc.embedFont(StandardFonts.HelveticaBold);
    fontNormal = await recapDoc.embedFont(StandardFonts.Helvetica);
  }

  // Chunk products into pages
  const chunks: ProdEntry[][] = [];
  if (products.length === 0) {
    chunks.push([]); // one empty page with warning
  } else {
    for (let i = 0; i < products.length; i += ROWS_PER_PAGE) {
      chunks.push(products.slice(i, i + ROWS_PER_PAGE));
    }
  }

  const totalUnits = products.reduce((s, p) => s + p.totalQty, 0);

  chunks.forEach((chunk, pageIdx) => {
    const page = recapDoc.addPage([SZ, SZ]);
    let y = SZ - MARGIN;

    // ── Header block ──────────────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: SZ - HEADER_H, width: SZ, height: HEADER_H, color: rgb(0.07, 0.07, 0.07) });

    // Batch number
    const titleFontSize = batchNum.length > 18 ? 9 : 11;
    page.drawText(pdfSafe(batchNum), {
      x: MARGIN, y: SZ - MARGIN - titleFontSize,
      font: fontBold, size: titleFontSize, color: rgb(1, 1, 1),
    });

    // Orders count + page indicator
    const subLine = `${totalOrders} commandes  •  ${totalUnits} unités${chunks.length > 1 ? `  •  p.${pageIdx + 1}/${chunks.length}` : ""}`;
    page.drawText(pdfSafe(subLine), {
      x: MARGIN, y: SZ - MARGIN - titleFontSize - 13,
      font: fontNormal, size: 7.5, color: rgb(0.75, 0.75, 0.75),
    });

    y = SZ - HEADER_H - 6;

    // ── Column headers ────────────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: y - 10, width: SZ, height: 13, color: rgb(0.92, 0.92, 0.92) });
    page.drawText("PRODUIT / SKU", { x: MARGIN + 14, y: y - 7, font: fontBold, size: 7, color: rgb(0.4, 0.4, 0.4) });
    page.drawText("QTÉ", { x: SZ - 30, y: y - 7, font: fontBold, size: 7, color: rgb(0.4, 0.4, 0.4) });
    y -= 13;

    if (chunk.length === 0) {
      page.drawText("Aucun produit trouvé.", {
        x: MARGIN, y: y - 20, font: fontNormal, size: 8, color: rgb(0.7, 0, 0),
      });
    }

    // ── Product rows ──────────────────────────────────────────────────────
    chunk.forEach((p, i) => {
      const globalRank = pageIdx * ROWS_PER_PAGE + i;
      const rowY = y - (i + 1) * LINE_H;

      // Alternating background
      if (i % 2 === 0) {
        page.drawRectangle({ x: 0, y: rowY - 2, width: SZ, height: LINE_H, color: rgb(0.97, 0.97, 0.97) });
      }

      // Rank badge
      const badgeColor = globalRank === 0 ? rgb(0.85, 0.65, 0.05)
        : globalRank === 1 ? rgb(0.62, 0.62, 0.62)
        : globalRank === 2 ? rgb(0.75, 0.45, 0.15)
        : rgb(0.85, 0.85, 0.85);
      page.drawCircle({ x: MARGIN + 5, y: rowY + 5, size: 5.5, color: badgeColor });
      const rankStr = String(globalRank + 1);
      page.drawText(rankStr, {
        x: MARGIN + (rankStr.length === 1 ? 3 : 1.5), y: rowY + 2,
        font: fontBold, size: 6, color: globalRank < 3 ? rgb(1,1,1) : rgb(0.4,0.4,0.4),
      });

      // Product name (max 28 chars)
      const nameText = pdfSafe(p.name.length > 28 ? p.name.slice(0, 26) + "..." : p.name);
      page.drawText(nameText, {
        x: MARGIN + 14, y: rowY + 5,
        font: globalRank < 3 ? fontBold : fontNormal,
        size: 8, color: rgb(0.1, 0.1, 0.1),
      });

      // SKU below name — skip if identical to product name (sheet-sync sometimes sets sku = name)
      const skuNormalized  = (p.sku ?? "").trim().toLowerCase();
      const nameNormalized = p.name.trim().toLowerCase();
      if (p.sku && skuNormalized !== nameNormalized) {
        page.drawText(pdfSafe(p.sku.slice(0, 18)), {
          x: MARGIN + 14, y: rowY - 1,
          font: fontNormal, size: 6, color: rgb(0.6, 0.6, 0.6),
        });
      }

      // Quantity (bold, right-aligned)
      const qtyText = `×${p.totalQty}`;
      const qtyW = qtyText.length * 5.5;
      page.drawText(qtyText, {
        x: SZ - MARGIN - qtyW, y: rowY + 3,
        font: fontBold, size: 10,
        color: globalRank < 3 ? rgb(0.08, 0.08, 0.08) : rgb(0.35, 0.35, 0.35),
      });
    });

    // ── Footer ────────────────────────────────────────────────────────────
    page.drawLine({ start: { x: MARGIN, y: FOOTER_H - 2 }, end: { x: SZ - MARGIN, y: FOOTER_H - 2 }, thickness: 0.5, color: rgb(0.8,0.8,0.8) });
    page.drawText(`${trackings.length} trackings à imprimer`, {
      x: MARGIN, y: FOOTER_H - 12, font: fontNormal, size: 6.5, color: rgb(0.55, 0.55, 0.55),
    });
  });

  const recapBytes = await recapDoc.save();

  // ── 5. Download Digylog labels ONE BY ONE in sorted order then merge ────────
  // Digylog POST /labels ignores the order of trackings array — it returns
  // labels in its own internal order. The only way to guarantee sorted output
  // is to download each label individually and merge them ourselves.
  const client = await getDeliveryClient();
  const mergedDoc = await PDFDocument.create();
  const recapSrc  = await PDFDocument.load(recapBytes);
  const recapPages = await mergedDoc.copyPages(recapSrc, recapSrc.getPageIndices());
  recapPages.forEach((p) => mergedDoc.addPage(p));

  // Download each label individually — skip deleted/not-found orders
  let labelsOk = 0;
  const labelErrors: string[] = [];

  for (const tracking of trackings) {
    try {
      const labelRes = await client.downloadLabels({ orders: [tracking], format: 3 });
      if (!labelRes.ok || !labelRes.blob) {
        console.warn(`[labels] skip ${tracking}: ${labelRes.error}`);
        labelErrors.push(`${tracking}: ${labelRes.error ?? "not found"}`);
        continue;
      }
      const labelBytes = new Uint8Array(await labelRes.blob.arrayBuffer());
      const labelSrc   = await PDFDocument.load(labelBytes);
      const labelPages = await mergedDoc.copyPages(labelSrc, labelSrc.getPageIndices());
      labelPages.forEach((p) => mergedDoc.addPage(p));
      labelsOk++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[labels] error ${tracking}:`, msg);
      labelErrors.push(`${tracking}: ${msg}`);
    }
  }

  if (labelErrors.length > 0) {
    console.warn(`[generateRecapAndLabels] ${labelErrors.length} label(s) skipped:`, labelErrors);
  }

  // Always save PDF — even if some labels failed (recap pages always present)
  const mergedBytes = await mergedDoc.save();

  // ── 7. Mark batch as printed ───────────────────────────────────────────────
  await supabaseAdmin.from("delivery_batches")
    .update({
      status:               "tickets_printed",
      labels_downloaded_at: new Date().toISOString(),
    } as never)
    .eq("id", batchId)
    .in("status", ["draft", "tickets_printed"]);

  // Also update product summary table if it was empty
  if (products.length > 0) {
    const existing = await supabaseAdmin.from("delivery_batch_product_summary")
      .select("id", { count: "exact", head: true }).eq("batch_id", batchId);
    if ((existing.count ?? 0) === 0) {
      await supabaseAdmin.from("delivery_batch_product_summary").insert(
        products.map((p) => ({
          batch_id:       batchId,
          product_id:     p.id === "__unknown__" ? null : p.id,
          product_name:   p.name,
          sku:            p.sku || null,
          total_quantity: p.totalQty,
          order_count:    p.orderCount,
        })) as never
      );
    }
  }

  revalidatePath("/admin/delivery/notes");
  revalidatePath(`/admin/delivery/notes/${batchId}`);

  return {
    ok: true,
    blobBase64:      Buffer.from(mergedBytes).toString("base64"),
    totalTrackings:  trackings.length,
    productsFound:   products.length,
    labelsOk,
    labelsSkipped:   labelErrors.length,
    warning:         labelErrors.length > 0
      ? `${labelErrors.length} étiquette(s) non disponible(s) — commande(s) introuvable(s) chez le transporteur.`
      : undefined,
  };
  } catch (pdfErr) {
    const msg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
    console.error("DELIVERY_NOTES_ERROR PDF generation:", msg);
    return { ok: false, error: `Erreur génération PDF: ${msg}`, productsFound: products?.length ?? 0 };
  }
}

// ─── Rebuild product summary for any batch ────────────────────────────────────
// Called after sheet-sync adds orders to batch. Ensures Récap + Tickets work.
export async function rebuildBatchProductSummary(batchId: string): Promise<void> {
  // Get all orders in batch with their items
  const { data: batchOrders } = await supabaseAdmin
    .from("delivery_batch_orders")
    .select("order_id")
    .eq("batch_id", batchId);

  const orderIds = ((batchOrders ?? []) as { order_id: string }[]).map((r) => r.order_id);
  if (!orderIds.length) return;

  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("order_id, quantity, product_id, product_name, sku")
    .in("order_id", orderIds);

  type Item = { order_id: string; quantity: number; product_id: string | null; product_name: string | null; sku: string | null };
  const itemRows = (items ?? []) as Item[];

  // Group by product
  const prodMap = new Map<string, { product_id: string | null; product_name: string; sku: string; total_quantity: number; order_count: number; order_ids: Set<string> }>();

  for (const item of itemRows) {
    const key  = item.product_id ?? item.product_name ?? "unknown";
    const name = item.product_name ?? "Produit";
    const sku  = item.sku ?? "";

    if (!prodMap.has(key)) {
      prodMap.set(key, { product_id: item.product_id, product_name: name, sku, total_quantity: 0, order_count: 0, order_ids: new Set() });
    }
    const entry = prodMap.get(key)!;
    entry.total_quantity += item.quantity ?? 1;
    if (!entry.order_ids.has(item.order_id)) {
      entry.order_ids.add(item.order_id);
      entry.order_count++;
    }
  }

  // Lire orders.first_product_name + notes — UNIQUEMENT pour les orders sans order_items (évite double-comptage)
  {
    const ordersWithItems = new Set(itemRows.map(r => r.order_id));
    const orderIdsWithoutItems = orderIds.filter(id => !ordersWithItems.has(id));

    if (orderIdsWithoutItems.length > 0) {
      const { data: ordersForSummary } = await supabaseAdmin
        .from("orders")
        .select("id, first_product_name, first_product_sku, total_quantity, notes")
        .in("id", orderIdsWithoutItems);

      for (const o of (ordersForSummary ?? []) as { id: string; first_product_name: string | null; first_product_sku: string | null; total_quantity: number | null; notes: string | null }[]) {
        let name = (o.first_product_name ?? "").trim();
        const sku = (o.first_product_sku ?? "").trim();

        // Extract from notes if no product name
        if (!name && o.notes) {
          name = o.notes
            .replace(/_x[0-9]+/gi, "")
            .replace(/[×x][0-9]+/g, "")
            .replace(/\s*[0-9]+$/, "")
            .trim();
        }
        if (!name) name = sku;
        if (!name) continue;

        const key = sku || name;
        if (!prodMap.has(key)) {
          prodMap.set(key, { product_id: null, product_name: name, sku, total_quantity: 0, order_count: 0, order_ids: new Set() });
        }
        const entry = prodMap.get(key)!;
        entry.total_quantity += (o.total_quantity ?? 1);
        if (!entry.order_ids.has(o.id)) {
          entry.order_ids.add(o.id);
          entry.order_count++;
        }
      }
    }
  }

  if (prodMap.size === 0) {
    console.warn(`[batch] No products found for batch ${batchId} — product summary will be empty`);
    return;
  }

  // Delete old summary and rebuild
  await supabaseAdmin.from("delivery_batch_product_summary").delete().eq("batch_id", batchId);

  const summaryRows = [...prodMap.values()].map((p) => ({
    batch_id:       batchId,
    product_id:     p.product_id,
    product_name:   p.product_name,
    sku:            p.sku,
    total_quantity: p.total_quantity,
    order_count:    p.order_count,
  }));

  await supabaseAdmin.from("delivery_batch_product_summary").insert(summaryRows as never);

  // Update total_products on batch
  const totalQty = summaryRows.reduce((s, r) => s + r.total_quantity, 0);
  await supabaseAdmin.from("delivery_batches")
    .update({ total_products: totalQty } as never)
    .eq("id", batchId);

  console.log(`[batch] ✓ Product summary rebuilt for batch ${batchId}: ${summaryRows.length} products, ${totalQty} units`);
}
