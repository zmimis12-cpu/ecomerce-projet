import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import { FileText, CheckCircle2, Clock, AlertTriangle, Download } from "lucide-react";

export const metadata: Metadata = { title: "Documents Livraison" };
export const dynamic = "force-dynamic";

const DOC_TYPES = ["BL", "BR", "BLFC", "BRFC", "INVOICE", "REFUND", "RAMASSAGE", "PAYOUT"] as const;
type DocType = typeof DOC_TYPES[number];

const DOC_LABELS: Record<string, string> = {
  BL: "Bons de Livraison", BR: "Bons de Retour",
  BLFC: "BL Fulfillment", BRFC: "BR Fulfillment",
  INVOICE: "Factures", REFUND: "Remboursements",
  RAMASSAGE: "Ramassage", PAYOUT: "Paiements COD",
};

const DOC_COLORS: Record<string, string> = {
  BL: "bg-blue-100 text-blue-700", BR: "bg-orange-100 text-orange-700",
  BLFC: "bg-blue-100 text-blue-600", BRFC: "bg-orange-100 text-orange-600",
  INVOICE: "bg-green-100 text-green-700", REFUND: "bg-purple-100 text-purple-700",
  RAMASSAGE: "bg-amber-100 text-amber-700", PAYOUT: "bg-emerald-100 text-emerald-700",
};

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireRole(["super_admin", "admin", "manager"]);
  const sp = await searchParams;

  type DocRow = {
    id: string; provider_slug: string; store_name: string | null;
    document_number: string | null; document_date: string | null;
    status: string; total_cod: number | null; total_fees: number | null;
    total_payout: number | null; line_count: number | null;
    source: string | null; synced_at: string | null; created_at: string;
  };

  const tab      = (sp.tab as DocType) || "BL";
  const provider = sp.provider || undefined;
  const dateFrom = sp.from || undefined;
  const dateTo   = sp.to || undefined;
  const page     = Number(sp.page ?? 0);
  const perPage  = 50;

  // Get counts per type — safe fallback if table missing
  const countMap: Record<string, number> = {};
  let documents: DocRow[] = [];
  let total = 0;

  try {
    const { data: counts } = await supabaseAdmin
      .from("delivery_documents")
      .select("document_type")
      .not("document_type", "is", null);

    for (const r of (counts ?? []) as { document_type: string }[]) {
      countMap[r.document_type] = (countMap[r.document_type] ?? 0) + 1;
    }

    // Get documents for current tab
    let q = supabaseAdmin
      .from("delivery_documents")
      .select("id, provider_slug, store_name, document_number, document_date, status, total_cod, total_fees, total_payout, line_count, source, synced_at, created_at", { count: "exact" })
      .eq("document_type", tab)
      .order("document_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(page * perPage, (page + 1) * perPage - 1);

    if (provider) q = q.eq("provider_slug", provider);
    if (dateFrom) q = q.gte("document_date", dateFrom);
    if (dateTo)   q = q.lte("document_date", dateTo);

    const { data: docs, count: cnt } = await q;
    documents = (docs ?? []) as DocRow[];
    total = cnt ?? 0;

  } catch (e) {
    // Table may not exist yet — show empty state
    console.warn("[documents] delivery_documents table missing:", e);
    documents = [];
    total = 0;
  }


  const pages = Math.ceil((total ?? 0) / perPage);

  // Totals for current tab — safe
  let sumCod = 0, sumFees = 0, sumPayout = 0;
  try {
    const { data: totals } = await supabaseAdmin
      .from("delivery_documents")
      .select("total_cod, total_fees, total_payout")
      .eq("document_type", tab);
    type TRow = { total_cod: number | null; total_fees: number | null; total_payout: number | null };
    const tRows = (totals ?? []) as TRow[];
    sumCod    = tRows.reduce((s, r) => s + (r.total_cod    ?? 0), 0);
    sumFees   = tRows.reduce((s, r) => s + (r.total_fees   ?? 0), 0);
    sumPayout = tRows.reduce((s, r) => s + (r.total_payout ?? 0), 0);
  } catch { /* table missing */ }

  function mad(n: number) { return n.toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " MAD"; }

  const buildUrl = (params: Record<string, string>) => {
    const p = new URLSearchParams({ tab, ...sp, ...params });
    return `/admin/delivery/documents?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Documents Livraison</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Centre documents transporteurs — tous providers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form method="get" action="/admin/delivery/documents" className="flex items-center gap-2">
            <input type="hidden" name="tab" value={tab} />
            <select name="provider" defaultValue={provider ?? ""}
              className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none">
              <option value="">Tous providers</option>
              <option value="digylog">Digylog</option>
              <option value="ozone">Ozone</option>
            </select>
            <input type="date" name="from" defaultValue={dateFrom}
              className="h-9 rounded-lg border bg-background px-3 text-sm" />
            <input type="date" name="to" defaultValue={dateTo}
              className="h-9 rounded-lg border bg-background px-3 text-sm" />
            <button type="submit"
              className="h-9 px-3 rounded-lg border bg-background text-sm hover:bg-secondary transition-colors">
              Filtrer
            </button>
          </form>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1.5 flex-wrap border-b pb-0">
        {DOC_TYPES.map((t) => (
          <Link key={t} href={buildUrl({ tab: t, page: "0" })}
            className={cn(
              "px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors",
              tab === t
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}>
            {DOC_LABELS[t]}
            {countMap[t] ? (
              <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold", tab === t ? "bg-primary/15" : "bg-secondary")}>
                {countMap[t]}
              </span>
            ) : null}
          </Link>
        ))}
      </div>

      {/* Summary cards */}
      {["BL", "BR", "INVOICE", "PAYOUT"].includes(tab) && (
        <div className="grid grid-cols-3 gap-3">
          {tab !== "BR" && (
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">COD total</p>
              <p className="text-lg font-bold font-mono mt-1">{mad(sumCod)}</p>
            </div>
          )}
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Frais total</p>
            <p className="text-lg font-bold font-mono mt-1">{mad(sumFees)}</p>
          </div>
          <div className={cn("rounded-xl border p-4", sumPayout > 0 ? "bg-emerald-50/30 border-emerald-200" : "bg-card")}>
            <p className="text-xs text-muted-foreground">Net payout</p>
            <p className={cn("text-lg font-bold font-mono mt-1", sumPayout > 0 ? "text-emerald-700" : "")}>{mad(sumPayout)}</p>
          </div>
        </div>
      )}

      {/* Documents table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/30">
                {["Numéro", "Date", "Provider", "Store", "Lignes", "COD", "Frais", "Net", "Statut", "Source", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {documents.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Aucun document {DOC_LABELS[tab]?.toLowerCase()} trouvé.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Synchronisez depuis les stores ou importez manuellement.
                    </p>
                  </td>
                </tr>
              )}
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs font-bold">{doc.document_number ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {doc.document_date ? new Date(doc.document_date).toLocaleDateString("fr-MA") : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", DOC_COLORS[tab] ?? "bg-gray-100 text-gray-600")}>
                      {doc.provider_slug}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs">{doc.store_name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-center text-xs font-mono">{doc.line_count ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{doc.total_cod != null ? mad(doc.total_cod) : "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{doc.total_fees != null ? mad(doc.total_fees) : "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs font-bold text-emerald-700">
                    {doc.total_payout != null ? mad(doc.total_payout) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      doc.status === "synced"      && "bg-green-100 text-green-700",
                      doc.status === "imported"    && "bg-blue-100 text-blue-700",
                      doc.status === "reconciled"  && "bg-emerald-100 text-emerald-700",
                      doc.status === "error"       && "bg-red-100 text-red-700",
                    )}>
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[10px] text-muted-foreground">
                    {doc.source === "api_sync" ? "API" : doc.source === "webhook" ? "Webhook" : "Manuel"}
                  </td>
                  <td className="px-4 py-2.5">
                    {doc.document_number && (
                      <button type="button" className="text-xs text-primary hover:underline flex items-center gap-1">
                        <Download className="h-3 w-3" /> PDF
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-secondary/10">
            <span className="text-xs text-muted-foreground">{total} document(s) · Page {page + 1}/{pages}</span>
            <div className="flex gap-1">
              {page > 0 && (
                <Link href={buildUrl({ page: String(page - 1) })}
                  className="h-7 px-3 rounded border text-xs flex items-center hover:bg-secondary transition-colors">← Préc.</Link>
              )}
              {page < pages - 1 && (
                <Link href={buildUrl({ page: String(page + 1) })}
                  className="h-7 px-3 rounded border text-xs flex items-center hover:bg-secondary transition-colors">Suiv. →</Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
