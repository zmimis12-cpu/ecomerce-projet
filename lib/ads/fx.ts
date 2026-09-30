/**
 * lib/ads/fx.ts — taux USD→MAD RÉEL, récupéré automatiquement à chaque synchro.
 * Source : open.er-api.com (taux du marché, mis à jour chaque jour), gardé en
 * cache 6 h dans app_settings. + frais bancaires optionnels (clé
 * meta_bank_fee_pct, ex: 2.5 = +2,5 %) si la banque ajoute des frais sur les
 * paiements en dollars. En cas d'échec : dernier taux connu, sinon 10.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

const CACHE_KEY = "fx_usd_mad_live";
const CACHE_MS = 6 * 3600_000;

async function readSetting(key: string) {
  const { data } = await supabaseAdmin.from("app_settings").select("value, updated_at").eq("key", key).maybeSingle();
  return data as { value: unknown; updated_at: string | null } | null;
}

async function writeSetting(key: string, value: number, label: string) {
  await supabaseAdmin.from("app_settings").upsert({
    key, value: String(value), category: "ads", label, updated_at: new Date().toISOString(),
  } as never, { onConflict: "key" });
}

export async function getUsdToMad(): Promise<{ rate: number; market: number; feePct: number; source: string }> {
  const [cached, fee] = await Promise.all([readSetting(CACHE_KEY), readSetting("meta_bank_fee_pct")]);
  const feePct = Number(fee?.value ?? 0) || 0;

  let market = Number(cached?.value) || 0;
  let source = "cache";
  const fresh = cached?.updated_at && Date.now() - new Date(cached.updated_at).getTime() < CACHE_MS;

  if (!market || !fresh) {
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
      const json = await res.json();
      const r = Number(json?.rates?.MAD);
      if (r > 5 && r < 20) {
        market = r;
        source = "live";
        await writeSetting(CACHE_KEY, r, "Taux USD→MAD du marché (auto)");
      }
    } catch { /* on garde le dernier taux connu */ }
  }

  if (!market) {
    const legacy = await readSetting("meta_usd_to_mad");
    market = Number(legacy?.value) || 10;
    source = "fallback";
  }

  const rate = Math.round(market * (1 + feePct / 100) * 10000) / 10000;
  // Garde l'ancienne clé à jour pour l'affichage dans Paramètres
  await writeSetting("meta_usd_to_mad", rate, "Taux USD→MAD appliqué à la pub Meta");
  return { rate, market, feePct, source };
}
