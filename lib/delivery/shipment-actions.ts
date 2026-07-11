"use server";
/**
 * lib/delivery/shipment-actions.ts
 * Server actions for Digylog delivery operations.
 * Token NEVER reaches the browser.
 */
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { getDeliveryClient } from "@/lib/delivery/client-factory";
import { createDigylogClientFromDB } from "@/lib/delivery/digylog/client";
import { mapDigylogStatus } from "./digylog/status-map";
import { createAuditLog, auditStatusChange } from "@/lib/audit/audit-logger";

const MANAGER = ["super_admin","admin","manager"] as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Normalize Moroccan phone to exactly 10 digits starting with 0 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("212") && digits.length === 12) return "0" + digits.slice(3);
  if (digits.startsWith("0")   && digits.length === 10) return digits;
  // pad/truncate to 10
  return ("0" + digits).slice(-10).padStart(10, "0");
}

async function getDigylogSettings() {
  const { data } = await supabaseAdmin
    .from("digylog_settings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as {
    default_network_id:       number;
    default_store_name:       string;
    default_port:             1 | 2;
    default_mode:             1 | 2;
    default_status_on_create: 0 | 1;
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

// ── Send order to Digylog ──────────────────────────────────────────────────────
export async function sendOrderToDigylog(orderId: string): Promise<{
  success: boolean;
  tracking?: string;
  blId?: number | null;
  error?: string;
}> {
  await requireRole([...MANAGER]);

  // 1. Load order
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .select(`
      id, order_number, customer_name, customer_phone,
      customer_city, customer_address, total_amount_mad, notes, status,
      delivery_tracking_number
    `)
    .eq("id", orderId)
    .single();

  if (orderErr || !order) return { success: false, error: "Commande introuvable." };

  const o = order as {
    id: string; order_number: string; customer_name: string;
    customer_phone: string; customer_city: string; customer_address: string;
    total_amount_mad: number; notes: string | null; status: string;
    delivery_tracking_number: string | null;
  };

  if (o.status !== "confirmed") {
    return { success: false, error: `Statut invalide: "${o.status}". Seules les commandes "confirmed" peuvent être envoyées.` };
  }
  if (o.delivery_tracking_number) {
    return { success: false, error: `Déjà envoyé — tracking: ${o.delivery_tracking_number}` };
  }

  // 2. Validate phone
  const phone = normalizePhone(o.customer_phone);
  if (phone.length !== 10 || !phone.startsWith("0")) {
    return { success: false, error: `Téléphone invalide: "${o.customer_phone}" → "${phone}". Doit être 10 chiffres commençant par 0.` };
  }

  // 3. Load items
  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("quantity, products(name, sku)")
    .eq("order_id", orderId);

  type Item = { quantity: number; products: { name: string; sku: string } | null };
  const orderItems = (items ?? []) as Item[];
  const refs = orderItems.map((item) => ({
    designation: item.products?.name ?? "Produit",
    quantity:    item.quantity,
  }));
  if (!refs.length) refs.push({ designation: "Produit", quantity: 1 });

  // 4. Load Digylog settings
  const settings = await getDigylogSettings();
  if (!settings) {
    return { success: false, error: "Paramètres Digylog manquants. Allez dans Paramètres → Transporteur." };
  }
  if (!settings.default_store_name) {
    return { success: false, error: "Nom de boutique Digylog manquant. Configurez-le dans Paramètres → Transporteur." };
  }
  if (!settings.default_network_id) {
    return { success: false, error: "ID réseau Digylog manquant. Configurez-le dans Paramètres → Transporteur." };
  }

  // 5. Build client — token from DB or env
  const client = await createDigylogClientFromDB();
  if (!client.hasToken()) {
    return { success: false, error: "Token Digylog manquant. Entrez-le dans Paramètres → Transporteur." };
  }

  // 6. Build payload
  // Force integer — DB may store string if saved incorrectly
  const networkId = parseInt(String(settings.default_network_id), 10);
  if (!networkId || isNaN(networkId)) {
    return { success: false, error: `ID réseau invalide: "${settings.default_network_id}". Doit être un nombre entier (ex: 1). Allez dans Paramètres → Transporteur → Sync → choisissez le réseau.` };
  }

  const payload = {
    network:        networkId,
    store:          settings.default_store_name,
    mode:           (settings.default_mode ?? 1) as 1 | 2,
    status:         (settings.default_status_on_create ?? 1) as 0 | 1,
    checkDuplicate: 1 as const,
    orders: [{
      num:         o.order_number,
      type:        1 as const,
      mode:        (settings.default_mode ?? 1) as 1 | 2,
      network:     String(networkId),
      fc:          null,
      store:       settings.default_store_name,
      name:        o.customer_name,
      phone,
      address:     o.customer_address || "N/A",
      city:        o.customer_city,
      price:       o.total_amount_mad,
      refs,
      openproduct: 1 as const,
      port:        (settings.default_port ?? 1) as 1 | 2,
      note:        o.notes ?? "",
    }],
  };

  // 7. Send to Digylog
  const result = await client.createOrders(payload);

  const resultOrders = (result as { orders?: unknown[] }).orders ?? [];
  if (!result.ok || !resultOrders.length) {
    return {
      success: false,
      error: String((result as { error?: unknown }).error ?? "Digylog n'a pas retourné de tracking."),
    };
  }

  const created  = ((result as { orders?: { tracking?: string; bl?: number | null }[] }).orders ?? [])[0];
  const tracking = created?.tracking;
  const blId     = created?.bl != null ? Number(created.bl) : null;

  if (!tracking) {
    return {
      success: false,
      error: `Digylog a accepté la commande mais n'a pas retourné de tracking. Réponse: ${JSON.stringify(created).slice(0, 200)}`,
    };
  }

  // 8. Persist to DB
  const companyId = await getDigylogCompanyId();

  const [shipmentRes, orderRes] = await Promise.all([
    supabaseAdmin.from("delivery_shipments").upsert({
      order_id:            orderId,
      delivery_company_id: companyId,
      tracking_number:     tracking,
      external_order_id:   o.order_number,
      external_status:     "Non envoyé",
      external_status_id:  0,
      internal_status:     "not_sent",
      bl_id:               blId,
      raw_payload:         created as never,
      last_synced_at:      new Date().toISOString(),
    } as never, { onConflict: "order_id" }),

    supabaseAdmin.from("orders").update({
      delivery_tracking_number:    tracking,
      delivery_company_id:         companyId,
      external_delivery_id:        o.order_number,
      delivery_external_status:    "Non envoyé",
      delivery_external_status_id: 0,
      delivery_status:             "not_sent",
      delivery_last_sync_at:       new Date().toISOString(),
      status:                      "not_sent",    // Will update to sent_to_delivery after PUT /orders/send
      bl_id:                       blId,
    } as never).eq("id", orderId),
  ]);

  if (shipmentRes.error) console.error("❌ shipment upsert error:", shipmentRes.error.message);
  if (orderRes.error)    console.error("❌ order update error:",   orderRes.error.message);

  // 9. Log lifecycle
  console.log("DIGYLOG ORDER LIFECYCLE", {
    orderNumber: o.order_number,
    trackingNumber: tracking,
    created: true,
    sentToDelivery: false,
    digylogStatus: "Non envoyé (idStatus=0) — order in Non envoyées, not picked up yet",
  });

  // 10. Log event
  await supabaseAdmin.from("delivery_status_events").insert({
    order_id:           orderId,
    tracking_number:    tracking,
    external_status:    "Non envoyé",
    external_status_id: 0,
    internal_status:    "not_sent",
    event_time:         new Date().toISOString(),
    raw_payload:        created as never,
  } as never).then(() => {}, () => {});

  revalidatePath("/admin/delivery");
  revalidatePath("/admin/delivery/digylog");
  revalidatePath("/admin/orders");

  return { success: true, tracking, blId };
}

// ── Test order (for settings page) ────────────────────────────────────────────
export async function sendTestOrderToDigylog(settings: {
  network_id:  number;
  store_name:  string;
  port:        1 | 2;
}): Promise<{
  ok:          boolean;
  message:     string;
  tracking?:   string;
  payload?:    unknown;
  response?:   unknown;
}> {
  await requireRole([...MANAGER]);
  const client = await createDigylogClientFromDB();
  if (!client.hasToken()) {
    return { ok: false, message: "Token Digylog manquant. Entrez-le et sauvegardez." };
  }

  const networkIdTest = parseInt(String(settings.network_id), 10);
  if (!networkIdTest || isNaN(networkIdTest)) {
    return { ok: false, message: `ID réseau invalide: "${settings.network_id}". Doit être un nombre.`, payload: null, response: null };
  }

  const testPayload = {
    network:        networkIdTest,
    store:          settings.store_name,
    mode:           1 as const,
    status:         0 as const,          // 0 = add only, don't send
    checkDuplicate: 0 as const,
    orders: [{
      num:         `TEST-${Date.now()}`,
      type:        1 as const,
      mode:        1 as const,
      network:     String(networkIdTest),
      fc:          null,
      store:       settings.store_name,
      name:        "Test GestionPro",
      phone:       "0612345678",
      address:     "Adresse Test",
      city:        "Casablanca",
      price:       100,
      refs:        [{ designation: "Produit Test", quantity: 1 }],
      openproduct: 1 as const,
      port:        settings.port,
      note:        "TEST — à supprimer",
    }],
  };

  console.log("📤 DIGYLOG TEST PAYLOAD:", JSON.stringify(testPayload, null, 2));
  const result = await client.createOrders(testPayload);
  console.log("📥 DIGYLOG TEST RESULT:", JSON.stringify(result, null, 2));

  if (!result.ok) {
    return {
      ok:      false,
      message: String((result as { error?: unknown }).error ?? "Erreur inconnue"),
      payload: testPayload,
      response:result.rawResponse,
    };
  }

  const tracking = (((result as { orders?: { tracking?: string }[] }).orders) ?? [])[0]?.tracking ?? null;
  return {
    ok:      true,
    message: tracking
      ? `✓ Commande test créée — Tracking: ${tracking}`
      : `⚠ Digylog a répondu OK mais sans tracking`,
    tracking:  tracking ?? undefined,
    payload:   testPayload,
    response:  result.rawResponse,
  };
}

// ── Sync status ────────────────────────────────────────────────────────────────
export async function syncDigylogStatus(tracking: string) {
  await requireRole([...MANAGER]);
  const client = await createDigylogClientFromDB();
  const infos  = await client.getOrderInfos(tracking);
  if (!infos) return { success: false, error: "Tracking introuvable sur Digylog." };

  const idStatus    = infos.idStatus ?? null;
  const statusLabel = String(infos.status ?? "");

  await applyDigylogStatusUpdate({
    tracking,
    externalStatus: statusLabel,
    idStatus:       idStatus ?? 0,
    motif:          "",
    postponedTo:    null,
    eventTime:      new Date().toISOString(),
    rawPayload:     infos as Record<string, unknown>,
  });

  revalidatePath("/admin/delivery");
  revalidatePath("/admin/delivery/digylog");
  return { success: true, internal: mapDigylogStatus(idStatus, statusLabel).internal };
}

// ── Apply status update (webhook + sync) ──────────────────────────────────────
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

  console.log("DIGYLOG WEBHOOK RECEIVED", {
    tracking, externalStatus, idStatus, motif, eventTime,
  });

  // ── Deduplication via event_hash ──────────────────────────────────────────
  // hash = tracking + idStatus + eventTime (deterministic)
  const { createHash } = await import("crypto");
  const eventHash = createHash("sha256")
    .update(`${tracking}:${idStatus}:${externalStatus}:${eventTime}`)
    .digest("hex");

  const { data: existing } = await supabaseAdmin
    .from("delivery_status_events")
    .select("id")
    .eq("event_hash", eventHash)
    .maybeSingle();

  if (existing) {
    console.log("DIGYLOG DUPLICATE EVENT IGNORED", { tracking, eventHash });
    return;
  }

  // ── Find order ─────────────────────────────────────────────────────────────
  const { data: shipment } = await supabaseAdmin
    .from("delivery_shipments")
    .select("id, order_id")
    .eq("tracking_number", tracking)
    .maybeSingle();

  const shipmentId = (shipment as { id: string; order_id: string } | null)?.id;
  let orderId      = (shipment as { id: string; order_id: string } | null)?.order_id;

  if (!orderId) {
    const { data: ord } = await supabaseAdmin
      .from("orders")
      .select("id, status")
      .eq("delivery_tracking_number", tracking)
      .maybeSingle();
    orderId = (ord as { id: string; status: string } | null)?.id;
  }

  // ── Orphan webhook — tracking not found in our system ─────────────────────
  if (!orderId) {
    // Note: le badge "EC" visible dans l'UI Digylog n'est PAS présent dans le
    // tracking réel — impossible de deviner "c'est un échange" depuis le
    // tracking seul. Tout orphelin doit être vérifié manuellement (échange
    // non encore lié via "Générer échange", ou vraie commande manquante).
    console.warn("DIGYLOG WEBHOOK ORPHAN", { tracking, externalStatus, idStatus });
    await supabaseAdmin.from("orphan_webhooks").upsert({
      tracking_number: tracking,
      raw_payload:      rawPayload,
    } as never, { onConflict: "tracking_number" }).then(() => {}, () => {});
    return;
  }

  // ── Get old status for logs ────────────────────────────────────────────────
  const { data: currentOrder } = await supabaseAdmin
    .from("orders")
    .select("delivery_status, status")
    .eq("id", orderId)
    .maybeSingle();
  const oldStatus = (currentOrder as { delivery_status?: string; status?: string } | null)?.delivery_status ?? "unknown";

  console.log("DIGYLOG STATUS UPDATE", {
    tracking,
    oldStatus,
    newStatus:        externalStatus,
    normalizedStatus: mapped.internal,
    orderStatus:      mapped.orderStatus,
    isPaid:           mapped.isPaid,
    isDelivered:      mapped.isDelivered,
    isReturned:       mapped.isReturned,
  });

  const now = new Date().toISOString();

  // ── Insert event with dedup hash ───────────────────────────────────────────
  await supabaseAdmin.from("delivery_status_events").insert({
    shipment_id:        shipmentId,
    order_id:           orderId,
    tracking_number:    tracking,
    external_status:    externalStatus,
    external_status_id: idStatus,
    internal_status:    mapped.internal,
    normalized_status:  mapped.internal,
    event_hash:         eventHash,
    motif:              motif || null,
    postponed_to:       postponedTo,
    event_time:         eventTime,
    raw_payload:        rawPayload,
  } as never).then(() => {}, () => {});

  // ── Update shipment ────────────────────────────────────────────────────────
  if (shipmentId) {
    await supabaseAdmin.from("delivery_shipments").update({
      external_status:    externalStatus,
      external_status_id: idStatus,
      internal_status:    mapped.internal,
      last_synced_at:     now,
    } as never).eq("id", shipmentId);
  }

  // ── Update order ───────────────────────────────────────────────────────────
  const orderUpdate: Record<string, unknown> = {
    delivery_external_status:    externalStatus,
    delivery_external_status_id: idStatus,
    delivery_status:             mapped.internal,
    delivery_last_sync_at:       now,
    shipment_status:             mapped.internal,
    shipment_status_updated_at:  now,
    status:                      mapped.orderStatus,
    last_webhook_payload:        rawPayload,
  };
  if (mapped.isPaid) {
    orderUpdate.is_paid     = true;
    orderUpdate.paid_at     = eventTime;
  }
  if (mapped.isDelivered && !mapped.isPaid) {
    orderUpdate.delivered_at = eventTime;
  }
  if (mapped.isReturned) {
    orderUpdate.returned_at  = eventTime;
  }
  if (mapped.internal === "refused_delivery") {
    orderUpdate.refused_at = eventTime;
  }

  await supabaseAdmin.from("orders").update(orderUpdate as never).eq("id", orderId);

  // Audit log — fire and forget
  auditStatusChange({
    userId:       null,
    entityType:   "order",
    entityId:     orderId,
    entityLabel:  `Tracking: ${tracking}`,
    oldStatus:    oldStatus,
    newStatus:    mapped.internal,
    sourceModule: "digylog_webhook",
  });
}

// ── Register webhook ──────────────────────────────────────────────────────────
export async function registerDigylogWebhook(storeId?: string) {
  await requireRole(["super_admin","admin"]);
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const webhookUrl = `${appUrl}/api/webhooks/digylog`;

  // createDigylogClientFromDB(undefined) only works if a store has
  // is_default=true — none currently do (verified in DB), so it silently
  // fell back to the legacy digylog_settings.token, which is empty since
  // the multi-store migration. This caused every webhook registration
  // attempt to fail with "Token Digylog manquant" without any visible error
  // reaching the admin (the button just showed a generic failure).
  let resolvedStoreId = storeId;
  if (!resolvedStoreId) {
    const { data: activeStore } = await supabaseAdmin
      .from("delivery_stores")
      .select("id")
      .eq("is_active", true)
      .not("api_token", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    resolvedStoreId = (activeStore as { id: string } | null)?.id;
  }

  const client = await createDigylogClientFromDB(resolvedStoreId);
  if (!client.hasToken()) {
    return { ok: false, error: "Aucun store actif avec un token Digylog trouvé. Vérifiez Paramètres → Transporteurs." };
  }

  const result = await client.registerWebhook(webhookUrl);

  if (result.ok) {
    await supabaseAdmin.from("digylog_settings")
      .update({ webhook_url: webhookUrl } as never)
      .not("id", "is", null);
    if (resolvedStoreId) {
      const { data: storeRow } = await supabaseAdmin
        .from("delivery_stores").select("metadata").eq("id", resolvedStoreId).maybeSingle();
      const existingMeta = (storeRow as { metadata: Record<string, unknown> } | null)?.metadata ?? {};
      await supabaseAdmin.from("delivery_stores")
        .update({ metadata: { ...existingMeta, webhook_url: webhookUrl, webhook_registered_at: new Date().toISOString() } } as never)
        .eq("id", resolvedStoreId);
    }
  }
  return result;
}

// ── Test connection ────────────────────────────────────────────────────────────
export async function testDigylogConnection() {
  await requireRole([...MANAGER]);
  const client = await createDigylogClientFromDB();
  return client.testConnection();
}

// ── Sync reference data ───────────────────────────────────────────────────────
export async function syncDigylogReferenceData() {
  await requireRole([...MANAGER]);
  const client = await createDigylogClientFromDB();

  const [networks, stores, cities, statuses] = await Promise.all([
    client.getNetworks(),
    client.getStores(),
    client.getCities(),
    client.getStatuses(),
  ]);

  await supabaseAdmin.from("digylog_settings").update({
    config: { networks, stores, cities: cities.map((c) => c.name), statuses } as never,
  } as never).not("id", "is", null);

  return { success: true, networks: networks.length, stores: stores.length, cities: cities.length, statuses: statuses.length };
}

// ── Save settings ─────────────────────────────────────────────────────────────
export async function saveDigylogSettings(data: {
  token?:                  string;
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
      referer: process.env.DIGYLOG_REFERER ?? "https://apiseller.digylog.com",
    } as never);
  }

  revalidatePath("/admin/settings/delivery");
  return { success: true };
}

// ── Download label (base64 PDF for client) ────────────────────────────────────
export async function getDigylogLabelUrl(trackings: string[]): Promise<{
  ok: boolean; error?: string; blobBase64?: string;
}> {
  await requireRole([...MANAGER]);
  const client = await createDigylogClientFromDB();
  const result = await client.downloadLabels({ orders: trackings, format: 3 }); // 3 = thermal 100×100
  if (!result.ok || !result.blob) return { ok: false, error: result.error };
  const buf = await result.blob.arrayBuffer();
  return { ok: true, blobBase64: Buffer.from(buf).toString("base64") };
}

// ── Download BL ───────────────────────────────────────────────────────────────
export async function getDigylogBlUrl(blId: number): Promise<{
  ok: boolean; error?: string; blobBase64?: string;
}> {
  await requireRole([...MANAGER]);
  const client = await createDigylogClientFromDB();
  const result = await client.downloadBlPdf(blId);
  if (!result.ok || !result.blob) return { ok: false, error: result.error };
  const buf = await result.blob.arrayBuffer();
  return { ok: true, blobBase64: Buffer.from(buf).toString("base64") };
}

// ── Legacy stubs ──────────────────────────────────────────────────────────────
export async function importInvoices(_from: string, _to: string) {
  return { success: false, error: "Utilisez l'import manuel via le formulaire.", imported: 0 };
}
export async function fetchDeliveryDocument(_type: "delivery"|"pickup"|"return", _date: string) {
  return { success: false as const, error: "Non configuré.", fileUrl: undefined as string|undefined };
}
// reconcileInvoice is now in @/lib/delivery/reconciliation-actions
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
