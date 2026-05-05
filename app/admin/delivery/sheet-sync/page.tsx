import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { AlertTriangle } from "lucide-react";

export const metadata: Metadata = { title: "Sync Google Sheet" };
export const dynamic = "force-dynamic";

const SHEET_CONFIGURED = !!(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
  process.env.GOOGLE_PRIVATE_KEY &&
  process.env.GOOGLE_SHEET_ID_CONFIRMED
);

export default async function SheetSyncPage() {
  await requireRole(["super_admin","admin","manager"]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sync Google Sheet</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Importez les commandes confirmées depuis Google Sheet avant envoi Digylog.
        </p>
      </div>

      {!SHEET_CONFIGURED ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 text-sm">Google Sheets non configuré</p>
              <p className="text-xs text-amber-800 mt-1">
                Ajoutez ces variables dans Vercel pour activer la synchronisation :
              </p>
            </div>
          </div>
          <div className="rounded-lg bg-amber-100 p-3 space-y-1">
            {["GOOGLE_SERVICE_ACCOUNT_EMAIL","GOOGLE_PRIVATE_KEY","GOOGLE_SHEET_ID_CONFIRMED"].map((v) => (
              <p key={v} className="font-mono text-xs text-amber-900">{v}</p>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Google Sheets configuré. Fonctionnalité d&apos;import disponible prochainement.
          </p>
        </div>
      )}

      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Workflow recommandé</h2>
        <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
          <li>Confirmez les commandes dans votre Google Sheet</li>
          <li>Importez-les ici (synchronisation automatique)</li>
          <li>Allez dans <strong>Groupes Livraison</strong> pour créer un batch</li>
          <li>Envoyez le batch à Digylog en un click</li>
          <li>Téléchargez les tickets 10×10 et le BL</li>
        </ol>
      </div>
    </div>
  );
}
