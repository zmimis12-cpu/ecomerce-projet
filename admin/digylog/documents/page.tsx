import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getDigylogDocuments } from "@/lib/delivery/digylog/document-service";
import { ImportDocumentForm } from "@/components/digylog/import-document-form";
import { SyncStatusButton } from "@/components/digylog/sync-status-button";
import { FileText, CheckCircle, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Documents Livraison" };
export const dynamic = "force-dynamic";

export default async function DigylogDocumentsPage() {
  await requireRole(["super_admin", "admin", "manager", "finance"]);
  const documents = await getDigylogDocuments();

  const typeColors: Record<string, string> = {
    BL:              "bg-blue-100 text-blue-700",
    BR:              "bg-orange-100 text-orange-700",
    RAMASSAGE:       "bg-purple-100 text-purple-700",
    BLFC:            "bg-cyan-100 text-cyan-700",
    BRFC:            "bg-pink-100 text-pink-700",
    PAYMENT_INVOICE: "bg-green-100 text-green-700",
    REFUND:          "bg-red-100 text-red-700",
    OTHER:           "bg-gray-100 text-gray-700",
  };

  const statusConfig: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    imported:     { label: "Importé",      cls: "bg-blue-100 text-blue-700",    icon: Clock },
    reconciled:   { label: "Réconcilié",   cls: "bg-green-100 text-green-700",  icon: CheckCircle },
    disputed:     { label: "Litige",       cls: "bg-red-100 text-red-700",      icon: AlertTriangle },
    scanning:     { label: "En scan",      cls: "bg-amber-100 text-amber-700",  icon: RefreshCw },
    scan_complete:{ label: "Scan complet", cls: "bg-green-100 text-green-700",  icon: CheckCircle },
    closed:       { label: "Fermé",        cls: "bg-gray-100 text-gray-600",    icon: CheckCircle },
  };

  function mad(n: number) {
    return n.toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " MAD";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Documents Livraison</h1>
          <p className="text-sm text-muted-foreground mt-1">
            BL, BR, Ramassage, BLFC, BRFC, Factures, Remboursements.
          </p>
        </div>
        <SyncStatusButton />
      </div>

      {/* Import form */}
      <ImportDocumentForm />

      {/* Documents list */}
      {documents.length === 0 ? (
        <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-16 text-center gap-3">
          <FileText className="h-10 w-10 text-muted-foreground/30" />
          <p className="font-medium text-sm">Aucun document importé</p>
          <p className="text-xs text-muted-foreground">Utilisez le formulaire ci-dessus pour importer votre premier document.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {["Type", "Numéro", "Date", "Lignes", "Matchées", "Non matchées", "COD Total", "Payout", "Statut", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {documents.map((doc) => {
                  const typeColor = typeColors[doc.document_type] ?? typeColors.OTHER;
                  const cfg = statusConfig[doc.status] ?? statusConfig.imported;
                  const Icon = cfg.icon;
                  const matchPct = doc.total_lines > 0 ? Math.round((doc.matched_lines / doc.total_lines) * 100) : 0;
                  return (
                    <tr key={doc.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold", typeColor)}>
                          {doc.document_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium">{doc.document_number}</td>
                      <td className="px-4 py-3 text-muted-foreground">{doc.document_date ?? "—"}</td>
                      <td className="px-4 py-3 font-semibold">{doc.total_lines}</td>
                      <td className="px-4 py-3">
                        <span className="text-green-700 font-semibold">{doc.matched_lines}</span>
                        <span className="text-xs text-muted-foreground ml-1">({matchPct}%)</span>
                      </td>
                      <td className="px-4 py-3">
                        {doc.unmatched_lines > 0
                          ? <span className="text-red-600 font-semibold">{doc.unmatched_lines}</span>
                          : <span className="text-muted-foreground">0</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{mad(doc.total_cod_mad)}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-green-700">{mad(doc.total_payout_mad)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", cfg.cls)}>
                          <Icon className="h-3 w-3" />{cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/digylog/documents/${doc.id}`}
                          className="text-xs text-primary hover:underline whitespace-nowrap">
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
