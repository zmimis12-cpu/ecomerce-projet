import {
  CheckCircle2,
  User,
  Shield,
  Building2,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { getRoleLabel, getRoleBadge } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/database";

interface DashboardPlaceholderProps {
  displayName: string;
  email: string;
  role: UserRole | string;
  isActive: boolean;
  hasProfile: boolean;
  unauthorizedError?: boolean;
}

export function DashboardPlaceholder({
  displayName,
  email,
  role,
  isActive,
  hasProfile,
  unauthorizedError,
}: DashboardPlaceholderProps) {
  const badge = getRoleBadge(role);

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Unauthorized error */}
      {unauthorizedError && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4">
          <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-destructive text-sm">Accès refusé</p>
            <p className="text-xs text-destructive/80 mt-0.5">
              Vous n&apos;avez pas les permissions nécessaires pour accéder à cette section.
            </p>
          </div>
        </div>
      )}

      {/* System ready banner */}
      <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-4">
        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
        <div>
          <p className="font-medium text-green-900 text-sm">Système prêt</p>
          <p className="text-xs text-green-700 mt-0.5">
            GestionPro est opérationnel. Authentification et profil vérifiés.
          </p>
        </div>
      </div>

      {/* Account card */}
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-lg leading-tight">GestionPro</h2>
            <p className="text-muted-foreground text-sm">
              Système de gestion e-commerce — v2.0
            </p>
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">

          {/* User */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Utilisateur
            </p>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm leading-tight truncate">
                  {displayName}
                </p>
                <p className="text-xs text-muted-foreground truncate">{email}</p>
              </div>
            </div>
          </div>

          {/* Role */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Rôle
            </p>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <Shield className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    badge.bg,
                    badge.text
                  )}
                >
                  {getRoleLabel(role)}
                </span>
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  {role}
                </p>
              </div>
            </div>
          </div>

          {/* Account status */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Statut du compte
            </p>
            <div className="space-y-1.5">
              {/* Active status */}
              <div className="flex items-center gap-1.5">
                {isActive ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-xs text-green-700 font-medium">Actif</span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    <span className="text-xs text-red-700 font-medium">Désactivé</span>
                  </>
                )}
              </div>

              {/* Profile status */}
              <div className="flex items-center gap-1.5">
                {hasProfile ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-xs text-green-700 font-medium">Profil complet</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3 text-amber-600" />
                    <span className="text-xs text-amber-700 font-medium">Profil auto-créé</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Disabled account warning */}
      {!isActive && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-900 text-sm">Compte désactivé</p>
            <p className="text-xs text-red-700 mt-0.5">
              Votre compte a été désactivé. Contactez un administrateur.
            </p>
          </div>
        </div>
      )}

      {/* Modules coming soon */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h3 className="font-semibold text-sm">Modules disponibles prochainement</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            "Produits",
            "Commandes",
            "Scanner",
            "Call Center",
            "Retours",
            "Livraison",
            "Publicités",
            "Dépenses",
            "Rapports",
          ].map((module) => (
            <div
              key={module}
              className="rounded-lg border border-dashed px-3 py-2.5 text-center"
            >
              <p className="text-xs text-muted-foreground">{module}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
