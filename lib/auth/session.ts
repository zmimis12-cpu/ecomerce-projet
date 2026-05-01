/**
 * lib/auth/session.ts — DEBUG VERSION
 * All errors surfaced. No auto-create fallback. No silent catches.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole, SessionUser } from "@/types/database";

export type { SessionUser };

export interface DebugSession {
  authId: string | null;
  authEmail: string | null;
  authError: string | null;
  profileId: string | null;
  profileEmail: string | null;
  profileRole: string | null;
  profileIsActive: boolean | null;
  profileFetchError: string | null;
  profileFetchStatus: "found" | "not_found" | "error" | "no_auth";
  hasProfile: boolean;
  supabaseUrl: string;
  role: UserRole;
  displayName: string;
}

/**
 * getDebugSession()
 * Returns ALL raw data from Supabase — no fallbacks, no silent errors.
 * Used by debug page and temporarily by admin layout.
 */
export async function getDebugSession(): Promise<DebugSession> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "NOT_SET";

  // Step 1 — get auth user
  let authId: string | null = null;
  let authEmail: string | null = null;
  let authError: string | null = null;

  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) authError = error.message;
    authId = user?.id ?? null;
    authEmail = user?.email ?? null;
  } catch (e) {
    authError = String(e);
  }

  if (!authId) {
    return {
      authId, authEmail, authError,
      profileId: null, profileEmail: null, profileRole: null,
      profileIsActive: null,
      profileFetchError: null,
      profileFetchStatus: "no_auth",
      hasProfile: false,
      supabaseUrl,
      role: "viewer",
      displayName: "Unknown",
    };
  }

  // Step 2 — fetch public.users by id — NO fallback, NO auto-create
  let profileId: string | null = null;
  let profileEmail: string | null = null;
  let profileRole: string | null = null;
  let profileIsActive: boolean | null = null;
  let profileFetchError: string | null = null;
  let profileFetchStatus: DebugSession["profileFetchStatus"] = "not_found";

  try {
    const supabase = await createClient();
    const { data, error, status, statusText } = await supabase
      .from("users")
      .select("id, email, full_name, role, is_active")
      .eq("id", authId)
      .maybeSingle();

    if (error) {
      profileFetchError = `[${status} ${statusText}] ${error.message} | code: ${error.code} | hint: ${error.hint ?? "none"} | details: ${error.details ?? "none"}`;
      profileFetchStatus = "error";
    } else if (!data) {
      profileFetchStatus = "not_found";
      profileFetchError = `No row in public.users where id = '${authId}'`;
    } else {
      const row = data as Record<string, unknown>;
      profileId = String(row.id);
      profileEmail = String(row.email);
      profileRole = String(row.role);
      profileIsActive = Boolean(row.is_active);
      profileFetchStatus = "found";
    }
  } catch (e) {
    profileFetchError = `Exception: ${String(e)}`;
    profileFetchStatus = "error";
  }

  return {
    authId,
    authEmail,
    authError,
    profileId,
    profileEmail,
    profileRole,
    profileIsActive,
    profileFetchError,
    profileFetchStatus,
    hasProfile: profileFetchStatus === "found",
    supabaseUrl,
    role: (profileRole ?? "viewer") as UserRole,
    displayName: profileEmail ?? authEmail ?? "Unknown",
  };
}

/**
 * getSession() — wraps getDebugSession for normal use
 */
export async function getSession(): Promise<SessionUser | null> {
  const debug = await getDebugSession();
  if (!debug.authId) return null;
  return {
    authId: debug.authId,
    authEmail: debug.authEmail ?? "",
    profile: null,
    role: debug.role,
    displayName: debug.displayName,
    hasProfile: debug.hasProfile,
  };
}

export async function ensureProfile(): Promise<SessionUser | null> {
  // During debug: same as getSession — NO auto-create
  return getSession();
}

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["super_admin", "admin"].includes(session.role)) redirect("/admin?error=unauthorized");
  return session;
}

export async function requireRole(allowedRoles: UserRole[]): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!allowedRoles.includes(session.role)) redirect("/admin?error=unauthorized");
  return session;
}
