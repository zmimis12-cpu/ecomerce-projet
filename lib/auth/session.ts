/**
 * lib/auth/session.ts — v4 FINAL
 * RLS fix confirmed: policies on public.users must not call current_user_role()
 * which itself queries public.users — causes infinite recursion (42P17).
 * Safe policy: auth.uid() = id only.
 */
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AppUser, UserRole, SessionUser } from "@/types/database";

export type { SessionUser };

// cache() deduplicates this call within a single server render pass.
// Layout calls ensureProfile(), page calls requireUser() — same userId → one DB query.
const fetchProfile = cache(async function fetchProfile(userId: string): Promise<AppUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, role, is_active, avatar_url, phone, metadata, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[session] fetchProfile error:", error.message, "code:", error.code);
    return null;
  }
  return data as AppUser | null;
});

export async function getSession(): Promise<SessionUser | null> {
  try {
    const supabase = await createClient();
    const timeout = new Promise<{ data: { user: null }; error: null }>((resolve) =>
      setTimeout(() => resolve({ data: { user: null }, error: null }), 5000)
    );
    const { data: { user }, error } = await Promise.race([
      supabase.auth.getUser(),
      timeout,
    ]) as Awaited<ReturnType<typeof supabase.auth.getUser>>;
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

    // Timeout protection — if Supabase hangs, treat as unauthenticated
    const timeout = new Promise<{ data: { user: null } }>((resolve) =>
      setTimeout(() => resolve({ data: { user: null } }), 5000)
    );
    const { data: { user } } = await Promise.race([
      supabase.auth.getUser(),
      timeout,
    ]) as Awaited<ReturnType<typeof supabase.auth.getUser>>;

    if (!user) return null;

    let profile = await fetchProfile(user.id);
    let wasCreated = false;

    if (!profile) {
      // Profile missing — insert via admin client then re-fetch
      const { supabaseAdmin } = await import("@/lib/supabase/admin");
      await supabaseAdmin.from("users" as never).upsert(
        { id: user.id, email: user.email, full_name: user.email, role: "viewer", is_active: true } as never,
        { onConflict: "id", ignoreDuplicates: true }
      );
      profile = await fetchProfile(user.id);
      wasCreated = true;
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
