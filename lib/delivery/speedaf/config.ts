/** Réglages Speedaf — app_settings.speedaf_config (server-only). */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_SPEEDAF_CONFIG, type SpeedafConfig } from "./types";

export async function readSpeedafConfig(): Promise<SpeedafConfig> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "speedaf_config").maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value;
  let v: Partial<SpeedafConfig> = {};
  try { v = (typeof raw === "string" ? JSON.parse(raw) : raw) ?? {}; } catch { /* défauts */ }
  return { ...DEFAULT_SPEEDAF_CONFIG, ...v };
}

export async function writeSpeedafConfig(cfg: SpeedafConfig) {
  return supabaseAdmin.from("app_settings").upsert(
    { key: "speedaf_config", value: JSON.stringify(cfg), category: "delivery", label: "Speedaf (API)" } as never,
    { onConflict: "key" },
  );
}

/** Ligne delivery_companies « speedaf » (créée au besoin) → id utilisé sur les commandes. */
export async function ensureSpeedafCompanyId(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("delivery_companies").select("id").eq("slug", "speedaf").maybeSingle();
  if (data) return (data as { id: string }).id;
  const { data: created } = await supabaseAdmin.from("delivery_companies")
    .insert({ name: "Speedaf", slug: "speedaf", api_base_url: "https://apis.speedaf.com", is_active: true, config: {} } as never)
    .select("id").maybeSingle();
  return (created as { id: string } | null)?.id ?? null;
}

export async function getSpeedafCompanyId(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("delivery_companies").select("id").eq("slug", "speedaf").maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
