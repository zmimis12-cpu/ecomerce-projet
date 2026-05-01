import { LogOut, User } from "lucide-react";
import { logout } from "@/app/admin/actions";
import { getRoleBadge, getRoleLabel } from "@/lib/auth/roles";
import type { UserRole } from "@/types/database";
import { cn } from "@/lib/utils";

interface AdminHeaderProps {
  displayName: string;
  email: string;
  role: UserRole | string;
}

export function AdminHeader({ displayName, email, role }: AdminHeaderProps) {
  const badge = getRoleBadge(role);

  return (
    <header className="border-b bg-card px-6 py-3 flex items-center justify-between shrink-0">
      <h1 className="text-sm font-medium text-muted-foreground">
        Tableau de bord
      </h1>

      <div className="flex items-center gap-4">
        {/* Role badge */}
        <span
          className={cn(
            "hidden sm:inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
            badge.bg,
            badge.text
          )}
        >
          {getRoleLabel(role)}
        </span>

        {/* User info */}
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-medium leading-tight">{displayName}</p>
            <p className="text-xs text-muted-foreground leading-tight truncate max-w-[160px]">
              {email}
            </p>
          </div>
        </div>

        {/* Logout */}
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Déconnexion"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </form>
      </div>
    </header>
  );
}
