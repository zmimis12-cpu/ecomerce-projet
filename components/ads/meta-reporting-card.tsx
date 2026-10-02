type Status = Awaited<ReturnType<typeof import("@/lib/meta/reporting").getMetaReportingStatus>>;

/** Carte "Reporting Meta" : livraisons envoyées comme achats + audience Acheteurs. */
export function MetaReportingCard({ status }: { status: Status }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reporting automatique vers Meta</div>
      <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div><div className="text-xs text-muted-foreground">Achats envoyés (livrées)</div><div className="text-lg font-semibold text-emerald-700">{status.sent}</div></div>
        <div><div className="text-xs text-muted-foreground">En attente d&apos;envoi (7 j)</div><div className="text-lg font-semibold">{status.pending}</div></div>
        <div><div className="text-xs text-muted-foreground">Audience « Acheteurs livrés »</div>
          <div className="text-lg font-semibold">{status.inAudience} <span className="text-xs font-normal text-muted-foreground">envoyés</span></div>
          <div className="text-[10px] text-muted-foreground">{status.audienceSize != null && status.audienceSize > 0 ? `≈ ${status.audienceSize} reconnus par Meta` : "Taille calculée par Meta sous 24-48 h"}</div>
        </div>
        <div><div className="text-xs text-muted-foreground">Erreurs</div>
          <div className={`text-lg font-semibold ${status.errors.length ? "text-red-600" : ""}`}>{status.errors.length}</div>
        </div>
      </div>
      {status.errors.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-xs text-red-600">
          {status.errors.map((e) => <li key={e.order_number}>{e.order_number} : {e.meta_purchase_error}</li>)}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Chaque commande livrée est envoyée à Meta comme « Achat » (Conversions API) en quelques secondes, et ajoutée à l&apos;audience
        « GestionPro — Acheteurs livrés » (données chiffrées). Dans Meta : Audiences → crée un <b>Lookalike 1 % Maroc</b> à partir de cette audience.
      </p>
    </div>
  );
}
