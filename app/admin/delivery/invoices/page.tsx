import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ImportInvoicesButton } from "@/components/delivery-integration/import-invoices-button";
import { FileText, CheckCircle, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Factures Transporteur" };
export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  await requireRole(["super_admin","admin","manager","finance"]);
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("delivery_invoices")
    .select("id,invoice_number,invoice_date,total_amount_mad,paid_amount_mad,status,imported_at")
    .order("invoice_date", { ascending: false });

  const { data: companies } = await supabase
    .from("delivery_companies")
    .select("id,name,slug")
    .eq("is_active", true);

  type Invoice = {
    id: string; invoice_number: string; invoice_date: string;
    total_amount_mad: number; paid_amount_mad: number;
    status: string; imported_at: string;
  };

  const rows = (invoices ?? []) as Invoice[];

  const statusConfig = {
    imported:    { label:"Importée",     icon:Clock,          cls:"bg-blue-100 text-blue-700" },
    reconciled:  { label:"Réconciliée",  icon:CheckCircle,    cls:"bg-green-100 text-green-700" },
    disputed:    { label:"Litige",       icon:AlertTriangle,  cls:"bg-red-100 text-red-700" },
  } as const;

  function mad(n: number) {
    return n.toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " MAD";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Factures Transporteur</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Importez et réconciliez les factures de votre transporteur.
          </p>
        </div>
        <ImportInvoicesButton />
      </div>

      {/* Company info */}
      {(companies ?? []).length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Aucun transporteur configuré.{" "}
          <Link href="/admin/settings/delivery" className="underline font-medium">
            Configurer →
          </Link>
        </div>
      )}

      {/* Invoices table */}
      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-16 text-center gap-3">
          <FileText className="h-10 w-10 text-muted-foreground/30" />
          <p className="font-medium text-sm">Aucune facture importée</p>
          <p className="text-xs text-muted-foreground">
            Cliquez sur &laquo; Importer les factures &raquo; pour commencer.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {["N° Facture","Date","Montant Total","Montant Payé","Statut","Importée le",""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((inv) => {
                  const cfg = statusConfig[inv.status as keyof typeof statusConfig] ?? statusConfig.imported;
                  const Icon = cfg.icon;
                  return (
                    <tr key={inv.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium">{inv.invoice_number}</td>
                      <td className="px-4 py-3">{inv.invoice_date}</td>
                      <td className="px-4 py-3 font-mono">{mad(inv.total_amount_mad)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-green-700">
                        {mad(inv.paid_amount_mad)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", cfg.cls)}>
                          <Icon className="h-3 w-3" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(inv.imported_at).toLocaleDateString("fr-MA")}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/delivery/invoices/${inv.id}`}
                          className="text-xs text-primary hover:underline">
                          Détails →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
