"use server";
import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";

const ROLES = ["super_admin", "admin", "manager", "call_center_agent"] as const;

export async function setAbandonedStatus(id: string, status: "called" | "not_interested" | "pending") {
  const session = await requireRole([...ROLES]);
  const { error } = await supabaseAdmin.from("abandoned_carts" as never)
    .update({ status, handled_by: session.authId, handled_at: new Date().toISOString() } as never).eq("id", id);
  revalidatePath("/admin/orders/abandoned");
  return error ? { success: false, error: error.message } : { success: true };
}

/** Le client a dit oui → crée la vraie commande avec EXACTEMENT les mêmes règles que la landing page
 *  (prix de l'offre, upsells, coût, agent, code pub, Lead Meta côté serveur). */
export async function convertAbandonedCart(id: string): Promise<{ success: boolean; error?: string; orderNumber?: string }> {
  await requireRole([...ROLES]);
  const { data } = await supabaseAdmin.from("abandoned_carts" as never)
    .select("id, product_id, customer_name, customer_phone, customer_city, quantity, status, payload").eq("id", id).maybeSingle();
  const c = data as { id: string; product_id: string | null; customer_name: string | null; customer_phone: string; customer_city: string | null; quantity: number | null; status: string; payload: Record<string, unknown> | null } | null;
  if (!c) return { success: false, error: "Panier introuvable" };
  if (c.status === "converted") return { success: false, error: "Déjà transformé en commande" };
  if (!c.product_id) return { success: false, error: "Produit inconnu" };
  if (!c.customer_city) return { success: false, error: "Ville manquante — crée la commande manuellement" };
  const p = c.payload ?? {};
  const body = {
    ...p,
    customer_name: c.customer_name || "زبون",
    customer_phone: c.customer_phone,
    customer_city: c.customer_city,
    customer_address: typeof p.customer_address === "string" && p.customer_address.trim() ? p.customer_address : "سيتم تأكيد العنوان عبر الهاتف",
    quantity: c.quantity ?? 1,
    product_id: c.product_id,
    notes: "🛒 Panier abandonné récupéré par appel",
    website: "",
  };
  const { POST } = await import("@/app/api/public/orders/route");
  const req = new NextRequest("https://internal/api/public/orders", {
    method: "POST",
    // IP propre à ce panier → pas de blocage anti-spam quand l'agent en récupère plusieurs
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, "user-agent": "GestionPro abandoned-cart" },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  const out = await res.json() as { success: boolean; orderNumber?: string; error?: string; errors?: Record<string, string> };
  if (!out.success) return { success: false, error: out.error ?? Object.values(out.errors ?? {}).join(" · ") ?? "Erreur" };
  revalidatePath("/admin/orders/abandoned");
  return { success: true, orderNumber: out.orderNumber };
}
