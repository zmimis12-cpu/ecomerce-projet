import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CheckCircle, AlertTriangle, HelpCircle } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ReconcileButton } from "@/components/delivery-integration/reconcile-button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Détail Facture" };
export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(["super_admin","admin","manager","finance"]);
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("delivery_invoices")
    .select("*")
    .eq("id", id)
    .single();
  if (!invoice) notFound();

  const { data: items } = await supabase
    .from("delivery_invoice_items")
    .select("*, orders(order_number,customer_name,status)")
    .eq("invoice_id", id)
    .order("matched_status");

  const { data: recoLog } = await supabase
    .from("delivery_reconciliation_logs")
    .select("*")
    .eq("invoice_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  type InvItem = {
    id: string; tracking_number: string; cod_amount_mad: number;
    delivery_fee_mad: number; amount_paid_mad: number; invoice_status: string;
    matched_status: string; mismatch_reason: string | null;
    orders: { order_number: string; customer_name: string; status: string } | null;
  };

  const inv  = invoice as Record<string, unknown>;
  const rows = (items ?? []) as InvItem[];
  const reco = recoLog as Record<string, unknown> | null;

  function mad(n: number | null | undefined) {
    return (Number(n) || 0).toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " MAD";
  }

  const matchBadge = {
    matched:    { label:"OK",             icon:CheckCircle,  cls:"bg-green-100 text-green-800" },
    mismatched: { label:"Écart",          icon:AlertTriangle,cls:"bg-red-100 text-red-800" },
    pending:    { label:"En attente",     icon:HelpCircle,   cls:"bg-gray-100 text-gray-600" },
  } as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/delivery/invoices"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Factures
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">{String(inv.invoice_number)}</span>
      </div>

      {/* Summary */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold">Facture {String(inv.invoice_number)}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Date: {String(inv.invoice_date ?? "—")} ·
            Montant: {mad(Number(inv.total_amount_mad))}
          </p>
        </div>
        <ReconcileButton invoiceId={id} />
      </div>

      {/* Reconciliation summary */}
      {reco && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label:"Commandes",   val: String(reco.total_orders) },
            { label:"Réconciliées",val: String(reco.matched_orders), green:true },
            { label:"Manquantes",  val: String(reco.missing_orders), red:true },
            { label:"Différence",  val: mad(Number(reco.difference_mad)),
              red: Number(reco.difference_mad) !== 0 },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
              <p className={cn("text-xl font-bold",
                k.green && "text-green-700",
                k.red && Number((k.val ?? "").replace(/[^0-9.-]/g,"")) < 0 && "text-red-700"
              )}>{k.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Items table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b font-medium text-sm">
          Détail des colis ({rows.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-secondary/30">
                {["Tracking","Commande","Client","Statut Facture","COD","Frais","Payé","Résultat","Raison"].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((item) => {
                const badge = matchBadge[item.matched_status as keyof typeof matchBadge] ?? matchBadge.pending;
                const Icon  = badge.icon;
                return (
                  <tr key={item.id} className={cn(
                    "hover:bg-secondary/20",
                    item.matched_status === "mismatched" && "bg-red-50/30"
                  )}>
                    <td className="px-3 py-2.5 font-mono">{item.tracking_number}</td>
                    <td className="px-3 py-2.5 font-mono">
                      {item.orders?.order_number ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">{item.orders?.customer_name ?? "—"}</td>
                    <td className="px-3 py-2.5 capitalize">{item.invoice_status}</td>
                    <td className="px-3 py-2.5 font-mono">{mad(item.cod_amount_mad)}</td>
                    <td className="px-3 py-2.5 font-mono">{mad(item.delivery_fee_mad)}</td>
                    <td className="px-3 py-2.5 font-mono font-semibold">
                      {mad(item.amount_paid_mad)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", badge.cls)}>
                        <Icon className="h-3 w-3" />{badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {item.mismatch_reason ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
