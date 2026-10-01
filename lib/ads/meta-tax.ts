/**
 * lib/ads/meta-tax.ts — détecte si Meta ajoute une taxe (ex : TVA 20 %) à tes
 * paiements, en comparant CHAQUE prélèvement sur ta carte avec la dépense pub
 * réelle (heure par heure) entre deux prélèvements.
 *   sans taxe  : prélèvement ≈ dépense      (rapport ≈ 1,00)
 *   taxe 20 %  : prélèvement ≈ dépense × 1,2 (rapport ≈ 1,20)
 * Server-only. Résultat mis en cache 1 h.
 */
import { readSettings } from "./sync-core";

const META = "https://graph.facebook.com/v21.0";

export type TaxVerdict = "none" | "tax" | "missing" | "unclear";
export type ChargeRow = { time: string; amountUsd: number; spendUsd: number; ratio: number | null; verdict: TaxVerdict };
export type TaxReport = {
  paidUsd: number; unbilledUsd: number; spendUsd: number; ratio: number | null;
  verdict: TaxVerdict; estimatedTaxPct: number | null; since: string | null; charges: ChargeRow[];
  recentRatio: number | null;   // 30 derniers jours
  taxAlert: boolean;            // taxe détectée de façon fiable (pas un prélèvement isolé)
  missingUsd: number;           // dépense non couverte par un prélèvement (paiement échoué ?)
};

export function verdictOf(ratio: number | null): TaxVerdict {
  if (ratio == null || !Number.isFinite(ratio)) return "unclear";
  if (ratio >= 1.12) return "tax";
  if (ratio >= 0.85) return "none";
  if (ratio < 0.6) return "missing";   // dépense ≈ 2× le prélèvement → un paiement manque
  return "unclear";
}

async function getAll(url: string) {
  const out: Record<string, unknown>[] = [];
  let next: string | undefined = url;
  for (let g = 0; next && g < 30; g++) {
    const res: Response = await fetch(next, { next: { revalidate: 3600 } });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
    out.push(...((json.data ?? []) as Record<string, unknown>[]));
    next = json.paging?.next;
  }
  return out;
}

export async function getMetaTaxReport(): Promise<TaxReport | { error: string }> {
  const s = await readSettings("meta");
  if (!s?.access_token || !s.account_id) return { error: "Meta non configuré" };
  const acc = s.account_id.startsWith("act_") ? s.account_id : `act_${s.account_id}`;
  const tok = encodeURIComponent(s.access_token);
  try {
    // 1. Prélèvements sur la carte (historique de facturation)
    const acts = await getAll(`${META}/${acc}/activities?fields=event_type,event_time,extra_data&limit=500&since=2023-01-01&access_token=${tok}`);
    const charges = acts
      .filter((a) => a.event_type === "ad_account_billing_charge")
      .map((a) => {
        const x = JSON.parse(String(a.extra_data ?? "{}")) as { new_value?: number };
        return { time: String(a.event_time), amountUsd: Number(x.new_value ?? 0) / 100 };
      })
      .filter((c) => c.amountUsd > 0)
      .sort((x, y) => x.time.localeCompare(y.time));

    const accInfo = await (await fetch(`${META}/${acc}?fields=balance,timezone_offset_hours_utc&access_token=${tok}`, { next: { revalidate: 3600 } })).json();
    const unbilledUsd = Number(accInfo.balance ?? 0) / 100;
    const tzOffset = Number(accInfo.timezone_offset_hours_utc ?? 0);
    if (!charges.length) return { paidUsd: 0, unbilledUsd, spendUsd: 0, ratio: null, verdict: "unclear", estimatedTaxPct: null, since: null, charges: [], recentRatio: null, taxAlert: false, missingUsd: 0 };

    // 2. Dépense heure par heure depuis le premier prélèvement (avec la veille)
    const first = new Date(charges[0].time);
    first.setUTCDate(first.getUTCDate() - 1);
    const since = first.toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);
    const hours = await getAll(`${META}/${acc}/insights?fields=spend&breakdowns=hourly_stats_aggregated_by_advertiser_time_zone&time_increment=1&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&limit=500&access_token=${tok}`);
    const hourly = hours.map((h) => {
      const hh = Number(String(h.hourly_stats_aggregated_by_advertiser_time_zone).slice(0, 2));
      const start = Date.parse(`${h.date_start}T00:00:00Z`) + (hh - tzOffset) * 3600_000;
      return { start, spend: Number(h.spend ?? 0) };
    });
    const spendBetween = (a: number, b: number) => hourly.reduce((sum, h) => {
      const overlap = Math.max(0, Math.min(b, h.start + 3600_000) - Math.max(a, h.start));
      return sum + h.spend * (overlap / 3600_000);
    }, 0);

    // 3. Pour chaque prélèvement : dépense depuis le prélèvement précédent
    const rows: ChargeRow[] = [];
    let prev = Date.parse(charges[0].time) - 30 * 86400_000; // 1er : on ne connaît pas le début → peu fiable
    for (let i = 0; i < charges.length; i++) {
      const t = Date.parse(charges[i].time);
      const spend = spendBetween(prev, t);
      const ratio = i === 0 || spend < 1 ? null : charges[i].amountUsd / spend;
      rows.push({ time: charges[i].time, amountUsd: charges[i].amountUsd, spendUsd: Math.round(spend * 100) / 100, ratio, verdict: i === 0 ? "unclear" : verdictOf(ratio) });
      prev = t;
    }

    // 4. Global : tout ce qui a été payé + pas encore facturé vs toute la dépense
    // (le 1er prélèvement couvre une dépense d'avant la période mesurée → exclu)
    const paidUsd = charges.slice(1).reduce((s2, c) => s2 + c.amountUsd, 0);
    const spendUsd = spendBetween(Date.parse(charges[0].time), Date.now());
    const ratio = spendUsd > 0 ? (paidUsd + unbilledUsd) / spendUsd : null;
    const verdict = verdictOf(ratio);

    // 30 derniers jours (une taxe peut commencer récemment)
    const cut = Date.now() - 30 * 86400_000;
    const recent = charges.filter((c) => Date.parse(c.time) >= cut);
    const recentStart = recent.length ? Date.parse(charges[Math.max(0, charges.indexOf(recent[0]) - 1)].time) : cut;
    const recentSpend = spendBetween(recentStart, Date.now());
    const recentRatio = recentSpend > 5 ? (recent.reduce((a, c) => a + c.amountUsd, 0) + unbilledUsd) / recentSpend : null;
    // Alerte seulement si c'est confirmé : 3 prélèvements de suite avec taxe, ou les 30 derniers jours
    const last3 = rows.slice(-3);
    const taxAlert = (last3.length === 3 && last3.every((r) => r.verdict === "tax")) || (recentRatio != null && recentRatio >= 1.12);
    const missingUsd = Math.max(0, Math.round((spendUsd - paidUsd - unbilledUsd) * 100) / 100);

    return {
      recentRatio, taxAlert, missingUsd,
      paidUsd: Math.round(paidUsd * 100) / 100, unbilledUsd, spendUsd: Math.round(spendUsd * 100) / 100,
      ratio, verdict, estimatedTaxPct: verdict === "tax" && ratio ? Math.round((ratio - 1) * 100) : null,
      since: charges[0].time, charges: rows.reverse(),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
