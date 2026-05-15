"use server";
/**
 * lib/delivery/daily-bl-actions.ts
 * Daily BL logic — completely separate from ticket batch groups.
 *
 * One row per day/provider/store in delivery_daily_bls.
 * Tickets groups (delivery_batches) are untouched.
 *
 * Flow:
 * 1. Sync orders → trackings saved on orders table (no change to this)
 * 2. Admin clicks "Télécharger BL du jour"
 *    → collect ALL tracking numbers for that day/store
 *    → call PUT /orders/send ONCE
 *    → receive bl_id
 *    → save in delivery_daily_bls
 *    → download GET /bl/:id/pdf
 *    → return PDF blob
 * 3. If bl_id already exists → download directly
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { getDeliveryClient } from "@/lib/delivery/client-factory";
import { revalidatePath } from "next/cache";

const MANAGER = ["super_admin","admin","manager"] as const;

// ── Get all daily BL rows ─────────────────────────────────────────────────────
export async function getDailyBls(limit = 60): Promise<{
  id: string;
  provider: string;
  store_name: string;
  business_date: string;
  bl_id: number | null;
  total_orders: number;
  total_trackings: number;
  total_cod: number;
  payment_status: string;
  generated_at: string | null;
  created_at: string;
}[]> {
  const { data } = await supabaseAdmin
    .from("delivery_daily_bls")
    .select("*")
    .order("business_date", { ascending: false })
    .limit(limit);
  return (data ?? []) as ReturnType<typeof getDailyBls> extends Promise<infer T> ? T : never;
}

// ── Refresh daily BL stats from orders ───────────────────────────────────────
async function refreshDailyBlStats(
  provider: string,
  storeName: string,
  businessDate: string,
  dailyBlId?: string
) {
  const dateStart = `${businessDate}T00:00:00`;
  const dateEnd   = `${businessDate}T23:59:59`;

  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("id, total_amount_mad, delivery_tracking_number")
    .eq("status", "sent_to_delivery")
    .eq("delivery_company_id", (await supabaseAdmin
      .from("delivery_companies").select("id").eq("slug", provider).maybeSingle()
      .then((r) => (r.data as { id: string } | null)?.id ?? "")) as string)
    .gte("created_at", dateStart)
    .lt("created_at", dateEnd)
    .not("delivery_tracking_number", "is", null);

  type O = { id: string; total_amount_mad: number; delivery_tracking_number: string };
  const rows = (orders ?? []) as O[];

  const totalOrders    = rows.length;
  const totalTrackings = rows.filter((r) => r.delivery_tracking_number).length;
  const totalCod       = rows.reduce((s, r) => s + (r.total_amount_mad || 0), 0);

  if (dailyBlId) {
    await supabaseAdmin.from("delivery_daily_bls")
      .update({ total_orders: totalOrders, total_trackings: totalTrackings, total_cod: totalCod } as never)
      .eq("id", dailyBlId);
  }

  return { totalOrders, totalTrackings, totalCod, rows };
}

// ── Main action: generate or download daily BL ───────────────────────────────
export async function generateOrDownloadDailyBl(params: {
  provider:      string;
  storeName:     string;
  businessDate:  string;
  forceRegenerate?: boolean;
}): Promise<{
  ok: boolean;
  blobBase64?: string;
  blId?: number;
  totalTrackings?: number;
  error?: string;
}> {
  await requireRole([...MANAGER]);
  const { provider, storeName, businessDate, forceRegenerate } = params;

  // Find or create daily BL record
  const { data: dailyBl } = await supabaseAdmin
    .from("delivery_daily_bls")
    .select("*")
    .eq("provider", provider)
    .eq("store_name", storeName)
    .eq("business_date", businessDate)
    .maybeSingle();

  type DailyBlRow = {
    id: string; bl_id: number | null;
    total_orders: number; total_trackings: number; total_cod: number;
    payment_status: string;
  };

  let blRow = dailyBl as DailyBlRow | null;

  // If BL already generated and not forcing regeneration → download directly
  if (blRow?.bl_id && !forceRegenerate) {
    const client = await getDeliveryClient();
    const result = await client.downloadBlPdf(blRow.bl_id);
    if (!result.ok || !result.blob) {
      return { ok: false, error: result.error ?? "Erreur téléchargement BL." };
    }
    const buf = await result.blob.arrayBuffer();
    return {
      ok: true,
      blobBase64: Buffer.from(buf).toString("base64"),
      blId: blRow.bl_id,
      totalTrackings: blRow.total_trackings,
    };
  }

  // Collect ALL tracking numbers for this day/store
  const dateStart = `${businessDate}T00:00:00`;
  const dateEnd   = `${businessDate}T23:59:59`;

  // Get provider company id
  const { data: dcData } = await supabaseAdmin
    .from("delivery_companies")
    .select("id")
    .eq("slug", provider)
    .maybeSingle();
  const companyId = (dcData as { id: string } | null)?.id;

  // Get all orders for this day with trackings
  let query = supabaseAdmin
    .from("orders")
    .select("id, total_amount_mad, delivery_tracking_number")
    .gte("sent_to_delivery_at", dateStart)
    .lt("sent_to_delivery_at", dateEnd)
    .not("delivery_tracking_number", "is", null);

  if (companyId) query = query.eq("delivery_company_id", companyId);

  const { data: ordRows } = await query;
  type ORow = { id: string; total_amount_mad: number; delivery_tracking_number: string };
  const orderRows = (ordRows ?? []) as ORow[];

  // Fallback: use created_at if sent_to_delivery_at is missing
  if (!orderRows.length) {
    const { data: fallback } = await supabaseAdmin
      .from("orders")
      .select("id, total_amount_mad, delivery_tracking_number")
      .in("status", ["sent_to_delivery", "in_transit", "delivered", "paid"])
      .gte("created_at", dateStart)
      .lt("created_at", dateEnd)
      .not("delivery_tracking_number", "is", null);
    orderRows.push(...((fallback ?? []) as ORow[]));
  }

  const trackings  = [...new Set(orderRows.map((r) => r.delivery_tracking_number))];
  const totalCod   = orderRows.reduce((s, r) => s + (r.total_amount_mad || 0), 0);

  if (!trackings.length) {
    return { ok: false, error: `Aucun tracking trouvé pour le ${businessDate}.` };
  }

  console.log(`[daily-bl] ${businessDate} — sending ${trackings.length} trackings to Digylog PUT /orders/send`);

  // Call PUT /orders/send ONCE with ALL trackings
  const client = await getDeliveryClient();
  const sendRes = await client.sendOrders(trackings);

  if (!sendRes.ok || !sendRes.bl) {
    return { ok: false, error: sendRes.error ?? "Digylog n'a pas retourné de BL." };
  }

  const blId = sendRes.bl;
  console.log(`[daily-bl] Got BL #${blId} for ${trackings.length} trackings`);

  // Upsert daily BL record
  if (blRow?.id) {
    await supabaseAdmin.from("delivery_daily_bls").update({
      bl_id:           blId,
      total_orders:    orderRows.length,
      total_trackings: trackings.length,
      total_cod:       totalCod,
      generated_at:    new Date().toISOString(),
    } as never).eq("id", blRow.id);
  } else {
    const { data: inserted } = await supabaseAdmin.from("delivery_daily_bls").insert({
      provider,
      store_name:      storeName,
      business_date:   businessDate,
      bl_id:           blId,
      total_orders:    orderRows.length,
      total_trackings: trackings.length,
      total_cod:       totalCod,
      generated_at:    new Date().toISOString(),
    } as never).select("id").single();
    blRow = inserted as unknown as DailyBlRow;
  }

  // Update all orders with the daily bl_id
  await supabaseAdmin.from("orders")
    .update({ bl_id: blId } as never)
    .in("id", orderRows.map((r) => r.id));

  // Download the BL PDF immediately
  const dlRes = await client.downloadBlPdf(blId);
  if (!dlRes.ok || !dlRes.blob) {
    // BL was generated but download failed — return bl_id so user can retry
    return { ok: false, blId, error: dlRes.error ?? "BL généré mais téléchargement échoué. Réessayez." };
  }

  revalidatePath("/admin/delivery/documents");

  const buf = await dlRes.blob.arrayBuffer();
  return {
    ok: true,
    blobBase64: Buffer.from(buf).toString("base64"),
    blId,
    totalTrackings: trackings.length,
  };
}

// ── Mark daily BL as paid ─────────────────────────────────────────────────────
export async function markDailyBlPaid(id: string) {
  await requireRole([...MANAGER]);
  await supabaseAdmin.from("delivery_daily_bls")
    .update({ payment_status: "paid" } as never)
    .eq("id", id);
  revalidatePath("/admin/delivery/documents");
  return { ok: true };
}
