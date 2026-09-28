import { FileText, ImageIcon } from "lucide-react";
import type { EditorPayment } from "@/lib/creatives/payment-queries";
import { METHOD_LABEL } from "@/lib/creatives/payment-queries";
import { DeletePaymentButton } from "@/components/creatives/payment-controls";
import { mad } from "@/components/creatives/period-filter";

export function PaymentsList({
  payments, editorNames, canDelete,
}: {
  payments: EditorPayment[];
  editorNames?: Map<string, string>;
  canDelete: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Date</th>
            {editorNames && <th className="px-4 py-2">Éditeur</th>}
            <th className="px-4 py-2 text-right">Montant</th>
            <th className="px-4 py-2">Méthode</th>
            <th className="px-4 py-2">Référence / note</th>
            <th className="px-4 py-2">Justificatif</th>
            {canDelete && <th className="px-4 py-2"></th>}
          </tr>
        </thead>
        <tbody>
          {payments.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Aucun paiement.</td></tr>
          )}
          {payments.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="px-4 py-2">{new Date(p.paidOn + "T00:00:00").toLocaleDateString("fr-FR")}</td>
              {editorNames && <td className="px-4 py-2">{editorNames.get(p.editorId) ?? "—"}</td>}
              <td className="px-4 py-2 text-right font-semibold">{mad(p.amount)}</td>
              <td className="px-4 py-2">{METHOD_LABEL[p.method] ?? p.method}</td>
              <td className="px-4 py-2 text-xs">
                {p.reference && <div className="font-mono">{p.reference}</div>}
                {p.note && <div className="text-muted-foreground">{p.note}</div>}
                {!p.reference && !p.note && "—"}
              </td>
              <td className="px-4 py-2">
                {p.proofUrl ? (
                  <a href={p.proofUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    {p.proofIsPdf ? <FileText className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                    Voir
                  </a>
                ) : <span className="text-xs text-amber-600">Manquant</span>}
              </td>
              {canDelete && <td className="px-4 py-2 text-right"><DeletePaymentButton id={p.id} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
