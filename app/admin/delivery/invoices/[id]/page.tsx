import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CheckCircle, AlertTriangle, HelpCircle, TrendingDown } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ReconcileButton } from "@/components/delivery-integration/reconcile-button";
import { normalizeCity, getExpectedDeliveryCost } from "@/lib/delivery/reconciliation-utils";
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
    .select("*, orders(order_number,customer_name,customer_city,total_amount_mad,status)")
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
    delivery_fee_mad: number; return_fee_mad: number; amount_paid_mad: number;
    invoice_status: string; matched_status: string; mismatch_reason: string | null;
    raw_payload: Record<string, unknown>;
    orders: { order_number: string; customer_name: string; customer_city: string; total_amount_mad: number; status: string } | null;
  };

  const inv  = invoice as Record<string, unknown>;
  const rows = (items ?? []) as InvItem[];
  const reco = recoLog as Record<string, unknown> | null;

  function mad(n: number | null | undefined) {
    return (Number(n) || 0).toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " MAD";
  }

  const statusBadge = {
    OK:            { label:"OK",           cls:"bg-green-100 text-green-800",  icon:CheckCircle },
    MISMATCH:      { label:"Écart",        cls:"bg-red-100 text-red-800",      icon:AlertTriangle },
    FEE_OVERCHARGE:{ label:"Surcharge",    cls:"bg-orange-100 text-orange-800",icon:TrendingDown },
    COD_MISMATCH:  { label:"COD ≠",        cls:"bg-red-100 text-red-800",      icon:AlertTriangle },
    MISSING:       { label:"Manquant",     cls:"bg-gray-100 text-gray-600",    icon:HelpCircle },
    EXTRA:         { label:"Hors système", cls:"bg-purple-100 text-purple-700",icon:HelpCircle },
    DUPLICATE:     { label:"Doublon",      cls:"bg-yellow-100 text-yellow-700",icon:AlertTriangle },
    UNPAID:        { label:"Non payé",     cls:"bg-red-100 text-red-800",      icon:AlertTriangle },
    matched:       { label:"OK",           cls:"bg-green-100 text-green-800",  icon:CheckCircle },
    mismatched:    { label:"Écart",        cls:"bg-red-100 text-red-800",      icon:AlertTriangle },
    pending:       { label:"En attente",   cls:"bg-gray-100 text-gray-600",    icon:HelpCircle },
  } as const;

  // Compute per-row reconciliation for display
  const enrichedRows = rows.map((item) => {
    const city = item.orders?.customer_city ?? (item.raw_payload?.city as string | undefined) ?? "";
    const normalizedCity = normalizeCity(city);
    const expectedFee = getExpectedDeliveryCost(city);
    const digylogFee  = item.delivery_fee_mad ?? 0;
    const feeDiff     = digylogFee - expectedFee;
    const codSystem   = item.orders?.total_amount_mad ?? null;
    const codDigylog  = item.cod_amount_mad;
    const expPayout   = codSystem !== null ? codSystem - expectedFee : null;
    const actPayout   = item.amount_paid_mad;
    const payoutDiff  = expPayout !== null ? actPayout - expPayout : null;
    return { ...item, city, normalizedCity, expectedFee, digylogFee, feeDiff, codSystem, codDigylog, expPayout, actPayout, payoutDiff };
  });

  const totalFeeOvercharge = enrichedRows.reduce((s, r) => s + (r.feeDiff > 0.5 ? r.feeDiff : 0), 0);
  const docType = (inv.raw_payload as Record<string, unknown> | null)?.documentType as string ?? "FACTURE";

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

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex rounded-full bg-violet-100 text-violet-700 px-2.5 py-0.5 text-xs font-bold">{docType}</span>
            <h1 className="text-xl font-semibold">{String(inv.invoice_number)}</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Date: {String(inv.invoice_date ?? "—")} · {rows.length} colis · Total: {mad(Number(inv.total_amount_mad))}
          </p>
        </div>
        <ReconcileButton invoiceId={id} />
      </div>

      {/* Reconciliation summary cards */}
      {reco && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label:"Colis",          val: String(reco.total_orders) },
            { label:"OK",             val: String(reco.matched_orders), green:true },
            { label:"Problèmes",      val: String(Number(reco.total_orders) - Number(reco.matched_orders)), red:true },
            { label:"Différence",     val: mad(Number(reco.difference_mad)), red: Number(reco.difference_mad) !== 0 },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
              <p className={cn("text-xl font-bold", k.green && "text-green-700", k.red && "text-red-700")}>{k.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Fee overcharge alert */}
      {totalFeeOvercharge > 0.5 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 flex items-start gap-3">
          <TrendingDown className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-800">
              Surcharge frais Digylog détectée : {mad(totalFeeOvercharge)}
            </p>
            <p className="text-xs text-orange-700 mt-0.5">
              Des commandes Casablanca ont été facturées 35 MAD au lieu de 25 MAD. Montant à réclamer à Digylog.
            </p>
          </div>
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
                {["Tracking","Commande","Ville","COD Sys.","COD Digy.","Frais attendu","Frais Digy.","Écart frais","Payout attendu","Payout réel","Diff","Statut","Raison"].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {enrichedRows.map((item) => {
                const badgeKey = item.mismatch_reason?.includes("double") ? "DUPLICATE"
                  : item.matched_status === "matched" ? "matched"
                  : item.matched_status === "mismatched" ? "mismatched"
                  : "pending";
                const badge = statusBadge[badgeKey as keyof typeof statusBadge] ?? statusBadge.pending;
                const Icon = badge.icon;
                return (
                  <tr key={item.id} className={cn(
                    "hover:bg-secondary/20",
                    item.matched_status === "mismatched" && "bg-red-50/30",
                    item.feeDiff > 0.5 && "bg-orange-50/20",
                  )}>
                    <td className="px-3 py-2.5 font-mono font-medium">{item.tracking_number}</td>
                    <td className="px-3 py-2.5 font-mono">{item.orders?.order_number ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className="block">{item.normalizedCity || "—"}</span>
                      {item.normalizedCity === "Casablanca" && (
                        <span className="text-[9px] text-emerald-600 font-semibold">Casa 25 MAD</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono">{item.codSystem !== null ? mad(item.codSystem) : "—"}</td>
                    <td className={cn("px-3 py-2.5 font-mono", item.codSystem !== null && Math.abs(item.codDigylog - item.codSystem) > 0.5 && "text-red-600 font-bold")}>
                      {mad(item.codDigylog)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-muted-foreground">{mad(item.expectedFee)}</td>
                    <td className={cn("px-3 py-2.5 font-mono", item.feeDiff > 0.5 && "text-orange-600 font-bold")}>
                      {mad(item.digylogFee)}
                    </td>
                    <td className={cn("px-3 py-2.5 font-mono font-semibold",
                      item.feeDiff > 0.5 ? "text-red-600" : item.feeDiff < -0.5 ? "text-green-600" : "text-muted-foreground")}>
                      {item.feeDiff > 0.5 ? `+${item.feeDiff.toFixed(2)}` : item.feeDiff < -0.5 ? item.feeDiff.toFixed(2) : "0"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-muted-foreground">
                      {item.expPayout !== null ? mad(item.expPayout) : "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold">{mad(item.actPayout)}</td>
                    <td className={cn("px-3 py-2.5 font-mono font-bold",
                      item.payoutDiff !== null && item.payoutDiff < -0.5 ? "text-red-600" :
                      item.payoutDiff !== null && item.payoutDiff > 0.5 ? "text-green-600" : "text-muted-foreground")}>
                      {item.payoutDiff !== null ? (item.payoutDiff > 0.5 ? `+${item.payoutDiff.toFixed(2)}` : item.payoutDiff.toFixed(2)) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", badge.cls)}>
                        <Icon className="h-3 w-3" />{badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground max-w-[180px] truncate">
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
