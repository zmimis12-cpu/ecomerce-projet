"use server";
/**
 * Nos livreurs propres (hors société de livraison) — nom, téléphone, prix par
 * livraison. Stockés dans app_settings.self_drivers (pas de migration).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";

export type SelfDriver = { id: string; name: string; phone: string; fee: number };

const MANAGER_ROLES = ["super_admin", "admin", "manager"] as const;

async function readDrivers(): Promise<SelfDriver[]> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "self_drivers").maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? (v as SelfDriver[]).filter((d) => d && d.id && d.name) : [];
  } catch { return []; }
}

export async function getSelfDrivers(): Promise<SelfDriver[]> {
  await requireRole([...MANAGER_ROLES]);
  return readDrivers();
}

export async function saveSelfDrivers(list: SelfDriver[]): Promise<{ success: boolean; error?: string; drivers?: SelfDriver[] }> {
  await requireRole([...MANAGER_ROLES]);
  const clean = (Array.isArray(list) ? list : []).slice(0, 50).map((d) => ({
    id:    String(d.id || Math.random().toString(36).slice(2, 10)).slice(0, 20),
    name:  String(d.name ?? "").trim().slice(0, 60),
    phone: String(d.phone ?? "").replace(/[^\d+]/g, "").slice(0, 15),
    fee:   Math.max(0, Math.round(Number(d.fee) || 0)),
  })).filter((d) => d.name);
  const { error } = await supabaseAdmin.from("app_settings").upsert(
    { key: "self_drivers", value: JSON.stringify(clean), category: "delivery", label: "Livreurs propres (nom, tél, prix livraison)" } as never,
    { onConflict: "key" },
  );
  if (error) return { success: false, error: error.message };
  return { success: true, drivers: clean };
}
