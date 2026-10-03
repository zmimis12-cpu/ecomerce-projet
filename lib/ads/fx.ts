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

/** TVA / taxe facturée par Meta (non visible dans l'API) : saisie par toi. */
/** Taxe d'UN compte Meta : réglage propre au compte, sinon réglage général. */
export async function getAccountTaxConfig(acc: { taxPct?: number | null; taxSince?: string | null }) {
  if (acc.taxPct !== undefined && acc.taxPct !== null) return { pct: Number(acc.taxPct) || 0, since: acc.taxSince ?? null };
  return getMetaTaxConfig();
}

export async function getMetaTaxConfig(): Promise<{ pct: number; since: string | null }> {
  const [p, d] = await Promise.all([readSetting("meta_tax_pct"), readSetting("meta_tax_since")]);
  const pct = Number(p?.value ?? 0) || 0;
  const since = d?.value ? String(d.value).slice(0, 10) : null;
  return { pct, since };
}

export function taxFactorFor(day: string | null | undefined, cfg: { pct: number; since: string | null }) {
  if (!cfg.pct) return 1;
  const d = (day ?? new Date().toISOString()).slice(0, 10);
  return !cfg.since || d >= cfg.since ? 1 + cfg.pct / 100 : 1;
}

/**
 * Taux USD → MAD appliqué à la pub = marché × (1 + frais banque) × (1 + taxe Meta).
 * `day` (YYYY-MM-DD) : la taxe ne s'applique qu'à partir de sa date de début.
 */
export async function getUsdToMad(day?: string): Promise<{ rate: number; base: number; market: number; feePct: number; taxPct: number; source: string }> {
  const r = await getUsdToMadBase();
  const tax = await getMetaTaxConfig();
  const f = taxFactorFor(day, tax);
  return { ...r, base: r.rate, rate: Math.round(r.rate * f * 10000) / 10000, taxPct: f > 1 ? tax.pct : 0 };
}

async function getUsdToMadBase(): Promise<{ rate: number; market: number; feePct: number; source: string }> {
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
