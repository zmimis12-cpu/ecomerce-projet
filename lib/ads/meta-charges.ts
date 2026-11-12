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

  // ⚡ Tous les comptes EN PARALLÈLE ; requête limitée à la période (gardée en cache 15 min).
  // la réponse est gardée en cache 15 min → changer le filtre de dates ne rappelle plus Meta,
  // on filtre les dates ici. Avant : 1 appel par compte, l'un après l'autre, à chaque filtre.
  const results = await Promise.all(list.map(async (a) => {
    const id = act(a)!;
    try {
      // Longue période (> 62 j ou « depuis le début ») : l'historique Meta est trop lourd (pages qui expirent) → dépense du compte
      const days = from && to ? (Date.parse(to) - Date.parse(from)) / 86400000 : Infinity;
      if (days > 62) throw new Error("longue période");
      const tok = encodeURIComponent(a.token);
      // ⚡ Seulement la période demandée (±2 jours) : avant, tout l'historique depuis 2023 (des dizaines de pages,
      // réponse trop grosse pour le cache → rappel de Meta à chaque ouverture du dashboard).
      const shift = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
      const since = from ? shift(from, -2) : "2023-01-01";
      const until = to ? `&until=${shift(to, 2)}` : "";
      let next: string | undefined = `${META}/${id}/activities?fields=event_type,event_time,extra_data&limit=100&since=${since}${until}&access_token=${tok}`;
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
      // Meta refuse parfois l'historique d'un compte très modifié (« unexpected error ») :
      // on prend alors la DÉPENSE du compte sur la période (≈ ce qui sera prélevé) au lieu de l'oublier.
      try {
        const tok = encodeURIComponent(a.token);
        const today = new Date().toISOString().slice(0, 10);
        const min = new Date(); min.setUTCMonth(min.getUTCMonth() - 36); const minDay = min.toISOString().slice(0, 10); // Meta : 37 mois max
        const tr = encodeURIComponent(JSON.stringify({ since: from && from > minDay ? from : minDay, until: to ?? today }));
        const res: Response = await fetch(`${META}/${id}/insights?fields=spend&time_range=${tr}&access_token=${tok}`, { next: { revalidate: 900, tags: ["meta-charges"] } });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
        const spend = Number(json.data?.[0]?.spend ?? 0);
        const f = taxFactorFor(to ?? today, { pct: Number(a.taxPct ?? 0), since: a.taxSince ?? null });
        return { label: `${a.label} (≈ dépense)`, usd: spend * f, mad: spend * f * rate, count: 0, error: null as string | null };
      } catch {
        return { label: a.label, usd: 0, mad: 0, count: 0, error: `${a.label}: ${e instanceof Error ? e.message : String(e)}` };
      }
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


