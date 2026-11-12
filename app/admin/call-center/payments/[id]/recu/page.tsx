import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAgentPayments } from "@/lib/call-center/agent-queries";
import { methodLabel } from "@/lib/call-center/agent-payment-meta";
import { ReceiptActions } from "@/components/call-center/receipt-actions";

export const metadata: Metadata = { title: "Reçu de paiement" };
export const dynamic = "force-dynamic";

const mad = (n: number) => (n ?? 0).toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " MAD";
const day = (d: string) => new Date(d).toLocaleDateString("fr-MA", { day: "2-digit", month: "2-digit", year: "numeric" });

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [p] = await getAgentPayments({ id, limit: 1 }); // un agent ne peut lire que ses propres reçus
  if (!p) notFound();
  const num = `RP-${(p.paid_at ?? p.created_at).slice(0, 10).replace(/-/g, "")}-${p.id.slice(0, 6).toUpperCase()}`;
  const commission = p.delivered_paid_count * (p.commission_per_order ?? 0);
  const remaining = Math.max(0, (p.gross_amount ?? 0) - (p.paid_amount ?? 0));
  const waText = `Reçu de paiement ${num} — ${p.agentName} — ${mad(p.paid_amount)} (${methodLabel(p.method)}) — période ${day(p.period_start)} au ${day(p.period_end)}`;
  const line = (k: string, v: string, strong?: boolean) => (
    <div className="flex justify-between gap-4 py-2 border-b border-dashed last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className={strong ? "font-bold" : "font-medium"}>{v}</span>
    </div>
  );

  return (
    <div className="max-w-xl mx-auto space-y-4 print:max-w-none">
      <ReceiptActions waText={waText} />
      <style>{`@media print{body *{visibility:hidden!important}#recu,#recu *{visibility:visible!important}#recu{position:absolute;left:0;top:0;width:100%}}`}</style>
      <div id="recu" className="rounded-2xl border bg-white text-black p-6 sm:p-8 space-y-5 print:border-0 print:p-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-bold">HajtekZone</p>
            <p className="text-xs text-gray-500">Reçu de paiement — agent call center</p>
          </div>
          <div className="text-right text-xs">
            <p className="font-mono font-semibold">{num}</p>
            <p className="text-gray-500">Date : {day(p.paid_at ?? p.created_at)}</p>
          </div>
        </div>

        <div className="text-sm">
          {line("Agent", p.agentName, true)}
          {line("Période", `${day(p.period_start)} → ${day(p.period_end)}`)}
          {line("Commandes comptées", String(p.delivered_paid_count))}
          {p.commission_per_order > 0 && line("Commission", `${p.delivered_paid_count} × ${mad(p.commission_per_order)} = ${mad(commission)}`)}
          {p.salary > 0 && line("Salaire fixe", mad(p.salary))}
          {line("Total dû pour la période", mad(p.gross_amount))}
          {line("Montant payé", mad(p.paid_amount), true)}
          {remaining > 0 && line("Reste à payer", mad(remaining))}
          {line("Mode de paiement", methodLabel(p.method))}
          {p.ref && line("Référence", p.ref)}
          {p.text && line("Note", p.text)}
          {line("Payé par", p.payerName)}
        </div>

        {p.proofUrl && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-600">Justificatif</p>
            {p.proofIsPdf ? (
              <a href={p.proofUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline print:hidden">Ouvrir le justificatif (PDF)</a>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.proofUrl} alt="Justificatif" className="max-h-96 rounded-lg border" />
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-6 pt-8 text-xs text-gray-500">
          <div className="border-t pt-2">Signature administration</div>
          <div className="border-t pt-2">Signature agent</div>
        </div>
      </div>
    </div>
  );
}
