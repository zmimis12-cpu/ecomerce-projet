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
    <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between border-b bg-card/80 py-3 pl-16 pr-4 backdrop-blur supports-[backdrop-filter]:bg-card/70 md:px-6">
      <div className="flex items-center gap-2 text-sm">
        <span className="h-2 w-2 rounded-full bg-brand shadow-[0_0_0_3px_hsl(var(--brand)/0.2)]" />
        <span className="font-semibold tracking-tight">HajtekZone</span>
        <span className="hidden text-muted-foreground sm:inline">· GestionPro</span>
      </div>

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
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F3D98B] to-[#A77A1E] text-xs font-bold text-neutral-900 ring-2 ring-brand/20">
            {(displayName || email || "?").trim().charAt(0).toUpperCase() || <User className="h-3.5 w-3.5" />}
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
