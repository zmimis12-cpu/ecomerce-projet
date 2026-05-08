"use server";
/**
 * lib/settings/users-actions.ts
 * Server-side only user management.
 * Never exposes service role key to frontend.
 */
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/audit/audit-logger";

// All roles in the system
export type AppRole =
  | "super_admin" | "admin" | "manager" | "finance"
  | "scanner_agent" | "call_center_agent" | "media_buyer" | "viewer";

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin:       "Super Admin",
  admin:             "Admin",
  manager:           "Manager",
  finance:           "Finance",
  scanner_agent:     "Scanner",
  call_center_agent: "Call Center",
  media_buyer:       "Media Buyer",
  viewer:            "Viewer",
};

export const ROLE_COLORS: Record<AppRole, string> = {
  super_admin:       "bg-red-100 text-red-800",
  admin:             "bg-purple-100 text-purple-800",
  manager:           "bg-blue-100 text-blue-800",
  finance:           "bg-green-100 text-green-800",
  scanner_agent:     "bg-amber-100 text-amber-800",
  call_center_agent: "bg-orange-100 text-orange-800",
  media_buyer:       "bg-pink-100 text-pink-800",
  viewer:            "bg-gray-100 text-gray-600",
};

// Module access per role
export const ROLE_MODULES: Record<AppRole, string[]> = {
  super_admin:       ["dashboard","orders","stock","scanner","returns","finance","ads","call_center","digylog","settings","users","audit_logs"],
  admin:             ["dashboard","orders","stock","scanner","returns","finance","call_center","digylog","settings","users","audit_logs"],
  manager:           ["dashboard","orders","stock","scanner","returns","finance","call_center","digylog"],
  finance:           ["dashboard","finance","orders","digylog"],
  scanner_agent:     ["scanner","returns"],
  call_center_agent: ["call_center","orders"],
  media_buyer:       ["dashboard","ads","finance"],
  viewer:            ["dashboard","orders"],
};

export type UserRow = {
  id:         string;
  email:      string;
  full_name:  string;
  role:       AppRole;
  is_active:  boolean;
  created_at: string;
  last_sign_in?: string | null;
};

// ─── Get all users ─────────────────────────────────────────────────────────────
export async function getUsers(): Promise<UserRow[]> {
  const session = await requireRole(["super_admin", "admin"]);

  const { data } = await supabaseAdmin
    .from("users")
    .select("id, email, full_name, role, is_active, created_at")
    .order("role").order("full_name");

  const rows = (data ?? []) as UserRow[];

  // admin cannot see super_admins
  if (session.role === "admin") {
    return rows.filter((u) => u.role !== "super_admin");
  }
  return rows;
}

// ─── Create user (server-side only via Supabase Auth Admin) ───────────────────
export async function createUser(params: {
  email:     string;
  fullName:  string;
  role:      AppRole;
  password:  string;
}): Promise<{ success: boolean; error?: string }> {
  const session = await requireRole(["super_admin", "admin"]);

  // admin cannot create super_admin
  if (session.role === "admin" && params.role === "super_admin") {
    return { success: false, error: "Permission refusée — vous ne pouvez pas créer un super admin." };
  }

  // Create auth user via admin API
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email:    params.email,
    password: params.password,
    email_confirm: true,
    user_metadata: { full_name: params.fullName },
  });

  if (authError || !authUser.user) {
    return { success: false, error: authError?.message ?? "Erreur création utilisateur." };
  }

  // Upsert in users table
  const { error: dbError } = await supabaseAdmin.from("users").upsert({
    id:        authUser.user.id,
    email:     params.email,
    full_name: params.fullName,
    role:      params.role,
    is_active: true,
  } as never, { onConflict: "id" });

  if (dbError) {
    // Cleanup auth user if DB insert fails
    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
    return { success: false, error: dbError.message };
  }

  createAuditLog({
    userId:       session.authId,
    userLabel:    session.email,
    actionType:   "CREATE",
    entityType:   "user",
    entityId:     authUser.user.id,
    entityLabel:  params.email,
    newData:      { email: params.email, role: params.role, full_name: params.fullName },
    sourceModule: "settings_users",
  });

  revalidatePath("/admin/settings");
  return { success: true };
}

// ─── Update user role ──────────────────────────────────────────────────────────
export async function updateUserRole(userId: string, newRole: AppRole): Promise<{ success: boolean; error?: string }> {
  const session = await requireRole(["super_admin", "admin"]);

  // admin cannot assign super_admin role
  if (session.role === "admin" && newRole === "super_admin") {
    return { success: false, error: "Permission refusée." };
  }

  // Get current role for audit
  const { data: current } = await supabaseAdmin.from("users").select("role, email, full_name").eq("id", userId).maybeSingle();
  const cur = current as { role: string; email: string; full_name: string } | null;

  // admin cannot modify super_admin
  if (session.role === "admin" && cur?.role === "super_admin") {
    return { success: false, error: "Permission refusée — impossible de modifier un super admin." };
  }

  const { error } = await supabaseAdmin.from("users")
    .update({ role: newRole } as never).eq("id", userId);

  if (error) return { success: false, error: error.message };

  // Update Supabase Auth metadata too
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: { role: newRole },
  });

  createAuditLog({
    userId:       session.authId,
    userLabel:    session.email,
    actionType:   "UPDATE",
    entityType:   "user",
    entityId:     userId,
    entityLabel:  cur?.email ?? userId,
    oldData:      { role: cur?.role },
    newData:      { role: newRole },
    changedFields:["role"],
    sourceModule: "settings_users",
  });

  revalidatePath("/admin/settings");
  return { success: true };
}

// ─── Toggle user active status ────────────────────────────────────────────────
export async function toggleUserActive(userId: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
  const session = await requireRole(["super_admin", "admin"]);

  const { data: current } = await supabaseAdmin.from("users")
    .select("role, email").eq("id", userId).maybeSingle();
  const cur = current as { role: string; email: string } | null;

  if (session.role === "admin" && cur?.role === "super_admin") {
    return { success: false, error: "Permission refusée." };
  }

  // Update DB
  const { error } = await supabaseAdmin.from("users")
    .update({ is_active: isActive } as never).eq("id", userId);
  if (error) return { success: false, error: error.message };

  // Ban/unban in Supabase Auth
  if (!isActive) {
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: "876600h", // 100 years = effectively disabled
    });
  } else {
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: "none",
    });
  }

  createAuditLog({
    userId:       session.authId,
    userLabel:    session.email,
    actionType:   "UPDATE",
    entityType:   "user",
    entityId:     userId,
    entityLabel:  cur?.email ?? userId,
    oldData:      { is_active: !isActive },
    newData:      { is_active: isActive },
    changedFields:["is_active"],
    sourceModule: "settings_users",
  });

  revalidatePath("/admin/settings");
  return { success: true };
}

// ─── Delete user ───────────────────────────────────────────────────────────────
export async function deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
  const session = await requireRole(["super_admin"]);

  const { data: current } = await supabaseAdmin.from("users")
    .select("email, role").eq("id", userId).maybeSingle();
  const cur = current as { email: string; role: string } | null;

  // Cannot delete yourself
  if (userId === session.authId) {
    return { success: false, error: "Vous ne pouvez pas supprimer votre propre compte." };
  }

  await supabaseAdmin.auth.admin.deleteUser(userId);
  await supabaseAdmin.from("users").delete().eq("id", userId);

  createAuditLog({
    userId:       session.authId,
    userLabel:    session.email,
    actionType:   "DELETE",
    entityType:   "user",
    entityId:     userId,
    entityLabel:  cur?.email ?? userId,
    oldData:      { email: cur?.email, role: cur?.role },
    sourceModule: "settings_users",
  });

  revalidatePath("/admin/settings");
  return { success: true };
}
