"use server";
/**
 * lib/settings/settings-service.ts
 * Centralized settings access.
 * Usage:
 *   const fee = await getSetting<number>("delivery_fee_casa", 20);
 *   await setSetting("delivery_fee_casa", 20);
 */
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";

// ─────────────────────────────────────────────────────────────────────────────
// Get a single setting
// ─────────────────────────────────────────────────────────────────────────────
export async function getSetting<T = unknown>(key: string, defaultValue?: T): Promise<T> {
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", key).maybeSingle();
  if (!data) return defaultValue as T;
  return (data as { value: T }).value ?? defaultValue as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Get all settings for a category
// ─────────────────────────────────────────────────────────────────────────────
export async function getSettingsByCategory(category: string): Promise<Record<string, unknown>> {
  const { data } = await supabaseAdmin
    .from("app_settings").select("key, value").eq("category", category);
  const result: Record<string, unknown> = {};
  for (const row of (data ?? []) as { key: string; value: unknown }[]) {
    result[row.key] = row.value;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Get all settings grouped by category
// ─────────────────────────────────────────────────────────────────────────────
export async function getAllSettings(): Promise<Record<string, Record<string, unknown>>> {
  const { data } = await supabaseAdmin
    .from("app_settings").select("key, value, category, label, description").order("category").order("key");
  const result: Record<string, Record<string, unknown>> = {};
  for (const row of (data ?? []) as { key: string; value: unknown; category: string; label: string }[]) {
    if (!result[row.category]) result[row.category] = {};
    result[row.category][row.key] = row.value;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Get all settings as flat array (for settings page)
// ─────────────────────────────────────────────────────────────────────────────
export async function getAllSettingsFlat(): Promise<{
  key: string; value: unknown; category: string; label: string | null; description: string | null;
}[]> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("key, value, category, label, description")
    .order("category").order("key");
  return (data ?? []) as { key: string; value: unknown; category: string; label: string | null; description: string | null }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Set a single setting
// ─────────────────────────────────────────────────────────────────────────────
export async function setSetting(key: string, value: unknown): Promise<{ success: boolean; error?: string }> {
  const session = await requireRole(["super_admin", "admin"]);
  const { error } = await supabaseAdmin
    .from("app_settings")
    .upsert({
      key,
      value: JSON.parse(JSON.stringify(value)) as never,
      updated_by: session.authId,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: "key" });

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Set multiple settings at once
// ─────────────────────────────────────────────────────────────────────────────
export async function setSettings(settings: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const session = await requireRole(["super_admin", "admin"]);
  const now = new Date().toISOString();
  const rows = Object.entries(settings).map(([key, value]) => ({
    key,
    value: JSON.parse(JSON.stringify(value)) as never,
    updated_by: session.authId,
    updated_at: now,
  }));

  const { error } = await supabaseAdmin
    .from("app_settings")
    .upsert(rows as never, { onConflict: "key" });

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed helpers for commonly used settings
// ─────────────────────────────────────────────────────────────────────────────
export async function getDeliverySettings() {
  const s = await getSettingsByCategory("delivery");
  return {
    deliveryFeeCasa:   Number(s.delivery_fee_casa   ?? 20),
    deliveryFeeOther:  Number(s.delivery_fee_other  ?? 35),
    deliveryFeeClient: Number(s.delivery_fee_client ?? 35),
    returnFeeDefault:  Number(s.return_fee_default  ?? 35),
  };
}

export async function getCallCenterSettings() {
  const s = await getSettingsByCategory("call_center");
  return {
    minCallDuration:    Number(s.cc_min_call_duration    ?? 20),
    commissionPerOrder: Number(s.cc_commission_per_order ?? 3),
    fakeRateThreshold:  Number(s.cc_fake_rate_threshold  ?? 20),
  };
}

export async function getFinanceSettings() {
  const s = await getSettingsByCategory("finance");
  return {
    packagingCost:        Number(s.packaging_cost_default   ?? 5),
    callCenterCost:       Number(s.call_center_cost_default ?? 3),
    overchargeThreshold:  Number(s.overcharge_threshold     ?? 5),
  };
}

export async function getScannerSettings() {
  const s = await getSettingsByCategory("scanner");
  return {
    soundsEnabled:  Boolean(s.scanner_sounds_enabled ?? true),
    fastMode:       Boolean(s.scanner_fast_mode      ?? true),
    autoProcess:    Boolean(s.scanner_auto_process   ?? false),
  };
}
