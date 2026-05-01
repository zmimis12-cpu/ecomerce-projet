/**
 * lib/auth/session.ts — v3
 * Fixed: use raw upsert via supabaseAdmin for profile creation (bypasses RLS + type stub issues).
 * Fixed: always re-fetch after any upsert so actual DB role is returned, never stale default.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AppUser, UserRole, SessionUser } from "@/types/database";

export type { SessionUser };

// ─── Fetch profile by auth UUID (fresh, no cache) ─────────────────────────────
async function fetchProfile(userId: string): Promise<AppUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, role, is_active, avatar_url, phone, metadata, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[session] fetchProfile error:", error.message);
    return null;
  }
  return data as AppUser | null;
}

// ─── Create missing profile then re-fetch ─────────────────────────────────────
// Uses supabaseAdmin to bypass RLS — only called when profile is confirmed missing.
// Re-fetches after insert so the ACTUAL role in the DB is returned.
async function createAndFetchProfile(
  userId: string,
  email: string
): Promise<{ profile: AppUser | null; wasCreated: boolean }> {
  // Use raw SQL upsert to avoid TypeScript stub inference issues
  const { error: upsertError } = await supabaseAdmin
    .from("users" as "shops") // cast to satisfy strict stub — admin client accepts any table
    .upsert(
      { id: userId, email, full_name: email, role: "viewer", is_active: true } as never,
      { onConflict: "id", ignoreDuplicates: true }
    );

  if (upsertError) {
    console.error("[session] createAndFetchProfile upsert error:", upsertError.message);
  }

  // ALWAYS re-fetch — if row already existed with super_admin, that comes back
  const profile = await fetchProfile(userId);
  return { profile, wasCreated: true };
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function getSession(): Promise<SessionUser | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;

    const profile = await fetchProfile(user.id);

    return {
      authId: user.id,
      authEmail: user.email ?? "",
      profile,
      role: (profile?.role ?? "viewer") as UserRole,
      displayName: profile?.full_name ?? user.email ?? "Utilisateur",
      hasProfile: profile !== null,
    };
  } catch (e) {
    console.error("[session] getSession error:", e);
    return null;
  }
}

export async function ensureProfile(): Promise<SessionUser | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    let profile = await fetchProfile(user.id);
    let wasCreated = false;

    if (!profile) {
      const result = await createAndFetchProfile(user.id, user.email ?? "");
      profile = result.profile;
      wasCreated = result.wasCreated;
    }

    return {
      authId: user.id,
      authEmail: user.email ?? "",
      profile,
      role: (profile?.role ?? "viewer") as UserRole,
      displayName: profile?.full_name ?? user.email ?? "Utilisateur",
      hasProfile: !wasCreated,
    };
  } catch (e) {
    console.error("[session] ensureProfile error:", e);
    return null;
  }
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
