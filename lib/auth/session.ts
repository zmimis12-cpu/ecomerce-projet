/**
 * lib/auth/session.ts
 * Server-side session and profile helpers.
 * Server-only — never import in "use client" components.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppUser, UserRole, SessionUser } from "@/types/database";

// Re-export so callers import from one place
export type { SessionUser };

// ─── Core helpers ──────────────────────────────────────────────────────────────

/**
 * getSession()
 * Returns the current auth user + public.users profile.
 * Returns null if not authenticated. Never throws.
 */
export async function getSession(): Promise<SessionUser | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;

    const { data: profile } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    const appProfile = profile as AppUser | null;

    return {
      authId: user.id,
      authEmail: user.email ?? "",
      profile: appProfile,
      role: (appProfile?.role ?? "viewer") as UserRole,
      displayName: appProfile?.full_name ?? user.email ?? "Utilisateur",
      hasProfile: appProfile !== null,
    };
  } catch {
    return null;
  }
}

/**
 * requireUser()
 * Returns session or redirects to /login.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * requireAdmin()
 * Returns session if super_admin or admin, otherwise redirects.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["super_admin", "admin"].includes(session.role)) {
    redirect("/admin?error=unauthorized");
  }
  return session;
}

/**
 * requireRole(allowedRoles)
 * Returns session if user has one of the allowed roles, otherwise redirects.
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!allowedRoles.includes(session.role)) {
    redirect("/admin?error=unauthorized");
  }
  return session;
}

/**
 * ensureProfile()
 * Fetches the profile. If missing, calls get_or_create_profile() DB function.
 * Returns a SessionUser with hasProfile=false if recovery also fails.
 * Used exclusively in the admin layout as a safety net.
 */
export async function ensureProfile(): Promise<SessionUser | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Happy path — profile exists
    const { data: profile } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profile) {
      const appProfile = profile as AppUser;
      return {
        authId: user.id,
        authEmail: user.email ?? "",
        profile: appProfile,
        role: appProfile.role as UserRole,
        displayName: appProfile.full_name,
        hasProfile: true,
      };
    }

    // Profile missing — call DB safety function
    const { data: recovered } = await supabase
      .rpc("get_or_create_profile" as string, { p_user_id: user.id } as unknown as undefined);

    const appProfile = recovered as AppUser | null;

    return {
      authId: user.id,
      authEmail: user.email ?? "",
      profile: appProfile,
      role: (appProfile?.role ?? "viewer") as UserRole,
      displayName: appProfile?.full_name ?? user.email ?? "Utilisateur",
      hasProfile: appProfile !== null,
    };
  } catch {
    return null;
  }
}
