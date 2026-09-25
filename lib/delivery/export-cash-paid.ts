"use server";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getExpectedDeliveryCost } from "@/lib/delivery/reconciliation-utils";

const MANAGER_ROLES = ["super_admin", "admin", "manager"] as const;

/**
 * Génère un export au format EXACT du rapport "Cash Paid" de Digylog —
 * un tableau JSON de 21 colonnes par ligne, sans en-têtes, même structure
 * que leur vrai export (voir reconciliation-utils.ts pour le détail du
 * format, confirmé sur un fichier réel).
 *
 * Utile pour produire un fichier compatible avec des outils externes qui
 * attendent ce format précis, à partir des vraies données de ta commande.
 */
export async function exportCashPaidFormat(dateFrom: string, dateTo: string): Promise<{
  success: boolean; base64?: string; error?: string; count?: number;
}> {
  await requireRole([...MANAGER_ROLES]);

  const { data: orders, error } = await supabaseAdmin
    .from("orders")
    .select("order_number, customer_name, customer_phone, customer_city, delivery_tracking_number, total_amount_mad, is_paid, status, created_at, actual_cod_collected_mad")
    .eq("is_paid", true)
    .not("delivery_tracking_number", "is", null)
    .gte("created_at", dateFrom)
    .lte("created_at", dateTo + "T23:59:59");

  if (error) return { success: false, error: error.message };

  const rows = (orders ?? []) as {
    order_number: string; customer_name: string; customer_phone: string;
    customer_city: string | null; delivery_tracking_number: string;
    total_amount_mad: number; is_paid: boolean; status: string;
    created_at: string; actual_cod_collected_mad: number | null;
  }[];

  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const jsonRows = rows.map((o) => {
    const codAmount   = o.actual_cod_collected_mad ?? o.total_amount_mad;
    const deliveryFee = getExpectedDeliveryCost(o.customer_city ?? "");
    const net         = Math.round((codAmount - deliveryFee) * 100) / 100;
    const orderDate   = new Date(o.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

    // Colonnes dans le MÊME ORDRE exact que le vrai fichier Digylog —
    // col 0 (n° facture Digylog) laissée vide: c'est un identifiant interne
    // à Digylog qu'on ne génère pas nous-mêmes, pas de valeur inventée.
    return [
      "",
      today,
      orderDate,
      "HajtekZone",
      o.delivery_tracking_number,
      o.order_number,
      codAmount.toFixed(2),
      o.customer_city ?? "",
      o.customer_name,
      o.customer_phone,
      "-",
      "-",
      "Livraison",
      "1",
      deliveryFee.toFixed(2),
      deliveryFee.toFixed(2),
      "Port dû",
      deliveryFee.toFixed(2),
      codAmount.toFixed(2),
      net,
      "Versés",
    ];
  });

  const jsonText = JSON.stringify(jsonRows);
  const base64 = Buffer.from(jsonText, "utf-8").toString("base64");

  return { success: true, base64, count: jsonRows.length };
}
