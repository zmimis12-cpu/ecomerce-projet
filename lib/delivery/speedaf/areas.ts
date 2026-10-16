/**
 * Villes Speedaf (Maroc) + correspondance avec les villes de nos commandes (liste Digylog).
 * L'arbre Speedaf (12 régions, ~800 villes, ~2000 quartiers) est mis en cache dans
 * app_settings.speedaf_areas (rafraîchi chaque semaine).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SpeedafClient, type SpeedafArea } from "./client";
import type { SpeedafConfig } from "./types";

export type SpeedafCity = { province: string; city: string; districts: string[] };
export type ResolvedCity = { province: string; city: string; district: string; how: "map" | "exact" | "fuzzy" };

let memo: { at: number; list: SpeedafCity[] } | null = null;

export async function getSpeedafCities(cfg: SpeedafConfig, force = false): Promise<SpeedafCity[]> {
  if (!force && memo && Date.now() - memo.at < 3600_000) return memo.list;
  if (!force) {
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "speedaf_areas").maybeSingle();
    const raw = (data as { value?: unknown } | null)?.value;
    try {
      const v = (typeof raw === "string" ? JSON.parse(raw) : raw) as { at: string; list: SpeedafCity[] } | null;
      if (v?.list?.length && Date.now() - new Date(v.at).getTime() < 7 * 86400_000) {
        memo = { at: Date.now(), list: v.list };
        return v.list;
      }
    } catch { /* on recharge */ }
  }
  const r = await new SpeedafClient(cfg).getAreaTree();
  if (!r.ok) return memo?.list ?? [];
  const root = (Array.isArray(r.data) ? r.data[0] : r.data) as SpeedafArea;
  const list: SpeedafCity[] = [];
  for (const p of root?.children ?? []) {
    for (const c of p.children ?? []) {
      list.push({ province: p.name, city: c.name, districts: (c.children ?? []).map((d) => d.name).filter(Boolean) });
    }
  }
  if (list.length) {
    memo = { at: Date.now(), list };
    await supabaseAdmin.from("app_settings").upsert(
      { key: "speedaf_areas", value: JSON.stringify({ at: new Date().toISOString(), list }), category: "delivery", label: "Speedaf — villes (cache)" } as never,
      { onConflict: "key" },
    );
  }
  return list;
}

export function normCity(s: string): string {
  let x = s.replace(/\(.*?\)/g, " ").split(" - ")[0];
  x = x.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  x = x.replace(/ouled/g, "oulad").replace(/\bsidi\s+/g, "sidi").replace(/\bain\s+/g, "ain");
  return x.replace(/[^a-z0-9]/g, "");
}

/** Similarité 0..1 (Ratcliff/Obershelp simplifié via LCS par blocs) */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const match = (s1: string, s2: string): number => {
    if (!s1 || !s2) return 0;
    let best = 0, i1 = 0, i2 = 0;
    for (let i = 0; i < s1.length; i++) {
      for (let j = 0; j < s2.length; j++) {
        let k = 0;
        while (i + k < s1.length && j + k < s2.length && s1[i + k] === s2[j + k]) k++;
        if (k > best) { best = k; i1 = i; i2 = j; }
      }
    }
    if (!best) return 0;
    return best + match(s1.slice(0, i1), s2.slice(0, i2)) + match(s1.slice(i1 + best), s2.slice(i2 + best));
  };
  return (2 * match(a, b)) / (a.length + b.length);
}

type Cand = { key: string; province: string; city: string; district: string | null };
function candidates(list: SpeedafCity[]): Cand[] {
  const out: Cand[] = [];
  for (const c of list) {
    out.push({ key: normCity(c.city), province: c.province, city: c.city, district: null });
    for (const d of c.districts) out.push({ key: normCity(d), province: c.province, city: c.city, district: d });
  }
  return out;
}

/** Trouve la ville Speedaf correspondant à la ville de la commande. */
export function resolveCity(name: string, list: SpeedafCity[], manualMap: Record<string, string> = {}): ResolvedCity | null {
  const key = normCity(name);
  const mapped = manualMap[key];
  if (mapped) {
    const c = list.find((x) => x.city === mapped);
    if (c) return { province: c.province, city: c.city, district: c.city, how: "map" };
  }
  const cands = candidates(list);
  const cities = cands.filter((c) => !c.district);
  // 1) ville exacte  2) ville très proche (Mohammadia ≈ MOHAMMEDIA)  3) quartier exact  4) le plus proche
  const exactCity = cities.find((c) => c.key === key);
  if (exactCity) return { province: exactCity.province, city: exactCity.city, district: exactCity.city, how: "exact" };
  const best = (pool: Cand[]) => {
    let b: Cand | null = null, sc = 0;
    for (const c of pool) { const s = similarity(key, c.key); if (s > sc) { sc = s; b = c; } }
    return { b, sc };
  };
  const nearCity = best(cities);
  if (nearCity.b && nearCity.sc >= 0.9) return { province: nearCity.b.province, city: nearCity.b.city, district: nearCity.b.city, how: "fuzzy" };
  const exactDistrict = cands.find((c) => c.district && c.key === key);
  if (exactDistrict) return { province: exactDistrict.province, city: exactDistrict.city, district: exactDistrict.district ?? exactDistrict.city, how: "exact" };
  const any = best(cands);
  if (any.b && any.sc >= 0.86) return { province: any.b.province, city: any.b.city, district: any.b.district ?? any.b.city, how: "fuzzy" };
  return null;
}

/** 5 villes Speedaf les plus proches (pour proposer un choix quand la ville n'est pas trouvée). */
export function suggestCities(name: string, list: SpeedafCity[], n = 5): string[] {
  const key = normCity(name);
  return list
    .map((c) => ({ c: c.city, s: similarity(key, normCity(c.city)) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.c);
}
