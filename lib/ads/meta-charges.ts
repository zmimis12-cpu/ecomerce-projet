/**
 * lib/ads/meta-charges.ts — ce que Meta a RÉELLEMENT prélevé sur ta carte
 * (historique de facturation « ad_account_billing_charge »), tous comptes.
 * Montants Meta hors taxe → on ajoute la TVA du compte à partir de sa date,
 * puis conversion USD→MAD (marché + frais banque). Server-only.
 *
 * ⚡ Le dashboard ne parle plus à Meta : les prélèvements sont copiés en base
 * (app_settings « meta_charges_cache ») par la synchro de fond toutes les 15 min
 * (refreshMetaChargesCache, appelée par /api/cron/sync). Lecture = instantanée.
 * Si un compte n'a pas encore pu être lu, on prend sa dépense sur la période.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { taxFactorFor, getUsdToMad } from "./fx";

const META = "https://graph.facebook.com/v21.0";
const CACHE_KEY = "meta_charges_cache";
const USE_CHARGES_CACHE = false;

export type ChargedResult = { mad: number; usd: number; count: number; byAccount: { label: string; usd: number; mad: number }[]; error?: string };

type AccCache = { label: string; lastDay: string | null; charges: [string, number][]; error: string | null; at: string };
type Cache = { accounts: Record<string, AccCache>; updatedAt: string };

async function readCache(): Promise<Cache> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", CACHE_KEY).maybeSingle();
  let v = (data as { value?: unknown } | null)?.value;
  while (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  return (v as Cache) ?? { accounts: {}, updatedAt: "" };
}

const shift = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** Synchro de fond : relit les prélèvements récents de chaque compte (lecture incrémentale). */
export async function refreshMetaChargesCache(): Promise<{ ok: boolean; accounts: Record<string, string> }> {
  const { activeMetaAccounts, act } = await import("./meta-accounts");
  const accounts = await activeMetaAccounts();
  const cache = await readCache();
  const report: Record<string, string> = {};
  const seen = new Set<string>();
  const list = accounts.filter((a) => { const id = act(a); if (!id || seen.has(id)) return false; seen.add(id); return true; });

  await Promise.all(list.map(async (a) => {
    const id = act(a)!;
    const prev = cache.accounts[id];
    // 1re fois : depuis le début de l'activité ; ensuite seulement les 3 derniers jours
    const since = prev?.lastDay ? shift(prev.lastDay, -3) : "2025-01-01";
    try {
      const fresh: [string, number][] = [];
      let next: string | undefined = `${META}/${id}/activities?fields=event_type,event_time,extra_data&limit=100&since=${since}&access_token=${encodeURIComponent(a.token)}`;
      for (let g = 0; next && g < 80; g++) {
        const res: Response = await fetch(next, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
        for (const ev of (json.data ?? []) as { event_type: string; event_time: string; extra_data?: string }[]) {
          if (ev.event_type !== "ad_account_billing_charge") continue;
          let cents = 0;
          try { cents = Number((JSON.parse(ev.extra_data ?? "{}") as { new_value?: number }).new_value ?? 0); } catch { /* ignore */ }
          if (cents > 0) fresh.push([String(ev.event_time).slice(0, 10), cents / 100]);
        }
        next = json.paging?.next;
      }
      // anciens prélèvements d'AVANT la fenêtre relue + lecture fraîche de la fenêtre (pas de doublon)
      const kept = (prev?.charges ?? []).filter(([day]) => day < since);
      const charges = [...kept, ...fresh].sort((x, y) => x[0].localeCompare(y[0]));
      cache.accounts[id] = { label: a.label, lastDay: new Date().toISOString().slice(0, 10), charges, error: null, at: new Date().toISOString() };
      report[a.label] = `ok (${fresh.length} relus depuis ${since})`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      cache.accounts[id] = { label: a.label, lastDay: prev?.lastDay ?? null, charges: prev?.charges ?? [], error: msg, at: new Date().toISOString() };
      report[a.label] = `erreur : ${msg}`;
    }
  }));
  cache.updatedAt = new Date().toISOString();
  await supabaseAdmin.from("app_settings").upsert(
    { key: CACHE_KEY, value: JSON.stringify(cache), category: "ads", label: "Prélèvements Meta (copie auto)" } as never,
    { onConflict: "key" },
  );
  return { ok: true, accounts: report };
}

/** Dépense Meta d'un compte sur une période (secours si ses prélèvements ne sont pas encore lus). */
async function accountSpend(id: string, token: string, from?: string, to?: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const min = new Date(); min.setUTCMonth(min.getUTCMonth() - 36); const minDay = min.toISOString().slice(0, 10); // Meta : 37 mois max
  const tr = encodeURIComponent(JSON.stringify({ since: from && from > minDay ? from : minDay, until: to ?? today }));
  const res: Response = await fetch(`${META}/${id}/insights?fields=spend&time_range=${tr}&access_token=${encodeURIComponent(token)}`, { next: { revalidate: 900, tags: ["meta-charges"] } });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return Number(json.data?.[0]?.spend ?? 0);
}

// ── Copie de secours de la dépense JOURNALIÈRE de chaque compte ────────────────
// Si le token d'un compte expire (ou si on perd l'accès), sa dépense passée ne doit
// PAS disparaître du dashboard (sinon le profit devient faux d'un coup).
// → on garde en base la dépense jour par jour de chaque compte (copie rafraîchie
// toutes les 6 h quand le compte est lisible) et on l'utilise quand Meta refuse.
const SNAP_KEY = "meta_spend_snapshot";
type Snap = { accounts: Record<string, { label: string; days: Record<string, number>; at: string }> };
async function readSnap(): Promise<Snap> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", SNAP_KEY).maybeSingle();
  let v = (data as { value?: unknown } | null)?.value;
  while (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  return (v as Snap) ?? { accounts: {} };
}
async function fetchDailySpend(id: string, token: string): Promise<Record<string, number>> {
  const min = new Date(); min.setUTCMonth(min.getUTCMonth() - 36);
  const tr = encodeURIComponent(JSON.stringify({ since: min.toISOString().slice(0, 10), until: new Date().toISOString().slice(0, 10) }));
  const days: Record<string, number> = {};
  let next: string | undefined = `${META}/${id}/insights?fields=spend&time_increment=1&limit=500&time_range=${tr}&access_token=${encodeURIComponent(token)}`;
  for (let g = 0; next && g < 20; g++) {
    const res: Response = await fetch(next, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
    for (const r of (json.data ?? []) as { spend?: string; date_start: string }[]) days[r.date_start] = Number(r.spend ?? 0);
    next = json.paging?.next;
  }
  return days;
}
async function refreshSnap(list: { id: string; label: string; token: string }[], snap: Snap) {
  const old = Date.now() - 6 * 3600_000;
  const todo = list.filter((a) => !snap.accounts[a.id] || new Date(snap.accounts[a.id].at).getTime() < old);
  if (!todo.length) return;
  let changed = false;
  await Promise.all(todo.map(async (a) => {
    try {
      const days = await fetchDailySpend(a.id, a.token);
      // on garde les anciens jours (au cas où Meta n'en renvoie plus), les nouveaux écrasent
      snap.accounts[a.id] = { label: a.label, days: { ...(snap.accounts[a.id]?.days ?? {}), ...days }, at: new Date().toISOString() };
      changed = true;
    } catch { /* compte illisible : on garde l'ancienne copie */ }
  }));
  if (changed) await supabaseAdmin.from("app_settings").upsert(
    { key: SNAP_KEY, value: snap as never, category: "ads", label: "Dépense Meta par compte (copie de secours)" } as never,
    { onConflict: "key" });
}
const snapSpend = (snap: Snap, id: string, from?: string, to?: string): number | null => {
  const a = snap.accounts[id];
  if (!a) return null;
  let s = 0;
  for (const [d, v] of Object.entries(a.days)) { if ((from && d < from) || (to && d > to)) continue; s += v; }
  return s;
};

export async function getMetaChargedMad(from?: string, to?: string): Promise<ChargedResult> {
  const { getMetaAccounts, act } = await import("./meta-accounts");
  // ⚠️ on garde aussi les comptes dont le token a expiré (status "error") :
  // leur dépense passée vient alors de la copie de secours au lieu de disparaître.
  const [all, fx, cache, snap] = await Promise.all([getMetaAccounts(), getUsdToMad(), readCache(), readSnap()]);
  const accounts = all.filter((a) => a.isActive && a.adAccountId && a.token);
  // copie de secours (max 1 fois / 6 h par compte, seulement les comptes lisibles)
  await refreshSnap(accounts.filter((a) => a.status !== "error").map((a) => ({ id: act(a)!, label: a.label, token: a.token })), snap).catch(() => {});
  const rate = fx.base; // marché × frais banque (sans TVA : ajoutée par compte ci-dessous)
  const out: ChargedResult = { mad: 0, usd: 0, count: 0, byAccount: [] };
  const seen = new Set<string>();
  const list = accounts.filter((a) => { const id = act(a); if (!id || seen.has(id)) return false; seen.add(id); return true; });

  const results = await Promise.all(list.map(async (a) => {
    const id = act(a)!;
    const tax = { pct: Number(a.taxPct ?? 0), since: a.taxSince ?? null };
    // Historique de facturation Meta trop instable (erreurs « unexpected error » sur les comptes très modifiés)
    // → on utilise la DÉPENSE du compte (TVA incluse), complète et rapide. Le cache n'est utilisé que si activé.
    const c = USE_CHARGES_CACHE ? cache.accounts[id] : undefined;
    if (c && c.lastDay && !c.error) {
      let usd = 0, count = 0;
      for (const [day, u] of c.charges) {
        if ((from && day < from) || (to && day > to)) continue;
        usd += u * taxFactorFor(day, tax); count++;
      }
      return { label: a.label, usd, mad: usd * rate, count, error: null as string | null };
    }
    try { // pas encore lu par la synchro → dépense du compte (rapide)
      let spend: number;
      try {
        if (a.status === "error") throw new Error(a.lastError ?? "token");
        spend = await accountSpend(id, a.token, from, to);
      } catch (e) {
        const s = snapSpend(snap, id, from, to);
        if (s === null) throw e;
        spend = s; // token expiré / accès perdu → copie de secours
      }
      const f = taxFactorFor(to ?? new Date().toISOString().slice(0, 10), tax);
      return { label: a.label, usd: spend * f, mad: spend * f * rate, count: 0, error: null as string | null };
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
