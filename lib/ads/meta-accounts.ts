/**
 * lib/ads/meta-accounts.ts — PLUSIEURS comptes Meta (server-only).
 * Stockés dans app_settings["meta_accounts"] (pas de migration nécessaire).
 * Chaque compte : son token, son compte pub, son pixel, sa Page.
 * Le compte "principal" sert au Lanceur et à l'audience Acheteurs ; la synchro,
 * les stats, les règles et la taxe couvrent TOUS les comptes actifs.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

const META = "https://graph.facebook.com/v21.0";

export type MetaAccount = {
  key: string;
  label: string;
  adAccountId: string | null;   // sans "act_"
  token: string;
  isActive: boolean;
  isPrimary: boolean;
  autoPrimary?: boolean;        // devient principal tout seul dès qu'il est prêt
  pixelId?: string | null;
  pageId?: string | null;
  igUserId?: string | null;
  status?: "ok" | "pending" | "error";
  lastError?: string | null;
  checkedAt?: string | null;
};

export const act = (a: { adAccountId: string | null }) => (a.adAccountId ? `act_${a.adAccountId.replace(/^act_/, "")}` : "");

export async function getMetaAccounts(): Promise<MetaAccount[]> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "meta_accounts").maybeSingle();
  const raw = (data as { value: unknown } | null)?.value;
  let list: MetaAccount[] = [];
  try { list = typeof raw === "string" ? JSON.parse(raw) : Array.isArray(raw) ? (raw as MetaAccount[]) : []; } catch { list = []; }
  if (list.length) return list;
  // 1re fois : reprend le compte unique existant (Paramètres → Publicité)
  const { data: s } = await supabaseAdmin.from("ad_platform_settings").select("access_token, account_id, is_active").eq("platform", "meta").maybeSingle();
  const old = s as { access_token: string; account_id: string; is_active: boolean } | null;
  if (!old?.access_token) return [];
  const seeded: MetaAccount[] = [{
    key: "main", label: `Compte ${String(old.account_id).replace(/^act_/, "")}`, adAccountId: String(old.account_id).replace(/^act_/, ""),
    token: old.access_token, isActive: old.is_active, isPrimary: true, status: "ok",
  }];
  await saveMetaAccounts(seeded);
  return seeded;
}

export async function saveMetaAccounts(list: MetaAccount[]) {
  await supabaseAdmin.from("app_settings").upsert({
    key: "meta_accounts", value: JSON.stringify(list), category: "ads", label: "Comptes Meta (multi-comptes)",
  } as never, { onConflict: "key" });
  // Compatibilité : le compte principal reste aussi dans ad_platform_settings
  const p = list.find((a) => a.isPrimary && a.adAccountId && a.isActive);
  if (p) {
    await supabaseAdmin.from("ad_platform_settings").update({ access_token: p.token, account_id: p.adAccountId, is_active: true } as never).eq("platform", "meta");
  }
}

/** Comptes utilisables (actifs, avec compte pub). */
export async function activeMetaAccounts() {
  return (await getMetaAccounts()).filter((a) => a.isActive && a.adAccountId && a.token && a.status !== "error");
}

export async function primaryMetaAccount() {
  const list = await activeMetaAccounts();
  return list.find((a) => a.isPrimary) ?? list[0] ?? null;
}

/** Quel compte possède cette pub (mémorisé par la synchro). */
export async function adAccountMap(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "meta_ad_account_map").maybeSingle();
  try { return JSON.parse(String((data as { value: string } | null)?.value ?? "{}")); } catch { return {}; }
}
export async function saveAdAccountMap(map: Record<string, string>) {
  await supabaseAdmin.from("app_settings").upsert({
    key: "meta_ad_account_map", value: JSON.stringify(map), category: "ads", label: "Pub Meta → compte",
  } as never, { onConflict: "key" });
}

/** Regroupe des pubs par compte (token) — pubs inconnues → essayées sur chaque compte. */
export async function groupAdsByAccount(adIds: string[]) {
  const [accounts, map] = await Promise.all([activeMetaAccounts(), adAccountMap()]);
  const groups = new Map<string, { account: MetaAccount; ids: string[] }>();
  const unknown: string[] = [];
  for (const id of adIds) {
    const k = map[id];
    const a = accounts.find((x) => x.key === k);
    if (!a) { unknown.push(id); continue; }
    if (!groups.has(a.key)) groups.set(a.key, { account: a, ids: [] });
    groups.get(a.key)!.ids.push(id);
  }
  if (unknown.length && accounts.length) {
    const a = accounts.find((x) => x.isPrimary) ?? accounts[0];
    if (!groups.has(a.key)) groups.set(a.key, { account: a, ids: [] });
    groups.get(a.key)!.ids.push(...unknown);
  }
  return [...groups.values()];
}

async function g(path: string, token: string) {
  const res = await fetch(`${META}/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json;
}

/**
 * Vérifie chaque compte : token valide, compte pub, pixel, Page.
 * Détecte tout seul le compte pub / pixel / Page dès que l'accès est donné,
 * et fait passer le compte en principal s'il est marqué autoPrimary.
 */
export async function checkMetaAccounts() {
  const list = await getMetaAccounts();
  for (const a of list) {
    try {
      if (!a.adAccountId) {
        const r = await g("me/adaccounts?fields=account_id,name&limit=50", a.token);
        const taken = new Set(list.filter((x) => x.key !== a.key).map((x) => x.adAccountId));
        const found = (r.data ?? []).find((x: { account_id: string }) => !taken.has(x.account_id));
        if (found) { a.adAccountId = String(found.account_id); a.label = a.label || found.name; }
      }
      if (a.adAccountId) {
        await g(`${act(a)}?fields=account_status`, a.token);
        if (!a.pixelId) {
          const px = await g(`${act(a)}/adspixels?fields=id&limit=5`, a.token);
          if (px.data?.[0]?.id) a.pixelId = String(px.data[0].id);
        }
      }
      if (!a.pageId) {
        const pg = await g("me/accounts?fields=id,name&limit=5", a.token).catch(() => null);
        if (pg?.data?.[0]?.id) a.pageId = String(pg.data[0].id);
      }
      let pixelOk = !a.pixelId;
      if (a.pixelId) pixelOk = !!(await g(`${a.pixelId}?fields=id`, a.token).catch(() => null));
      a.status = a.adAccountId && pixelOk ? "ok" : "pending";
      a.lastError = !a.adAccountId
        ? "Aucun compte publicitaire assigné à ce token (Business → Utilisateurs système → Assigner des ressources)."
        : !pixelOk ? `Pas d'accès au pixel ${a.pixelId} (Assigner des ressources → Ensembles de données).` : null;
    } catch (e) {
      a.status = "error";
      a.lastError = e instanceof Error ? e.message : String(e);
    }
    a.checkedAt = new Date().toISOString();
  }
  const ready = list.find((a) => a.autoPrimary && a.status === "ok" && a.isActive);
  if (ready && !ready.isPrimary) {
    for (const a of list) a.isPrimary = a.key === ready.key;
    ready.autoPrimary = false;
    // Le Lanceur doit reprendre la Page / le pixel du nouveau compte
    for (const k of ["meta_page_id", "meta_ig_user_id", "meta_pixel_id"]) {
      await supabaseAdmin.from("app_settings").delete().eq("key", k);
    }
  }
  await saveMetaAccounts(list);
  return list.map((a) => ({ key: a.key, label: a.label, status: a.status, error: a.lastError, primary: a.isPrimary, adAccountId: a.adAccountId, pixelId: a.pixelId, pageId: a.pageId }));
}
