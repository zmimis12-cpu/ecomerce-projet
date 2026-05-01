/**
 * Shown when the public.users profile row was missing and had to be auto-created.
 * This is an edge case (trigger failed, manual auth insert) — not a crash.
 */
import { AlertTriangle } from "lucide-react";

export function MissingProfileBanner({ email }: { email: string }) {
  return (
    <div className="mx-6 mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="font-medium text-amber-900">Profil auto-créé</p>
        <p className="text-amber-700 text-xs mt-0.5">
          Aucun profil trouvé pour{" "}
          <span className="font-mono">{email}</span>. Un profil par défaut
          (rôle: <strong>viewer</strong>) a été créé automatiquement. Demandez
          à un administrateur de mettre à jour votre rôle si nécessaire.
        </p>
      </div>
    </div>
  );
}
