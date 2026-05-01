/**
 * lib/auth/roles.ts
 * Role utilities — pure functions, no DB calls, no side effects.
 * Safe to import in both server and client components.
 */
import type { UserRole } from "@/types/database";

// ─── Role hierarchy ────────────────────────────────────────────────────────────
// Ordered from highest to lowest privilege.
// Used for hasRoleOrAbove() comparisons.
export const ROLE_HIERARCHY: UserRole[] = [
  "super_admin",
  "admin",
  "manager",
  "finance",
  "call_center_agent",
  "scanner_agent",
  "viewer",
  // Legacy values — treated as lowest privilege
  "agent",
  "accountant",
  "warehouse",
  "readonly",
];

// ─── Human-readable labels ─────────────────────────────────────────────────────
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin:       "Super Administrateur",
  admin:             "Administrateur",
  manager:           "Manager",
  finance:           "Finance",
  call_center_agent: "Agent Call Center",
  scanner_agent:     "Agent Scanner",
  viewer:            "Lecteur",
  // Legacy
  agent:             "Agent (legacy)",
  accountant:        "Comptable (legacy)",
  warehouse:         "Entrepôt (legacy)",
  readonly:          "Lecture seule (legacy)",
};

// ─── Role badge colors (Tailwind classes) ──────────────────────────────────────
export const ROLE_BADGE: Record<UserRole, { bg: string; text: string }> = {
  super_admin:       { bg: "bg-purple-100",  text: "text-purple-800" },
  admin:             { bg: "bg-blue-100",    text: "text-blue-800" },
  manager:           { bg: "bg-indigo-100",  text: "text-indigo-800" },
  finance:           { bg: "bg-amber-100",   text: "text-amber-800" },
  call_center_agent: { bg: "bg-teal-100",    text: "text-teal-800" },
  scanner_agent:     { bg: "bg-green-100",   text: "text-green-800" },
  viewer:            { bg: "bg-gray-100",    text: "text-gray-600" },
  agent:             { bg: "bg-gray-100",    text: "text-gray-500" },
  accountant:        { bg: "bg-gray-100",    text: "text-gray-500" },
  warehouse:         { bg: "bg-gray-100",    text: "text-gray-500" },
  readonly:          { bg: "bg-gray-100",    text: "text-gray-500" },
};

// ─── Core predicate ────────────────────────────────────────────────────────────

/**
 * Returns true if `userRole` is in the `allowedRoles` list.
 * The primary role check — used in all route guards and UI conditionals.
 *
 * @example
 *   hasRole(user.role, ["admin", "super_admin"])  // → true/false
 */
export function hasRole(
  userRole: UserRole | string | null | undefined,
  allowedRoles: UserRole[]
): boolean {
  if (!userRole) return false;
  return allowedRoles.includes(userRole as UserRole);
}

/**
 * Returns true if the user has admin-level access:
 * super_admin or admin.
 */
export function isAdminRole(userRole: UserRole | string | null | undefined): boolean {
  return hasRole(userRole, ["super_admin", "admin"]);
}

/**
 * Returns true if the user has manager-level access or above:
 * super_admin, admin, or manager.
 */
export function isManagerOrAbove(userRole: UserRole | string | null | undefined): boolean {
  return hasRole(userRole, ["super_admin", "admin", "manager"]);
}

/**
 * Returns true if the user has finance access:
 * super_admin, admin, manager, or finance.
 */
export function hasFinanceAccess(userRole: UserRole | string | null | undefined): boolean {
  return hasRole(userRole, ["super_admin", "admin", "manager", "finance"]);
}

/**
 * Returns true if the user can access call center features.
 */
export function hasCallCenterAccess(userRole: UserRole | string | null | undefined): boolean {
  return hasRole(userRole, ["super_admin", "admin", "manager", "call_center_agent"]);
}

/**
 * Returns true if the user can access scanner features.
 */
export function hasScannerAccess(userRole: UserRole | string | null | undefined): boolean {
  return hasRole(userRole, ["super_admin", "admin", "manager", "scanner_agent"]);
}

/**
 * Returns the index of a role in the hierarchy (lower = more privileged).
 * Returns 999 for unknown roles.
 */
export function roleRank(userRole: UserRole | string): number {
  const idx = ROLE_HIERARCHY.indexOf(userRole as UserRole);
  return idx === -1 ? 999 : idx;
}

/**
 * Returns true if `userRole` is at the same level or above `minimumRole`
 * in the defined hierarchy.
 *
 * @example
 *   hasRoleOrAbove("admin", "manager")    // → true  (admin outranks manager)
 *   hasRoleOrAbove("viewer", "manager")   // → false
 */
export function hasRoleOrAbove(
  userRole: UserRole | string | null | undefined,
  minimumRole: UserRole
): boolean {
  if (!userRole) return false;
  return roleRank(userRole as UserRole) <= roleRank(minimumRole);
}

/**
 * Returns the human-readable label for a role.
 */
export function getRoleLabel(userRole: UserRole | string | null | undefined): string {
  if (!userRole) return "Inconnu";
  return ROLE_LABELS[userRole as UserRole] ?? userRole;
}

/**
 * Returns the badge styling for a role.
 */
export function getRoleBadge(userRole: UserRole | string | null | undefined) {
  const fallback = { bg: "bg-gray-100", text: "text-gray-500" };
  if (!userRole) return fallback;
  return ROLE_BADGE[userRole as UserRole] ?? fallback;
}
