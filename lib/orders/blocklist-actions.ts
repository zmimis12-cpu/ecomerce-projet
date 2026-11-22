"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { loadBlocklist, saveBlocklist } from "@/lib/orders/blocklist";

const ROLES = ["super_admin", "admin", "manager"] as const;

/** Bloque le client d'une commande (numéro + IP) et annule la commande. */
export async function blockOrderCustomer(orderId: string) {
  await requireRole([...ROLES]);
  const { data: o } = await supabaseAdmin.from("orders")
    .select("order_number, customer_name, customer_phone, ip_hash, status").eq("id", orderId).single();
  const order = o as { order_number: string; customer_name: string | null; customer_phone: string; ip_hash: string | null; status: string } | null;
  if (!order?.customer_phone) return { success: false, error: "Commande introuvable" };
  const entries = (await loadBlocklist()).filter((e) => e.phone !== order.customer_phone);
  entries.unshift({ phone: order.customer_phone, ipHash: order.ip_hash, orderNumber: order.order_number, name: order.customer_name, at: new Date().toISOString() });
  const { error } = await saveBlocklist(entries.slice(0, 2000));
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders/blocklist");
  return { success: true };
}

export async function unblockPhone(phone: string) {
  await requireRole([...ROLES]);
  const { error } = await saveBlocklist((await loadBlocklist()).filter((e) => e.phone !== phone));
  revalidatePath("/admin/orders/blocklist");
  revalidatePath("/admin/orders", "layout");
  return error ? { success: false, error: error.message } : { success: true };
}
