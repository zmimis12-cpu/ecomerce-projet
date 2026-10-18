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
  const list = accounts.filter((a) => { const id = act(a); if (!id || seen.has(id)) return false; seen.add(id); return true; });

  // ⚡ Tous les comptes EN PARALLÈLE, et toujours la MÊME requête (tout l'historique) :
  // la réponse est gardée en cache 15 min → changer le filtre de dates ne rappelle plus Meta,
  // on filtre les dates ici. Avant : 1 appel par compte, l'un après l'autre, à chaque filtre.
  const results = await Promise.all(list.map(async (a) => {
    const id = act(a)!;
    try {
      const tok = encodeURIComponent(a.token);
      let next: string | undefined = `${META}/${id}/activities?fields=event_type,event_time,extra_data&limit=500&since=2023-01-01&access_token=${tok}`;
      let usd = 0, mad = 0, count = 0;
      for (let g = 0; next && g < 30; g++) {
        const res: Response = await fetch(next, { next: { revalidate: 900, tags: ["meta-charges"] } });
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
          count++;
        }
        next = json.paging?.next;
      }
      return { label: a.label, usd, mad, count, error: null as string | null };
    } catch (e) {
      return { label: a.label, usd: 0, mad: 0, count: 0, error: `${a.label}: ${e instanceof Error ? e.message : String(e)}` };
    }
  }));
  for (const r of results) {
    if (r.error) { out.error = (out.error ? out.error + " · " : "") + r.error; continue; }
    out.usd += r.usd; out.mad += r.mad; out.count += r.count;
    out.byAccount.push({ label: r.label, usd: Math.round(r.usd * 100) / 100, mad: Math.round(r.mad * 100) / 100 });
  }
  out.mad = Math.round(out.mad * 100) / 100;
  out.usd = Math.round(out.usd * 100) / 100;
  return out;
}


