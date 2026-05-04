"use server";
/**
 * lib/delivery/shipment-actions.ts
 * Server actions for delivery operations.
 * API keys never leave the server.
 */
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { getDefaultProvider } from "./index";
import { mapStatus } from "./status-map";

const MANAGER_ROLES = ["super_admin","admin","manager"] as const;

// ── Send order to delivery company ────────────────────────────────────────────
export async function sendToDelivery(orderId: string) {
  await requireRole([...MANAGER_ROLES]);

  // Fetch full order
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .select("id,order_number,customer_name,customer_phone,customer_city,customer_address,total_amount_mad,notes,status")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) return { success: false, error: "Commande introuvable." };

  const o = order as {
    id: string; order_number: string; customer_name: string;
    customer_phone: string; customer_city: string; customer_address: string;
    total_amount_mad: number; notes: string | null; status: string;
  };

  if (!["confirmed"].includes(o.status)) {
    return { success: false, error: "Seules les commandes confirmées peuvent être envoyées." };
  }

  // Get provider
  const providerCtx = await getDefaultProvider();
  if (!providerCtx) {
    return { success: false, error: "Aucun transporteur configuré. Ajoutez une clé API dans Paramètres." };
  }

  // Create shipment via API
  const result = await providerCtx.provider.createShipment({
    orderId:        o.id,
    orderNumber:    o.order_number,
    customerName:   o.customer_name,
    customerPhone:  o.customer_phone,
    customerCity:   o.customer_city,
    customerAddress:o.customer_address,
    codAmount:      o.total_amount_mad,
    notes:          o.notes ?? undefined,
  });

  if (!result.success) {
    return { success: false, error: result.error ?? "Erreur API transporteur." };
  }

  // Save shipment record
  await supabaseAdmin.from("delivery_shipments").insert({
    order_id:           orderId,
    delivery_company_id:providerCtx.companyId,
    tracking_number:    result.trackingNumber,
    external_order_id:  result.externalOrderId,
    external_status:    "colis reçu",
    internal_status:    "picked_up",
    raw_payload:        result.rawPayload ?? {},
  } as never);

  // Update order
  await supabaseAdmin.from("orders").update({
    status:                   "sent_to_delivery",
    delivery_tracking_number: result.trackingNumber,
    delivery_company_id:      providerCtx.companyId,
    external_delivery_id:     result.externalOrderId,
    delivery_external_status: "colis reçu",
    delivery_status:          "sent_to_delivery",
    sent_to_delivery_at:      new Date().toISOString(),
  } as never).eq("id", orderId);

  revalidatePath("/admin/delivery");
  revalidatePath("/admin/orders");
  return { success: true, trackingNumber: result.trackingNumber };
}

// ── Sync shipment status ───────────────────────────────────────────────────────
export async function syncShipmentStatus(trackingNumber: string) {
  await requireRole([...MANAGER_ROLES]);

  const providerCtx = await getDefaultProvider();
  if (!providerCtx) return { success: false, error: "Aucun transporteur configuré." };

  const event = await providerCtx.provider.getShipmentStatus(trackingNumber);
  if (!event) return { success: false, error: "Statut introuvable." };

  await applyStatusUpdate(trackingNumber, event.externalStatus, event.rawPayload, event.eventTime);
  revalidatePath("/admin/delivery");
  return { success: true, status: event.internalStatus };
}

// ── Import invoices from API ───────────────────────────────────────────────────
export async function importInvoices(from: string, to: string) {
  await requireRole(["super_admin","admin","manager","finance"]);

  const providerCtx = await getDefaultProvider();
  if (!providerCtx) return { success: false, error: "Aucun transporteur configuré." };

  const invoices = await providerCtx.provider.getInvoices({ from, to });
  if (!invoices.length) return { success: true, imported: 0 };

  let imported = 0;
  for (const inv of invoices) {
    const { error } = await supabaseAdmin.from("delivery_invoices").upsert({
      delivery_company_id: providerCtx.companyId,
      invoice_number:      inv.invoiceNumber,
      invoice_date:        inv.invoiceDate,
      total_amount_mad:    inv.totalAmount,
      status:              "imported",
      raw_payload:         inv as never,
    } as never, { onConflict: "invoice_number" });
    if (!error) imported++;
  }

  revalidatePath("/admin/delivery/invoices");
  return { success: true, imported };
}

// ── Reconcile invoice ─────────────────────────────────────────────────────────
export async function reconcileInvoice(invoiceId: string) {
  await requireRole(["super_admin","admin","manager","finance"]);

  // Get invoice
  const { data: invoice } = await supabaseAdmin
    .from("delivery_invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (!invoice) return { success: false, error: "Facture introuvable." };

  const inv = invoice as { id: string; delivery_company_id: string; invoice_number: string };

  // Fetch details from API
  const providerCtx = await getDefaultProvider();
  if (!providerCtx) return { success: false, error: "Aucun transporteur configuré." };

  const details = await providerCtx.provider.getInvoiceDetails(inv.invoice_number);
  if (!details) return { success: false, error: "Impossible de récupérer les détails." };

  let matched = 0, missing = 0, mismatched = 0;
  let amountExpected = 0, amountPaid = 0;

  for (const item of details.items) {
    // Find order by tracking number
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,total_amount_mad,status,is_paid")
      .eq("delivery_tracking_number", item.trackingNumber)
      .maybeSingle();

    let matchedStatus = "mismatched";
    let mismatchReason: string | null = null;

    if (!order) {
      matchedStatus  = "mismatched";
      mismatchReason = "tracking_not_found";
      missing++;
    } else {
      const o = order as { id: string; total_amount_mad: number; status: string; is_paid: boolean };
      amountExpected += o.total_amount_mad;
      amountPaid     += item.amountPaid;

      const amountDiff = Math.abs(o.total_amount_mad - item.amountPaid);
      const statusOk   = mapStatus(item.status).isDelivered;

      if (amountDiff > 1) {
        mismatchReason = "amount_difference";
        mismatched++;
      } else if (!statusOk && o.status !== "returned") {
        mismatchReason = "status_difference";
        mismatched++;
      } else {
        matchedStatus = "matched";
        matched++;

        // Mark order as paid if invoice says delivered+paid
        if (mapStatus(item.status).isPaid && !o.is_paid) {
          await supabaseAdmin.from("orders").update({
            is_paid:                  true,
            paid_at:                  new Date().toISOString(),
            payment_proof_invoice_id: invoiceId,
            status:                   "paid",
          } as never).eq("id", o.id);
        }
      }

      // Save invoice item
      await supabaseAdmin.from("delivery_invoice_items").upsert({
        invoice_id:      invoiceId,
        order_id:        o.id,
        tracking_number: item.trackingNumber,
        cod_amount_mad:  item.codAmount,
        delivery_fee_mad:item.deliveryFee,
        return_fee_mad:  item.returnFee,
        amount_paid_mad: item.amountPaid,
        invoice_status:  item.status,
        matched_status:  matchedStatus,
        mismatch_reason: mismatchReason,
        raw_payload:     item as never,
      } as never, { onConflict: "invoice_id,tracking_number" });
    }
  }

  const diff = amountExpected - amountPaid;
  const logStatus = mismatched > 0 || missing > 0 ? "discrepancy" : "ok";

  await supabaseAdmin.from("delivery_reconciliation_logs").insert({
    invoice_id:          invoiceId,
    total_orders:        details.items.length,
    matched_orders:      matched,
    missing_orders:      missing,
    amount_expected_mad: amountExpected,
    amount_paid_mad:     amountPaid,
    difference_mad:      diff,
    status:              logStatus,
    details:             { mismatched } as never,
  } as never);

  // Update invoice status
  await supabaseAdmin.from("delivery_invoices").update({
    status:         logStatus === "ok" ? "reconciled" : "disputed",
    paid_amount_mad:amountPaid,
    raw_payload:    details as never,
  } as never).eq("id", invoiceId);

  revalidatePath("/admin/delivery/invoices");
  return { success: true, matched, missing, mismatched, diff };
}

// ── Fetch document ─────────────────────────────────────────────────────────────
export async function fetchDeliveryDocument(
  type: "delivery" | "pickup" | "return",
  date: string
) {
  await requireRole([...MANAGER_ROLES]);

  const providerCtx = await getDefaultProvider();
  if (!providerCtx) return { success: false, error: "Aucun transporteur configuré." };

  const result = type === "delivery"
    ? await providerCtx.provider.getDeliveryBon(date)
    : type === "pickup"
    ? await providerCtx.provider.getPickupBon(date)
    : await providerCtx.provider.getReturnBon(date);

  if (!result.success) return result;

  const docType = type === "delivery" ? "bon_livraison"
    : type === "pickup" ? "bon_ramassage" : "bon_retour";

  await supabaseAdmin.from("delivery_documents").insert({
    delivery_company_id: providerCtx.companyId,
    document_type:       docType,
    document_date:       date,
    file_url:            result.fileUrl,
    external_id:         result.externalId,
    raw_payload:         result.rawPayload ?? {},
  } as never);

  revalidatePath("/admin/delivery/documents");
  return result;
}

// ── Save delivery company settings ────────────────────────────────────────────
export async function saveDeliverySettings(data: {
  id?: string;
  name: string;
  slug: string;
  api_base_url: string;
  api_key_encrypted: string;
  webhook_secret: string;
  is_active: boolean;
}) {
  await requireRole(["super_admin","admin"]);
  const supabase = await createClient();

  if (data.id) {
    await supabase.from("delivery_companies").update(data as never).eq("id", data.id);
  } else {
    await supabase.from("delivery_companies").insert(data as never);
  }
  revalidatePath("/admin/settings/delivery");
  return { success: true };
}

// ── Internal: apply status update ─────────────────────────────────────────────
export async function applyStatusUpdate(
  trackingNumber: string,
  externalStatus: string,
  rawPayload: Record<string, unknown>,
  eventTime?: string
) {
  const mapped = mapStatus(externalStatus);

  // Find shipment
  const { data: shipment } = await supabaseAdmin
    .from("delivery_shipments")
    .select("id,order_id")
    .eq("tracking_number", trackingNumber)
    .maybeSingle();

  const shipmentId = (shipment as { id: string; order_id: string } | null)?.id;
  const orderId    = (shipment as { id: string; order_id: string } | null)?.order_id;

  // Also try finding order directly by tracking
  const targetOrderId = orderId ?? await (async () => {
    const { data } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("delivery_tracking_number", trackingNumber)
      .maybeSingle();
    return (data as { id: string } | null)?.id;
  })();

  if (!targetOrderId) return;

  const now = new Date().toISOString();

  // Log event
  await supabaseAdmin.from("delivery_status_events").insert({
    shipment_id:     shipmentId,
    order_id:        targetOrderId,
    tracking_number: trackingNumber,
    external_status: externalStatus,
    internal_status: mapped.internal,
    event_time:      eventTime ?? now,
    raw_payload:     rawPayload,
  } as never);

  // Update shipment
  if (shipmentId) {
    await supabaseAdmin.from("delivery_shipments").update({
      external_status: externalStatus,
      internal_status: mapped.internal,
      last_synced_at:  now,
    } as never).eq("id", shipmentId);
  }

  // Update order
  const orderUpdate: Record<string, unknown> = {
    delivery_external_status: externalStatus,
    delivery_last_sync_at:    now,
  };

  if (mapped.orderStatus) orderUpdate.status = mapped.orderStatus;
  if (mapped.isPaid) {
    orderUpdate.is_paid  = true;
    orderUpdate.paid_at  = eventTime ?? now;
    orderUpdate.status   = "paid";
  }
  if (mapped.isDelivered && !mapped.isPaid) {
    orderUpdate.delivered_at = eventTime ?? now;
  }
  if (mapped.isReturned) {
    orderUpdate.returned_at = eventTime ?? now;
  }

  await supabaseAdmin.from("orders").update(orderUpdate as never).eq("id", targetOrderId);
}
