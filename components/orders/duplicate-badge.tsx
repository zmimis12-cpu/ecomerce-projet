import { AlertTriangle } from "lucide-react";
import Link from "next/link";

interface DuplicateBadgeProps {
  duplicateOfId: string | null;
  duplicateOfNumber?: string | null;
  /** compact = small inline badge, full = detailed warning card */
  variant?: "compact" | "full";
}

export function DuplicateBadge({
  duplicateOfId,
  duplicateOfNumber,
  variant = "compact",
}: DuplicateBadgeProps) {
  if (variant === "compact") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-medium">
        <AlertTriangle className="h-3 w-3" />
        Doublon suspect
      </span>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-amber-900">Doublon suspect détecté</p>
        <p className="text-xs text-amber-700">
          Cette commande a été créée car une commande similaire existe déjà pour ce
          client et ce produit dans les dernières 24h. Elle n&apos;a pas été bloquée,
          mais vérifiez avant de confirmer.
        </p>
        {duplicateOfId && (
          <Link
            href={`/admin/orders/${duplicateOfId}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 underline hover:text-amber-900 mt-1"
          >
            Voir la commande d&apos;origine
            {duplicateOfNumber && ` (${duplicateOfNumber})`}
            →
          </Link>
        )}
      </div>
    </div>
  );
}
