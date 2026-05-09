"use client";
import { useState, useTransition } from "react";
import {
  createUser, updateUserRole, toggleUserActive, deleteUser,
} from "@/lib/settings/users-actions";
import type { UserRow, AppRole } from "@/lib/settings/users-constants";
import {
  ROLE_LABELS, ROLE_COLORS, ROLE_MODULES, ALL_ROLES, ALL_MODULES,
} from "@/lib/settings/users-constants";
import { cn } from "@/lib/utils";
import {
  UserPlus, Shield, CheckCircle2, X, AlertTriangle,
  Eye, EyeOff, Trash2, ChevronDown,
} from "lucide-react";

// ALL_ROLES and ALL_MODULES imported from users-constants

export function UsersTab({ initialUsers }: { initialUsers: UserRow[] }) {
  const [users, setUsers]           = useState(initialUsers);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AppRole | "all">("all");
  const [isPending, startTransition]    = useTransition();
  const [msg, setMsg]               = useState<{ ok: boolean; text: string } | null>(null);

  // Create form state
  const [form, setForm] = useState({ email: "", fullName: "", role: "manager" as AppRole, password: "" });
  const [showPassword, setShowPassword] = useState(false);

  const filtered = selectedRole === "all" ? users : users.filter((u) => u.role === selectedRole);

  function flash(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  }

  function handleCreate() {
    if (!form.email || !form.fullName || !form.password) {
      flash(false, "Tous les champs sont obligatoires.");
      return;
    }
    startTransition(async () => {
      const res = await createUser({ email: form.email, fullName: form.fullName, role: form.role, password: form.password });
      if (res.success) {
        flash(true, `✓ Utilisateur ${form.email} créé.`);
        setForm({ email: "", fullName: "", role: "manager", password: "" });
        setShowCreate(false);
        // Refresh list
        window.location.reload();
      } else {
        flash(false, res.error ?? "Erreur.");
      }
    });
  }

  function handleRoleChange(userId: string, role: AppRole) {
    startTransition(async () => {
      const res = await updateUserRole(userId, role);
      if (res.success) {
        setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role } : u));
        flash(true, "✓ Rôle mis à jour.");
      } else {
        flash(false, res.error ?? "Erreur.");
      }
    });
  }

  function handleToggle(userId: string, current: boolean) {
    startTransition(async () => {
      const res = await toggleUserActive(userId, !current);
      if (res.success) {
        setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_active: !current } : u));
        flash(true, !current ? "✓ Utilisateur activé." : "✓ Utilisateur désactivé.");
      } else {
        flash(false, res.error ?? "Erreur.");
      }
    });
  }

  function handleDelete(userId: string, email: string) {
    if (!confirm(`Supprimer définitivement ${email} ?`)) return;
    startTransition(async () => {
      const res = await deleteUser(userId);
      if (res.success) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        flash(true, "✓ Utilisateur supprimé.");
      } else {
        flash(false, res.error ?? "Erreur.");
      }
    });
  }

  const [viewRole, setViewRole] = useState<AppRole | null>(null);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{users.length} utilisateur(s) — {users.filter((u) => u.is_active).length} actifs</p>
        </div>
        <div className="flex items-center gap-2">
          {msg && (
            <span className={cn("flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5",
              msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
              {msg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {msg.text}
            </span>
          )}
          <button type="button" onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">
            <UserPlus className="h-4 w-4" />
            Nouvel utilisateur
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-5 space-y-4">
          <h3 className="font-semibold text-sm">Créer un utilisateur</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Nom complet *</label>
              <input type="text" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Hicham Benali"
                className="w-full h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Email *</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="hicham@company.ma"
                className="w-full h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Rôle *</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AppRole })}
                className="w-full h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {ALL_ROLES.filter((r) => r !== "super_admin").map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Mot de passe *</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Min. 8 caractères"
                  className="w-full h-9 rounded-lg border bg-background px-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowCreate(false)}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-secondary transition-colors">
              Annuler
            </button>
            <button type="button" onClick={handleCreate} disabled={isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
              {isPending ? "Création…" : "Créer"}
            </button>
          </div>
        </div>
      )}

      {/* Role filter */}
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => setSelectedRole("all")}
          className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors",
            selectedRole === "all" ? "bg-primary text-primary-foreground" : "border hover:bg-secondary")}>
          Tous ({users.length})
        </button>
        {ALL_ROLES.map((role) => {
          const count = users.filter((u) => u.role === role).length;
          if (!count) return null;
          return (
            <button key={role} type="button" onClick={() => setSelectedRole(role)}
              className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors",
                selectedRole === role ? "bg-primary text-primary-foreground" : "border hover:bg-secondary")}>
              {ROLE_LABELS[role]} ({count})
            </button>
          );
        })}
      </div>

      {/* Users table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-secondary/30">
              {["Utilisateur","Rôle","Statut","Modules","Actions"].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((user) => (
              <tr key={user.id} className={cn("hover:bg-secondary/20 transition-colors", !user.is_active && "opacity-50")}>
                <td className="px-4 py-3">
                  <p className="font-medium text-sm">{user.full_name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </td>
                <td className="px-4 py-3">
                  <select value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value as AppRole)}
                    disabled={isPending || user.role === "super_admin"}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-semibold border-0 focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer disabled:cursor-default",
                      ROLE_COLORS[user.role]
                    )}>
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                    user.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", user.is_active ? "bg-green-500" : "bg-red-500")} />
                    {user.is_active ? "Actif" : "Désactivé"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => setViewRole(viewRole === user.role ? null : user.role)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Shield className="h-3.5 w-3.5" />
                    {ROLE_MODULES[user.role]?.length ?? 0} modules
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {viewRole === user.role && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {ALL_MODULES.map((mod) => {
                        const has = ROLE_MODULES[user.role]?.includes(mod);
                        return (
                          <span key={mod} className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium",
                            has ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400 line-through")}>
                            {mod}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {user.role !== "super_admin" && (
                      <button type="button"
                        onClick={() => handleToggle(user.id, user.is_active)}
                        disabled={isPending}
                        title={user.is_active ? "Désactiver" : "Activer"}
                        className="rounded p-1.5 hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40">
                        {user.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    )}
                    {user.role !== "super_admin" && (
                      <button type="button"
                        onClick={() => handleDelete(user.id, user.email)}
                        disabled={isPending}
                        title="Supprimer"
                        className="rounded p-1.5 hover:bg-red-100 transition-colors text-muted-foreground hover:text-red-600 disabled:opacity-40">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    {user.role === "super_admin" && (
                      <span className="text-xs text-muted-foreground">Protégé</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">Aucun utilisateur trouvé.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Roles legend */}
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Permissions par rôle</p>
        <div className="space-y-2">
          {ALL_ROLES.map((role) => (
            <div key={role} className="flex items-start gap-3">
              <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 w-32 justify-center", ROLE_COLORS[role])}>
                {ROLE_LABELS[role]}
              </span>
              <div className="flex flex-wrap gap-1">
                {ALL_MODULES.map((mod) => {
                  const has = ROLE_MODULES[role]?.includes(mod);
                  if (!has) return null;
                  return (
                    <span key={mod} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {mod}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
