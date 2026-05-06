"use server";
/**
 * lib/delivery/batch/actions.ts
 * Server actions for delivery batch management.
 */
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { createDigylogClientFromDB } from "@/lib/delivery/digylog/client";

const MANAGER = ["super_admin","admin","manager"] as const;

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
    .in("id", orderIds)
    .eq("status", "confirmed");

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

  const client = await createDigylogClientFromDB();
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

  console.log(`📥 DIGYLOG BATCH RESULT: ok=${result.ok} orders=${result.orders.length}`);

  // Process results — match by num (order_number)
  const trackingByNum = new Map<string, { tracking: string; bl?: number }>();
  for (const created of result.orders) {
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
      const errMsg = result.ok
        ? `Pas de tracking retourné pour ${o.order_number}`
        : (result.error ?? "Erreur Digylog");
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

// ── Download tickets for batch ─────────────────────────────────────────────────
export async function downloadBatchLabels(batchId: string): Promise<{
  ok: boolean; blobBase64?: string; error?: string;
}> {
  await requireRole([...MANAGER]);

  const { data: rows } = await supabaseAdmin
    .from("delivery_batch_orders")
    .select("tracking_number")
    .eq("batch_id", batchId)
    .eq("status", "sent")
    .not("tracking_number", "is", null);

  const trackings = ((rows ?? []) as { tracking_number: string }[])
    .map((r) => r.tracking_number)
    .filter(Boolean);

  if (!trackings.length) {
    return { ok: false, error: "Aucun tracking disponible. Envoyez le batch à Digylog d'abord." };
  }

  const client = await createDigylogClientFromDB();
  const result = await client.downloadLabels({ orders: trackings, format: 3 });
  if (!result.ok || !result.blob) return { ok: false, error: result.error };

  // Mark status
  await supabaseAdmin.from("delivery_batches")
    .update({ status: "labels_downloaded" } as never)
    .eq("id", batchId);

  revalidatePath(`/admin/delivery/batches/${batchId}`);

  const buf = await result.blob.arrayBuffer();
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

  const client = await createDigylogClientFromDB();
  const result = await client.downloadBlPdf(blId);
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

  const client  = await createDigylogClientFromDB();
  const trackings = items.map((r) => r.tracking_number);
  const historics = await client.getHistorics(trackings);

  const { applyDigylogStatusUpdate } = await import("@/lib/delivery/shipment-actions");
  let synced = 0;

  for (const item of items) {
    const events = historics[item.tracking_number];
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

  const client = await createDigylogClientFromDB();
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
