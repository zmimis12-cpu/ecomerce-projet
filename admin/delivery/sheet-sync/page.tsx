import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { AlertTriangle } from "lucide-react";
import { SheetSyncClient } from "@/components/delivery-batch/sheet-sync-client";

export const metadata: Metadata = { title: "Sheet Sync Livraison" };
export const dynamic = "force-dynamic";

const SHEET_CONFIGURED = !!(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
  process.env.GOOGLE_PRIVATE_KEY &&
  process.env.GOOGLE_SHEET_ID_CONFIRMED
);

export default async function SheetSyncPage() {
  await requireRole(["super_admin","admin","manager"]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sheet Sync Livraison</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Lit les commandes du Google Sheet, envoie à Digylog, et écrit le tracking en retour.
        </p>
      </div>

      {!SHEET_CONFIGURED && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 text-sm">Google Sheets non configuré</p>
              <p className="text-xs text-amber-800 mt-1">Ajoutez ces variables dans Vercel :</p>
            </div>
          </div>
          <div className="rounded-lg bg-amber-100 p-3 space-y-1">
            {["GOOGLE_SERVICE_ACCOUNT_EMAIL","GOOGLE_PRIVATE_KEY","GOOGLE_SHEET_ID_CONFIRMED"].map((v) => (
              <p key={v} className="font-mono text-xs text-amber-900">{v}</p>
            ))}
          </div>
        </div>
      )}

      {/* Sheet columns info */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Structure du Google Sheet attendue</h2>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="border-b">
                {["Col","Champ","Obligatoire","Notes"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                ["A","Order Reference","✓","Clé unique — sert à éviter les doublons"],
                ["B","Name","✓","Nom du client"],
                ["C","Phone","✓","10 chiffres (0612345678)"],
                ["D","Address","✓","Adresse de livraison"],
                ["E","City","✓","Ville (doit correspondre à Digylog)"],
                ["F","COD Amount","✓","Montant à collecter en MAD"],
                ["G","Product SKU","✓","SKU du produit dans le système"],
                ["H","Quantity","","Quantité (défaut: 1)"],
                ["I","Notes","","Note pour le livreur"],
                ["J","Tracking Number","","Rempli automatiquement par le système"],
                ["K","Status","","Rempli: Sent / Not Sent"],
                ["L","Errors","","Erreur transporteur si Not Sent"],
              ].map(([col, field, req, note]) => (
                <tr key={col} className="hover:bg-secondary/20">
                  <td className="px-3 py-2 font-mono font-bold text-primary">{col}</td>
                  <td className="px-3 py-2 font-medium">{field}</td>
                  <td className="px-3 py-2 text-center">{req}</td>
                  <td className="px-3 py-2 text-muted-foreground">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Ligne 1 = en-têtes. Les données commencent à la ligne 2.
          Les colonnes J, K, L sont écrites automatiquement par le système.
        </p>
      </div>

      <SheetSyncClient sheetConfigured={SHEET_CONFIGURED} />
    </div>
  );
}
