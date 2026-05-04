"use server";
/**
 * lib/delivery/shipment-actions.ts
 * Server actions for Digylog delivery operations.
 * DIGYLOG_TOKEN never reaches the browser.
 */
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { createDigylogClient } from "./digylog/client";
import { mapDigylogStatus } from "./digylog/status-map";

const MANAGER = ["super_admin","admin","manager"] as const;
const FINANCE  = ["super_admin","admin","manager","finance"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("212") && digits.length === 12) return "0" + digits.slice(3);
  if (digits.startsWith("0") && digits.length === 10) return digits;
  return digits.slice(-10).padStart(10, "0");
}

async function getDigylogSettings() {
  const { data } = await supabaseAdmin
    .from("digylog_settings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as {
    default_network_id:      number;
    default_store_name:      string;
    default_port:            1 | 2;
    default_mode:            1 | 2;
    default_status_on_create:0 | 1;
  } | null;
}

async function getDigylogCompanyId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("delivery_companies")
    .select("id")
    .eq("slug", "digylog")
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// ─── Send order to Digylog ────────────────────────────────────────────────────
export async function sendOrderToDigylog(orderId: string) {
  await requireRole([...MANAGER]);

  // Fetch order + items
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select(`
      id, order_number, customer_name, customer_phone,
      customer_city, customer_address, total_amount_mad, notes, status,
      delivery_tracking_number
    `)
    .eq("id", orderId)
    .single();

  if (!order) return { success: false, error: "Commande introuvable." };

  const o = order as {
    id: string; order_number: string; customer_name: string;
    customer_phone: string; customer_city: string; customer_address: string;
    total_amount_mad: number; notes: string | null; status: string;
    delivery_tracking_number: string | null;
  };

  if (!["confirmed"].includes(o.status)) {
    return { success: false, error: "Seules les commandes confirmées peuvent être envoyées à Digylog." };
  }
  if (o.delivery_tracking_number) {
    return { success: false, error: `Déjà envoyé — tracking: ${o.delivery_tracking_number}` };
  }

  // Fetch order items + product names
  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("quantity, products(name, sku)")
    .eq("order_id", orderId);

  type Item = { quantity: number; products: { name: string; sku: string } | null };
  const orderItems = (items ?? []) as Item[];

  // Load Digylog settings
  const settings = await getDigylogSettings();
  if (!settings) {
    return { success: false, error: "Paramètres Digylog manquants. Configurez dans Paramètres → Transporteur." };
  }

  const token = process.env.DIGYLOG_TOKEN ?? "";
  if (!token) {
    return { success: false, error: "DIGYLOG_TOKEN manquant dans les variables d'environnement Vercel." };
  }

  const client = createDigylogClient();

  // Build order payload
  const refs = orderItems.map((item) => ({
    designation: item.products?.name ?? "Produit",
    quantity:    item.quantity,
  }));

  if (!refs.length) refs.push({ designation: "Produit", quantity: 1 });

  const result = await client.createOrders({
    network:        settings.default_network_id,
    store:          settings.default_store_name,
    mode:           settings.default_mode ?? 1,
    status:         settings.default_status_on_create ?? 1, // 1 = add & send immediately
    checkDuplicate: 1,
    orders: [{
      num:         o.order_number,
      type:        1,
      mode:        settings.default_mode ?? 1,
      network:     String(settings.default_network_id),
      fc:          null,
      store:       settings.default_store_name,
      name:        o.customer_name,
      phone:       normalizePhone(o.customer_phone),
      address:     o.customer_address,
      city:        o.customer_city,
      price:       o.total_amount_mad,
      refs,
      openproduct: 1,
      port:        settings.default_port ?? 1,
      note:        o.notes ?? "",
    }],
  });

  if (!result.ok || !result.orders.length) {
    return { success: false, error: result.error ?? "Erreur Digylog — aucun tracking retourné." };
  }

  const created = result.orders[0];
  const tracking = created.tracking;
  const blId     = created.bl ?? null;

  const companyId = await getDigylogCompanyId();

  // Save delivery_shipments row
  await supabaseAdmin.from("delivery_shipments").upsert({
    order_id:           orderId,
    delivery_company_id:companyId,
    tracking_number:    tracking,
    external_order_id:  o.order_number,
    external_status:    "Non envoyé",
    external_status_id: 0,
    internal_status:    "not_sent",
    bl_id:              blId,
    raw_payload:        created as never,
    last_synced_at:     new Date().toISOString(),
  } as never, { onConflict: "order_id" });

  // Update order
  await supabaseAdmin.from("orders").update({
    delivery_tracking_number: tracking,
    delivery_company_id:      companyId,
    external_delivery_id:     o.order_number,
    delivery_external_status: "Non envoyé",
    delivery_external_status_id: 0,
    delivery_status:          "not_sent",
    delivery_last_sync_at:    new Date().toISOString(),
    status:                   "sent_to_delivery",
    sent_to_delivery_at:      new Date().toISOString(),
    bl_id:                    blId,
  } as never).eq("id", orderId);

  // Log event
  await supabaseAdmin.from("delivery_status_events").insert({
    order_id:        orderId,
    tracking_number: tracking,
    external_status: "Non envoyé",
    external_status_id: 0,
    internal_status: "not_sent",
    event_time:      new Date().toISOString(),
    raw_payload:     created as never,
  } as never);

  revalidatePath("/admin/delivery");
  revalidatePath(`/admin/delivery/${orderId}`);
  return { success: true, tracking, blId };
}

// ─── Sync status for one order ────────────────────────────────────────────────
export async function syncDigylogStatus(tracking: string) {
  await requireRole([...MANAGER]);
  const client = createDigylogClient();

  const infos = await client.getOrderInfos(tracking);
  if (!infos) return { success: false, error: "Tracking introuvable sur Digylog." };

  const idStatus     = infos.idStatus ?? null;
  const statusLabel  = String(infos.status ?? "");
  const mapped       = mapDigylogStatus(idStatus, statusLabel);

  await applyDigylogStatusUpdate({
    tracking, externalStatus: statusLabel, idStatus: idStatus ?? 0,
    motif: "", postponedTo: null,
    eventTime: new Date().toISOString(),
    rawPayload: infos as Record<string, unknown>,
  });

  revalidatePath("/admin/delivery");
  return { success: true, internal: mapped.internal };
}

// ─── Apply a status update (shared by webhook + sync) ─────────────────────────
export async function applyDigylogStatusUpdate(params: {
  tracking:       string;
  externalStatus: string;
  idStatus:       number;
  motif:          string;
  postponedTo:    string | null;
  eventTime:      string;
  rawPayload:     Record<string, unknown>;
}) {
  const { tracking, externalStatus, idStatus, motif, postponedTo, eventTime, rawPayload } = params;
  const mapped = mapDigylogStatus(idStatus, externalStatus);

  // Find shipment + order
  const { data: shipment } = await supabaseAdmin
    .from("delivery_shipments")
    .select("id, order_id")
    .eq("tracking_number", tracking)
    .maybeSingle();

  const shipmentId = (shipment as { id: string; order_id: string } | null)?.id;
  let orderId      = (shipment as { id: string; order_id: string } | null)?.order_id;

  // Fallback: find order directly by tracking
  if (!orderId) {
    const { data: ord } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("delivery_tracking_number", tracking)
      .maybeSingle();
    orderId = (ord as { id: string } | null)?.id;
  }

  if (!orderId) return; // Nothing to update

  const now = new Date().toISOString();

  // Log event
  await supabaseAdmin.from("delivery_status_events").insert({
    shipment_id:        shipmentId,
    order_id:           orderId,
    tracking_number:    tracking,
    external_status:    externalStatus,
    external_status_id: idStatus,
    internal_status:    mapped.internal,
    motif:              motif || null,
    postponed_to:       postponedTo,
    event_time:         eventTime,
    raw_payload:        rawPayload,
  } as never);

  // Update shipment
  if (shipmentId) {
    await supabaseAdmin.from("delivery_shipments").update({
      external_status:    externalStatus,
      external_status_id: idStatus,
      internal_status:    mapped.internal,
      last_synced_at:     now,
    } as never).eq("id", shipmentId);
  }

  // Build order update
  const orderUpdate: Record<string, unknown> = {
    delivery_external_status:    externalStatus,
    delivery_external_status_id: idStatus,
    delivery_status:             mapped.internal,
    delivery_last_sync_at:       now,
    status:                      mapped.orderStatus,
  };

  if (mapped.isPaid) {
    orderUpdate.is_paid  = true;
    orderUpdate.paid_at  = eventTime;
  }
  if (mapped.isDelivered && !mapped.isPaid) {
    orderUpdate.delivered_at = eventTime;
  }
  if (mapped.isReturned) {
    orderUpdate.returned_at = eventTime;
  }

  await supabaseAdmin.from("orders").update(orderUpdate as never).eq("id", orderId);
}

// ─── Register webhook with Digylog ────────────────────────────────────────────
export async function registerDigylogWebhook() {
  await requireRole(["super_admin","admin"]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const webhookUrl = `${appUrl}/api/webhooks/digylog`;

  const client = createDigylogClient();
  const result = await client.registerWebhook(webhookUrl);

  if (result.ok) {
    await supabaseAdmin.from("digylog_settings").update({
      webhook_url: webhookUrl,
    } as never).not("id", "is", null);
  }

  return result;
}

// ─── Test connection ──────────────────────────────────────────────────────────
export async function testDigylogConnection() {
  await requireRole([...MANAGER]);
  const client = createDigylogClient();
  return client.testConnection();
}

// ─── Sync reference data (networks, cities, stores) ──────────────────────────
export async function syncDigylogReferenceData() {
  await requireRole([...MANAGER]);
  const client = createDigylogClient();

  const [networks, stores, cities, statuses] = await Promise.all([
    client.getNetworks(),
    client.getStores(),
    client.getCities(),
    client.getStatuses(),
  ]);

  // Store in digylog_settings config column
  await supabaseAdmin.from("digylog_settings").update({
    config: { networks, stores, cities: cities.map((c) => c.name), statuses } as never,
  } as never).not("id", "is", null);

  return {
    success: true,
    networks: networks.length,
    stores:   stores.length,
    cities:   cities.length,
    statuses: statuses.length,
  };
}

// ─── Save Digylog settings ────────────────────────────────────────────────────
export async function saveDigylogSettings(data: {
  default_network_id:      number;
  default_store_name:      string;
  default_port:            1 | 2;
  default_mode:            1 | 2;
  default_status_on_create:0 | 1;
  webhook_secret?:         string;
}) {
  await requireRole(["super_admin","admin"]);

  const existing = await getDigylogSettings();

  if (existing) {
    await supabaseAdmin.from("digylog_settings").update(data as never).not("id", "is", null);
  } else {
    await supabaseAdmin.from("digylog_settings").insert({
      ...data,
      token:   "",
      referer: process.env.DIGYLOG_REFERER ?? "https://apiseller.digylog.com",
    } as never);
  }

  revalidatePath("/admin/settings/delivery");
  return { success: true };
}

// ─── Download label (server side) ─────────────────────────────────────────────
export async function getDigylogLabelUrl(trackings: string[]): Promise<{
  ok: boolean; error?: string; blobBase64?: string;
}> {
  await requireRole([...MANAGER]);
  const client = createDigylogClient();
  const result = await client.downloadLabels({ orders: trackings, format: 1 });
  if (!result.ok || !result.blob) return { ok: false, error: result.error };
  const buf    = await result.blob.arrayBuffer();
  const b64    = Buffer.from(buf).toString("base64");
  return { ok: true, blobBase64: b64 };
}

// ─── Download BL ──────────────────────────────────────────────────────────────
export async function getDigylogBlUrl(blId: number): Promise<{
  ok: boolean; error?: string; blobBase64?: string;
}> {
  await requireRole([...MANAGER]);
  const client = createDigylogClient();
  const result = await client.downloadBlPdf(blId);
  if (!result.ok || !result.blob) return { ok: false, error: result.error };
  const buf = await result.blob.arrayBuffer();
  const b64 = Buffer.from(buf).toString("base64");
  return { ok: true, blobBase64: b64 };
}

// ─── Stubs for legacy invoice/document components (Step 13 API) ───────────────
export async function importInvoices(_from: string, _to: string) {
  return { success: false, error: "Import via API Digylog non configuré.", imported: 0 };
}
export async function reconcileInvoice(_invoiceId: string) {
  return { success: false as const, error: "Réconciliation non configurée.", matched:0, missing:0, diff:0 };
}
export async function fetchDeliveryDocument(
  _type: "delivery"|"pickup"|"return", _date: string
) {
  return { success: false as const, error: "Non configuré.", fileUrl: undefined as string|undefined };
}
export async function saveDeliverySettings(_data: Record<string, unknown>) {
  return { success: true };
}
export async function applyStatusUpdate(
  tracking: string, externalStatus: string,
  rawPayload: Record<string, unknown>, eventTime?: string
) {
  await applyDigylogStatusUpdate({
    tracking, externalStatus, idStatus: 0, motif: "",
    postponedTo: null, eventTime: eventTime ?? new Date().toISOString(), rawPayload,
  });
}
