import Link from "next/link";
import { FileText, Paperclip, Receipt } from "lucide-react";
import type { AgentPaymentRow } from "@/lib/call-center/agent-queries";
import { methodLabel } from "@/lib/call-center/agent-payment-meta";
import { cn } from "@/lib/utils";

const mad = (n: number) => (n ?? 0).toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " MAD";

/** Historique des paiements agents : mode, justificatif, reçu. */
export function AgentPaymentsList({ rows, showAgent }: { rows: AgentPaymentRow[]; showAgent?: boolean }) {
  const heads = [...(showAgent ? ["Agent"] : []), "Date", "Période", "Cmd", "Brut", "Payé", "Mode", "Statut", "Justif / Reçu"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-secondary/30">
            {heads.map((h) => <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-secondary/10">
              {showAgent && <td className="px-4 py-2.5 font-medium whitespace-nowrap">{p.agentName}</td>}
              <td className="px-4 py-2.5 text-xs whitespace-nowrap">{new Date(p.paid_at ?? p.created_at).toLocaleDateString("fr-MA")}</td>
              <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{p.period_start} → {p.period_end}</td>
              <td className="px-4 py-2.5 text-center font-bold">{p.delivered_paid_count}</td>
              <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{mad(p.gross_amount)}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-green-700 font-semibold whitespace-nowrap">{mad(p.paid_amount)}</td>
              <td className="px-4 py-2.5 text-xs whitespace-nowrap">{methodLabel(p.method)}{p.ref ? <span className="block font-mono text-[10px] text-muted-foreground">{p.ref}</span> : null}</td>
              <td className="px-4 py-2.5">
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  p.status === "paid" ? "bg-green-100 text-green-700" : p.status === "partially_paid" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700")}>
                  {p.status === "paid" ? "Payé" : p.status === "partially_paid" ? "Partiel" : "Non payé"}
                </span>
              </td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-3 text-xs whitespace-nowrap">
                  {p.proofUrl ? (
                    <a href={p.proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                      {p.proofIsPdf ? <FileText className="h-3.5 w-3.5" /> : <Paperclip className="h-3.5 w-3.5" />} Justif
                    </a>
                  ) : <span className="text-muted-foreground">—</span>}
                  <Link href={`/admin/call-center/payments/${p.id}/recu`} target="_blank" className="inline-flex items-center gap-1 text-emerald-700 hover:underline">
                    <Receipt className="h-3.5 w-3.5" /> Reçu
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
