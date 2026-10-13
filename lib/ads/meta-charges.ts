/**
 * lib/ads/meta-charges.ts — ce que Meta a RÉELLEMENT prélevé sur ta carte
 * (historique de facturation « ad_account_billing_charge »), tous comptes.
 * Montants Meta hors taxe → on ajoute la TVA du compte à partir de sa date,
 * puis conversion USD→MAD (marché + frais banque). Server-only, cache 1 h.
 */
import { taxFactorFor, getUsdToMad } from "./fx";

const META = "https://graph.facebook.com/v21.0";

export type ChargedResult = { mad: number; usd: number; count: number; byAccount: { label: string; usd: number; mad: number }[]; error?: string };

export async function getMetaChargedMad(from?: string, to?: string): Promise<ChargedResult> {
  const { activeMetaAccounts, act } = await import("./meta-accounts");
  const accounts = await activeMetaAccounts();
  const fx = await getUsdToMad();
  const rate = fx.base; // marché × frais banque (sans TVA : ajoutée par compte ci-dessous)
  const out: ChargedResult = { mad: 0, usd: 0, count: 0, byAccount: [] };
  // un même compte peut être enregistré deux fois → on ne compte qu'une fois
  const seen = new Set<string>();
  for (const a of accounts) {
    const id = act(a);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    try {
      const tok = encodeURIComponent(a.token);
      const since = from ?? "2023-01-01";
      let next: string | undefined = `${META}/${id}/activities?fields=event_type,event_time,extra_data&limit=500&since=${since}` +
        (to ? `&until=${addDay(to)}` : "") + `&access_token=${tok}`;
      let usd = 0, mad = 0;
      for (let g = 0; next && g < 30; g++) {
        const res: Response = await fetch(next, { next: { revalidate: 3600 } });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
        for (const ev of (json.data ?? []) as { event_type: string; event_time: string; extra_data?: string }[]) {
          if (ev.event_type !== "ad_account_billing_charge") continue;
          const day = String(ev.event_time).slice(0, 10);
          if ((from && day < from) || (to && day > to)) continue;
          let cents = 0;
          try { cents = Number((JSON.parse(ev.extra_data ?? "{}") as { new_value?: number }).new_value ?? 0); } catch { /* ignore */ }
          if (!(cents > 0)) continue;
          const u = cents / 100;
          const f = taxFactorFor(day, { pct: Number(a.taxPct ?? 0), since: a.taxSince ?? null });
          usd += u * f;
          mad += u * f * rate;
          out.count++;
        }
        next = json.paging?.next;
      }
      out.usd += usd; out.mad += mad;
      out.byAccount.push({ label: a.label, usd: Math.round(usd * 100) / 100, mad: Math.round(mad * 100) / 100 });
    } catch (e) {
      out.error = (out.error ? out.error + " · " : "") + `${a.label}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  out.mad = Math.round(out.mad * 100) / 100;
  out.usd = Math.round(out.usd * 100) / 100;
  return out;
}

function addDay(d: string) {
  const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}
