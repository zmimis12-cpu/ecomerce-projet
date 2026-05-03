"use server";
/**
 * lib/delivery/actions.ts
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { syncOrderToGoogleSheets } from "@/lib/automation/sync-engine";
import type { DeliveryStatus } from "@/types/delivery";

const MANAGER_ROLES = ["super_admin", "admin", "manager"] as const;

// ─── Send to delivery ──────────────────────────────────────────────────────────
export async function sendToDelivery(data: {
  orderId: string;
  trackingNumber?: string;
  deliveryCompany?: string;
  deliveryCostReal?: number;
}) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();

  // Verify order is confirmed
  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", data.orderId)
    .single();

  const o = order as { id: string; status: string } | null;
  if (!o) return { success: false, error: "Commande introuvable." };
  if (!["confirmed", "new", "processing"].includes(o.status)) {
    return { success: false, error: `Statut actuel "${o.status}" ne permet pas l'envoi.` };
  }

  const { error } = await supabase
    .from("orders")
    .update({
      status:                  "sent_to_delivery",
      delivery_status:         "sent_to_delivery",
      delivery_tracking_number: data.trackingNumber || null,
      delivery_company:        data.deliveryCompany || null,
      delivery_cost_real_mad:  data.deliveryCostReal ?? 0,
      sent_to_delivery_at:     new Date().toISOString(),
    } as never)
    .eq("id", data.orderId);

  if (error) return { success: false, error: error.message };

  await logStatusChange(data.orderId, o.status, "sent_to_delivery", "Envoyé en livraison");
  revalidatePath("/admin/delivery");
  revalidatePath(`/admin/delivery/${data.orderId}`);
  revalidatePath(`/admin/orders/${data.orderId}`);
  return { success: true };
}

// ─── Update delivery status ────────────────────────────────────────────────────
export async function updateDeliveryStatus(data: {
  orderId: string;
  deliveryStatus: DeliveryStatus;
  trackingNumber?: string;
  notes?: string;
}) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("orders")
    .select("status, delivery_status")
    .eq("id", data.orderId)
    .single();
  const c = current as { status: string; delivery_status: string | null } | null;

  const updatePayload: Record<string, unknown> = {
    delivery_status: data.deliveryStatus,
    status:          data.deliveryStatus,  // keep order status in sync
  };

  if (data.trackingNumber) {
    updatePayload.delivery_tracking_number = data.trackingNumber;
  }
  if (data.deliveryStatus === "delivered") {
    updatePayload.delivered_at = new Date().toISOString();
  }
  if (data.deliveryStatus === "returned") {
    updatePayload.returned_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("orders")
    .update(updatePayload as never)
    .eq("id", data.orderId);

  if (error) return { success: false, error: error.message };

  await logStatusChange(data.orderId, c?.status ?? null, data.deliveryStatus, data.notes);
  revalidatePath("/admin/delivery");
  revalidatePath(`/admin/delivery/${data.orderId}`);
  revalidatePath(`/admin/orders/${data.orderId}`);
  return { success: true };
}

// ─── Mark as paid (triggers real profit calculation) ──────────────────────────
export async function markAsPaid(orderId: string) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("status, delivery_status")
    .eq("id", orderId)
    .single();

  const o = order as { status: string; delivery_status: string | null } | null;

  // Update — trigger compute_real_profit fires automatically
  const { error } = await supabase
    .from("orders")
    .update({
      is_paid:  true,
      paid_at:  new Date().toISOString(),
      status:   "paid",
      delivery_status: "delivered",
      payment_status: "paid",
    } as never)
    .eq("id", orderId);

  if (error) return { success: false, error: error.message };

  await logStatusChange(orderId, o?.status ?? null, "paid", "COD encaissé");
  revalidatePath("/admin/delivery");
  revalidatePath(`/admin/delivery/${orderId}`);
  revalidatePath(`/admin/orders/${orderId}`);

  // Trigger sync to "Delivered Paid" sheet (non-blocking)
  syncOrderToGoogleSheets(orderId, "delivered_paid").catch(console.error);

  return { success: true };
}

// ─── Update tracking number ────────────────────────────────────────────────────
export async function updateDeliveryTracking(data: {
  orderId: string;
  trackingNumber: string;
  deliveryCompany: string;
  deliveryCostReal: number;
}) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("orders")
    .update({
      delivery_tracking_number: data.trackingNumber || null,
      delivery_company:         data.deliveryCompany || null,
      delivery_cost_real_mad:   data.deliveryCostReal,
    } as never)
    .eq("id", data.orderId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/admin/delivery/${data.orderId}`);
  return { success: true };
}

// ─── Set return cost ───────────────────────────────────────────────────────────
export async function setReturnCost(orderId: string, returnCost: number) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("orders")
    .update({ return_cost_mad: returnCost } as never)
    .eq("id", orderId);

  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/delivery/${orderId}`);
  return { success: true };
}

// ─── Internal helper ───────────────────────────────────────────────────────────
async function logStatusChange(orderId: string, from: string | null, to: string, notes?: string) {
  const supabase = await createClient();
  await supabase.from("order_status_history").insert({
    order_id:    orderId,
    from_status: from,
    to_status:   to,
    notes:       notes ?? null,
  } as never);
}
