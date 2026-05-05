import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DigylogOrdersClient } from "@/components/delivery-integration/digylog-orders-client";
import { INTERNAL_STATUS_LABELS } from "@/lib/delivery/digylog/status-map";

export const metadata: Metadata = { title: "Commandes Digylog" };
export const dynamic = "force-dynamic";

export default async function DigylogOrdersPage() {
  await requireRole(["super_admin","admin","manager"]);

  // All orders that have been sent to Digylog
  const { data: shipments } = await supabaseAdmin
    .from("delivery_shipments")
    .select(`
      id, tracking_number, external_order_id, external_status, external_status_id,
      internal_status, bl_id, last_synced_at, created_at,
      orders (
        id, order_number, customer_name, customer_phone, customer_city,
        total_amount_mad, status, is_paid, delivery_external_status
      )
    `)
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    tracking_number: string | null;
    external_order_id: string | null;
    external_status: string | null;
    external_status_id: number | null;
    internal_status: string | null;
    bl_id: number | null;
    last_synced_at: string | null;
    created_at: string;
    orders: {
      id: string; order_number: string; customer_name: string;
      customer_phone: string; customer_city: string;
      total_amount_mad: number; status: string;
      is_paid: boolean; delivery_external_status: string | null;
    } | null;
  };

  const rows = (shipments ?? []) as Row[];

  // Stats
  const total      = rows.length;
  const inTransit  = rows.filter((r) => r.internal_status === "in_transit").length;
  const delivered  = rows.filter((r) => ["delivered","paid"].includes(r.internal_status ?? "")).length;
  const returned   = rows.filter((r) => r.internal_status === "returned").length;
  const hasBl      = rows.filter((r) => r.bl_id).length;

  const statusLabels = INTERNAL_STATUS_LABELS;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Commandes Digylog</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Toutes les commandes envoyées à Digylog — tickets et BL.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label:"Total envoyés",  value:total,      cls:"" },
          { label:"En transit",     value:inTransit,  cls:"text-blue-700" },
          { label:"Livrés",         value:delivered,  cls:"text-green-700" },
          { label:"Retours",        value:returned,   cls:"text-red-600" },
          { label:"Avec BL",        value:hasBl,      cls:"text-violet-700" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <DigylogOrdersClient rows={rows} statusLabels={statusLabels} />
    </div>
  );
}
