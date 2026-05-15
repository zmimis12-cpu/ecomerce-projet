import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DailyBlClient } from "@/components/delivery-integration/daily-bl-client";

export const metadata: Metadata = { title: "BL du Jour" };
export const dynamic = "force-dynamic";

type DailyBlRow = {
  id: string; provider: string; store_name: string;
  business_date: string; bl_id: number | null;
  total_orders: number; total_trackings: number;
  total_cod: number; payment_status: string;
  generated_at: string | null; created_at: string;
};

// Compute day stats from orders (for days not yet in delivery_daily_bls)
async function getDayStats() {
  // Get from delivery_daily_bls table
  const { data: existing } = await supabaseAdmin
    .from("delivery_daily_bls")
    .select("*")
    .order("business_date", { ascending: false })
    .limit(60);

  // Also compute from orders for dates not yet in daily_bls
  const { data: ordSummary } = await supabaseAdmin
    .from("orders")
    .select("created_at, sent_to_delivery_at, total_amount_mad, delivery_tracking_number, delivery_company_id")
    .in("status", ["sent_to_delivery","in_transit","delivered","paid","returned"])
    .not("delivery_tracking_number", "is", null)
    .order("created_at", { ascending: false })
    .limit(1000);

  // Get default store name from delivery_stores
  const { data: defaultStore } = await supabaseAdmin
    .from("delivery_stores")
    .select("name")
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();
  // Fallback to digylog_settings if no delivery_stores configured
  const { data: dgSettings } = await supabaseAdmin
    .from("digylog_settings")
    .select("default_store_name")
    .limit(1)
    .maybeSingle();
  const storeName = (defaultStore as { name?: string } | null)?.name
    ?? (dgSettings as { default_store_name?: string } | null)?.default_store_name
    ?? "Default";

  type OrdRow = { created_at: string; sent_to_delivery_at?: string; total_amount_mad: number; delivery_tracking_number: string };
  const orders = (ordSummary ?? []) as OrdRow[];

  // Group by date
  const dateMap = new Map<string, { orders: number; trackings: number; cod: number }>();
  for (const o of orders) {
    const day = ((o as unknown as { sent_to_delivery_at?: string }).sent_to_delivery_at ?? o.created_at).slice(0, 10);
    if (!dateMap.has(day)) dateMap.set(day, { orders: 0, trackings: 0, cod: 0 });
    const entry = dateMap.get(day)!;
    entry.orders++;
    if (o.delivery_tracking_number) entry.trackings++;
    entry.cod += o.total_amount_mad || 0;
  }

  // Merge: existing daily_bls take priority
  const existingDates = new Set((existing ?? []).map((r) => (r as { business_date: string }).business_date));
  const computedRows: DailyBlRow[] = [];

  for (const [date, stats] of [...dateMap.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
    if (existingDates.has(date)) continue; // covered by delivery_daily_bls
    computedRows.push({
      id:             `computed_${date}`,
      provider:       "digylog",
      store_name:     storeName,
      business_date:  date,
      bl_id:          null,
      total_orders:   stats.orders,
      total_trackings:stats.trackings,
      total_cod:      stats.cod,
      payment_status: "unpaid",
      generated_at:   null,
      created_at:     date + "T00:00:00",
    });
  }

  const allRows: DailyBlRow[] = [
    ...(existing ?? []) as DailyBlRow[],
    ...computedRows,
  ].sort((a, b) => b.business_date.localeCompare(a.business_date));

  return { rows: allRows, storeName };
}

export default async function DocumentsPage() {
  await requireRole(["super_admin","admin","manager"]);
  const { rows, storeName } = await getDayStats();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bons de Livraison — par jour</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Un BL par jour. Cliquez Télécharger BL du jour pour grouper toutes les commandes en 1 BL Digylog.
        </p>
      </div>
      <DailyBlClient rows={rows} defaultStoreName={storeName} />
    </div>
  );
}
