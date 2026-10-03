/**
 * lib/ads/tiktok-accounts.ts — connexion TikTok Marketing API (OAuth) + plusieurs
 * comptes TikTok (server-only). Stocké dans app_settings (aucune migration).
 *   tiktok_app       : { appId, secret }            (le secret ne quitte jamais le serveur)
 *   tiktok_accounts  : [{ key, label, advertiserId, token, currency, isActive, ... }]
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

export const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3";
export const TIKTOK_REDIRECT = `https://${process.env.NEXT_PUBLIC_LP_DOMAIN || "hajtek.ma"}/api/tiktok/callback`;

export type TikTokAccount = {
  key: string; label: string; advertiserId: string; token: string;
  currency?: string | null; timezone?: string | null; isActive: boolean;
  pixelCode?: string | null; taxPct?: number | null; taxSince?: string | null;
  status?: "ok" | "error"; lastError?: string | null; checkedAt?: string | null;
};

async function getSetting(key: string) {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle();
  const v = (data as { value: unknown } | null)?.value;
  if (v == null) return null;
  try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return v; }
}
async function setSetting(key: string, value: unknown, label: string) {
  await supabaseAdmin.from("app_settings").upsert({ key, value: JSON.stringify(value), category: "ads", label } as never, { onConflict: "key" });
}

export async function getTikTokApp(): Promise<{ appId: string; secret: string } | null> {
  const v = await getSetting("tiktok_app");
  return v?.appId && v?.secret ? v : null;
}
export async function saveTikTokApp(appId: string, secret: string) {
  await setSetting("tiktok_app", { appId: appId.trim(), secret: secret.trim() }, "App TikTok Marketing API");
}

export async function getTikTokAccounts(): Promise<TikTokAccount[]> {
  const v = await getSetting("tiktok_accounts");
  return Array.isArray(v) ? (v as TikTokAccount[]) : [];
}
export async function saveTikTokAccounts(list: TikTokAccount[]) {
  await setSetting("tiktok_accounts", list, "Comptes TikTok Ads");
  // Compatibilité : 1er compte actif aussi dans ad_platform_settings
  const p = list.find((a) => a.isActive);
  if (p) await supabaseAdmin.from("ad_platform_settings").update({ access_token: p.token, account_id: p.advertiserId, is_active: true } as never).eq("platform", "tiktok");
}
export async function activeTikTokAccounts() {
  return (await getTikTokAccounts()).filter((a) => a.isActive && a.token && a.advertiserId && a.status !== "error");
}

/** Lien d'autorisation TikTok (le bouton "Connecter TikTok"). */
export async function tiktokAuthUrl() {
  const app = await getTikTokApp();
  if (!app) return null;
  const state = crypto.randomUUID();
  await setSetting("tiktok_oauth_state", { state, at: Date.now() }, "OAuth TikTok (anti-CSRF)");
  const u = new URL("https://business-api.tiktok.com/portal/auth");
  u.searchParams.set("app_id", app.appId);
  u.searchParams.set("state", state);
  u.searchParams.set("redirect_uri", TIKTOK_REDIRECT);
  return u.toString();
}

export async function checkOAuthState(state: string | null) {
  const v = await getSetting("tiktok_oauth_state");
  return !!state && v?.state === state && Date.now() - Number(v?.at ?? 0) < 30 * 60_000;
}

async function tt(path: string, token: string, params: Record<string, string> = {}) {
  const u = new URL(`${TIKTOK_API}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), { headers: { "Access-Token": token }, cache: "no-store" });
  const j = await res.json();
  if (j.code !== 0) throw new Error(j.message ?? `HTTP ${res.status}`);
  return j.data;
}

/** Échange le code d'autorisation contre un token PERMANENT + enregistre les comptes. */
export async function exchangeTikTokCode(authCode: string) {
  const app = await getTikTokApp();
  if (!app) throw new Error("App TikTok non configurée (App ID / Secret).");
  const res = await fetch(`${TIKTOK_API}/oauth2/access_token/`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: app.appId, secret: app.secret, auth_code: authCode }),
  });
  const j = await res.json();
  if (j.code !== 0) throw new Error(j.message ?? "Échange du code refusé par TikTok");
  const token = String(j.data.access_token);
  const ids = (j.data.advertiser_ids ?? []).map(String) as string[];

  const info = ids.length
    ? await tt("advertiser/info/", token, { advertiser_ids: JSON.stringify(ids), fields: JSON.stringify(["advertiser_id", "name", "currency", "timezone"]) }).catch(() => ({ list: [] }))
    : { list: [] };
  const byId = new Map(((info?.list ?? []) as { advertiser_id: string; name: string; currency: string; timezone: string }[]).map((x) => [String(x.advertiser_id), x]));

  const list = await getTikTokAccounts();
  for (const id of ids) {
    const meta = byId.get(id);
    const existing = list.find((a) => a.advertiserId === id);
    const row: TikTokAccount = {
      key: existing?.key ?? crypto.randomUUID(), label: meta?.name ? `${meta.name} (${id})` : `TikTok ${id}`,
      advertiserId: id, token, currency: meta?.currency ?? null, timezone: meta?.timezone ?? null,
      isActive: existing?.isActive ?? true, pixelCode: existing?.pixelCode ?? null,
      taxPct: existing?.taxPct ?? null, taxSince: existing?.taxSince ?? null, status: "ok", lastError: null, checkedAt: new Date().toISOString(),
    };
    if (existing) Object.assign(existing, row); else list.push(row);
  }
  await saveTikTokAccounts(list);
  return { accounts: ids.length };
}

/** Vérifie chaque compte (cron) et détecte le pixel. */
export async function checkTikTokAccounts() {
  const list = await getTikTokAccounts();
  for (const a of list) {
    try {
      await tt("advertiser/info/", a.token, { advertiser_ids: JSON.stringify([a.advertiserId]) });
      if (!a.pixelCode) {
        const px = await tt("pixel/list/", a.token, { advertiser_id: a.advertiserId }).catch(() => null);
        const code = px?.pixels?.[0]?.pixel_code;
        if (code) a.pixelCode = String(code);
      }
      a.status = "ok"; a.lastError = null;
    } catch (e) { a.status = "error"; a.lastError = e instanceof Error ? e.message : String(e); }
    a.checkedAt = new Date().toISOString();
  }
  if (list.length) await saveTikTokAccounts(list);
  return list.map((a) => ({ label: a.label, status: a.status, error: a.lastError }));
}

/** Taux devise du compte TikTok → MAD (USD via le taux du jour, MAD = 1). */
export async function tiktokToMad(a: TikTokAccount, day?: string) {
  const { getUsdToMad, getAccountTaxConfig, taxFactorFor } = await import("./fx");
  const tax = taxFactorFor(day ?? null, await getAccountTaxConfig({ taxPct: a.taxPct ?? 0, taxSince: a.taxSince ?? null }));
  const cur = (a.currency ?? "USD").toUpperCase();
  if (cur === "MAD") return tax;
  if (cur === "USD") return (await getUsdToMad()).base * tax;
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "tiktok_currency_to_mad").maybeSingle();
  return (Number((data as { value?: unknown } | null)?.value) || 1) * tax;
}
