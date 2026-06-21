import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, AlertTriangle, CheckCircle, Package, ScanLine } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getDigylogDocumentDetail } from "@/lib/delivery/digylog/document-service";
import { ReconcileDocumentButton } from "@/components/digylog/reconcile-document-button";
import { DocumentScannerClient } from "@/components/digylog/document-scanner-client";
import { normalizeCity, getExpectedDeliveryCost } from "@/lib/delivery/reconciliation-utils";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Document Livraison" };
export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(["super_admin", "admin", "manager", "finance"]);

  const detail = await getDigylogDocumentDetail(id);
  if (!detail) notFound();

  const { doc, lines } = detail;
  const isScannable = ["BR", "RAMASSAGE"].includes(String(doc.document_type));

  function mad(n: number | null | undefined) {
    return (Number(n) || 0).toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " MAD";
  }

  type LineRow = {
    id: string; line_number: number; tracking_number: string | null;
    cod_amount_mad: number; delivery_fee_mad: number; payout_amount_mad: number;
    city: string | null; status: string | null;
    matched: boolean; match_status: string; mismatch_reasons: string[] | null;
    scan_status: string;
    orders: { order_number: string; customer_name: string; customer_city: string; total_amount_mad: number; status: string } | null;
  };
  const rows = lines as unknown as LineRow[];

  const scanned   = rows.filter((r) => r.scan_status === "scanned").length;
  const missing   = rows.filter((r) => r.scan_status === "not_scanned").length;
  const unexpected = rows.filter((r) => r.scan_status === "unexpected").length;

  return (
    <div className="space-y-6">
      {/* Back */}
      <div className="flex items-center gap-2">
        <Link href="/admin/digylog/documents"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Documents
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">{String(doc.document_number)}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex rounded-full bg-violet-100 text-violet-700 px-2.5 py-0.5 text-xs font-bold">
              {String(doc.document_type)}
            </span>
            <h1 className="text-xl font-semibold">{String(doc.document_number)}</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {String(doc.document_date ?? "—")} · {rows.length} lignes · {mad(Number(doc.total_payout_mad))} payout
          </p>
        </div>
        <div className="flex gap-2">
          <ReconcileDocumentButton documentId={id} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total lignes",   val: rows.length,                                    cls: "" },
          { label: "Matchées",       val: rows.filter((r) => r.matched).length,           cls: "text-green-700" },
          { label: "Non matchées",   val: rows.filter((r) => !r.matched).length,          cls: rows.filter((r) => !r.matched).length > 0 ? "text-red-600" : "" },
          { label: "Avec problème",  val: rows.filter((r) => r.match_status === "mismatch").length, cls: "text-orange-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={cn("text-2xl font-bold", s.cls)}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Scan section for BR/RAMASSAGE */}
      {isScannable && (
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50/30 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-amber-700" />
            <h2 className="font-semibold text-amber-800">Scan {String(doc.document_type)}</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Scannés",   val: scanned,    cls: "text-green-700" },
              { label: "Manquants", val: missing,    cls: "text-amber-700" },
              { label: "Inattendus",val: unexpected, cls: "text-red-600" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-white border p-3 text-center">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={cn("text-xl font-bold", s.cls)}>{s.val}</p>
              </div>
            ))}
          </div>
          <DocumentScannerClient documentId={id} />
        </div>
      )}

      {/* Lines table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b font-medium text-sm">Lignes ({rows.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-secondary/30">
                {["#", "Tracking", "Commande", "Ville", "COD Sys.", "COD Doc.", "Frais", "Payout", "Statut doc.", "Match", "Scan", "Problèmes"].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const city = row.orders?.customer_city ?? row.city ?? "";
                const expFee = getExpectedDeliveryCost(city);
                const normCity = normalizeCity(city);
                const feeDiff = (row.delivery_fee_mad ?? 0) - expFee;
                const hasMismatch = row.match_status === "mismatch" || feeDiff > 0.5;

                return (
                  <tr key={row.id} className={cn("hover:bg-secondary/20", hasMismatch && "bg-red-50/20")}>
                    <td className="px-3 py-2">{row.line_number}</td>
                    <td className="px-3 py-2 font-mono font-bold">{row.tracking_number ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{row.orders?.order_number ?? <span className="text-red-500">Non trouvé</span>}</td>
                    <td className="px-3 py-2">
                      <span className="block">{normCity || "—"}</span>
                      {normCity === "Casablanca" && <span className="text-[9px] text-emerald-600 font-semibold">25 MAD</span>}
                    </td>
                    <td className="px-3 py-2 font-mono">{row.orders ? mad(row.orders.total_amount_mad) : "—"}</td>
                    <td className={cn("px-3 py-2 font-mono", row.orders && Math.abs((row.cod_amount_mad ?? 0) - row.orders.total_amount_mad) > 0.5 && "text-red-600 font-bold")}>
                      {mad(row.cod_amount_mad)}
                    </td>
                    <td className={cn("px-3 py-2 font-mono", feeDiff > 0.5 && "text-orange-600 font-bold")}>
                      {mad(row.delivery_fee_mad)}
                      {feeDiff > 0.5 && <span className="text-[9px] text-red-500 ml-1">+{feeDiff.toFixed(0)}</span>}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold text-green-700">{mad(row.payout_amount_mad)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.status ?? "—"}</td>
                    <td className="px-3 py-2">
                      {row.matched
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[10px] font-semibold"><CheckCircle className="h-3 w-3" />OK</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-semibold"><AlertTriangle className="h-3 w-3" />Non</span>}
                    </td>
                    <td className="px-3 py-2">
                      {row.scan_status === "scanned"    && <span className="text-green-600 font-semibold">✓ Scanné</span>}
                      {row.scan_status === "not_scanned"&& <span className="text-muted-foreground">—</span>}
                      {row.scan_status === "unexpected" && <span className="text-red-600 font-bold">🚫 Inattendu</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[200px]">
                      {row.mismatch_reasons?.join(" | ") ?? "—"}
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
