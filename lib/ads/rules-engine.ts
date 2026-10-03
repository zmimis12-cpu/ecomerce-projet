/**
 * lib/ads/rules-engine.ts — moteur des règles automatiques (cron toutes les 15 min).
 * Niveau "produit" : chiffres du produit (toutes ses campagnes Meta + vraies
 *   commandes du système) → action sur toutes ses campagnes.
 * Niveau "pub" : chiffres de chaque pub (Meta + commandes de sa vidéo) → action sur la pub.
 * Toutes les conditions doivent être vraies (ET). Server-only.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readSettings } from "./sync-core";
import { getUsdToMad } from "./fx";
import type { RuleCondition, RuleMetric, RuleWindow, RuleAction, RuleLevel } from "./rules-types";

const META = "https://graph.facebook.com/v21.0";
const LEAD_TYPES = ["lead", "offsite_conversion.fb_pixel_lead", "onsite_web_lead"];

type Rule = {
  id: string; name: string; enabled: boolean; simulate: boolean; level: RuleLevel;
  product_id: string | null; time_window: RuleWindow; conditions: RuleCondition[];
  action: RuleAction; cooldown_minutes: number;
  budget_pct: number | null; budget_max_usd: number | null; budget_min_usd: number | null;
};
type BudgetTarget = { id: string; name: string; dailyCents: number; status: string; token?: string };
type Metrics = Record<RuleMetric, number>;

function casaDay(offset = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(new Date(Date.now() - offset * 86400_000));
}
export function windowRange(w: RuleWindow): { since: string; until: string } {
  switch (w) {
    case "today": return { since: casaDay(0), until: casaDay(0) };
    case "yesterday": return { since: casaDay(1), until: casaDay(1) };
    case "3d": return { since: casaDay(2), until: casaDay(0) };
    case "7d": return { since: casaDay(6), until: casaDay(0) };
  }
}

async function metaGet(path: string, params: Record<string, string>, token: string) {
  const out: Record<string, unknown>[] = [];
  const url = new URL(`${META}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  let next: string | undefined = url.toString();
  for (let g = 0; next && g < 20; g++) {
    const res: Response = await fetch(next, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
    out.push(...((json.data ?? []) as Record<string, unknown>[]));
    next = json.paging?.next;
  }
  return out;
}

async function setStatus(id: string, status: "PAUSED" | "ACTIVE", token: string) {
  const res = await fetch(`${META}/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ status, access_token: token }).toString(),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
}

const leadsOf = (actions: unknown) => {
  const arr = actions as { action_type: string; value: string }[] | undefined;
  for (const t of LEAD_TYPES) { const a = arr?.find((x) => x.action_type === t); if (a) return Number(a.value); }
  return 0;
};

function finish(m: Omit<Metrics, "cost_per_order" | "cost_per_delivered" | "cost_per_result" | "ctr">, linkClicks: number): Metrics {
  const div = (a: number, b: number) => (b > 0 ? a / b : a > 0 ? Infinity : 0);
  return {
    ...m,
    cost_per_order: div(m.spend, m.orders),
    cost_per_delivered: div(m.spend, m.delivered),
    cost_per_result: div(m.spend, m.meta_results),
    ctr: m.impressions > 0 ? (linkClicks / m.impressions) * 100 : 0,
  };
}

function check(c: RuleCondition, m: Metrics) {
  const v = m[c.metric];
  switch (c.op) {
    case ">": return v > c.value;
    case ">=": return v >= c.value;
    case "<": return v < c.value;
    case "<=": return v <= c.value;
  }
}

/** Commandes du système par produit / par vidéo sur la période. */
async function ordersInWindow(range: { since: string; until: string }) {
  const { data: o } = await supabaseAdmin
    .from("orders")
    .select("id, status, creative_id, is_duplicate")
    .gte("created_at", `${range.since}T00:00:00+01:00`)
    .lte("created_at", `${range.until}T23:59:59+01:00`)
    .limit(5000);
  const orders = ((o ?? []) as { id: string; status: string; creative_id: string | null; is_duplicate: boolean }[])
    .filter((r) => !r.is_duplicate);
  const byProduct = new Map<string, { orders: number; delivered: number }>();
  const byCreative = new Map<string, { orders: number; delivered: number }>();
  const ids = orders.map((r) => r.id);
  const productOf = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data: it } = await supabaseAdmin.from("order_items").select("order_id, product_id").in("order_id", ids.slice(i, i + 150));
    for (const x of (it ?? []) as { order_id: string; product_id: string | null }[]) if (x.product_id) productOf.set(x.order_id, x.product_id);
  }
  for (const r of orders) {
    const done = r.status === "delivered" || r.status === "paid";
    const pid = productOf.get(r.id);
    if (pid) { const a = byProduct.get(pid) ?? { orders: 0, delivered: 0 }; a.orders++; if (done) a.delivered++; byProduct.set(pid, a); }
    if (r.creative_id) { const a = byCreative.get(r.creative_id) ?? { orders: 0, delivered: 0 }; a.orders++; if (done) a.delivered++; byCreative.set(r.creative_id, a); }
  }
  return { byProduct, byCreative };
}

async function campaignProductMap(campaigns: { id: string; name: string }[]) {
  const [{ data: assigns }, { data: products }] = await Promise.all([
    supabaseAdmin.from("campaign_product_assignments").select("campaign_id, product_id").eq("platform", "meta"),
    supabaseAdmin.from("products").select("id, sku"),
  ]);
  const map = new Map(((assigns ?? []) as { campaign_id: string; product_id: string }[]).map((a) => [a.campaign_id, a.product_id]));
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  for (const c of campaigns) {
    if (map.has(c.id)) continue;
    const p = ((products ?? []) as { id: string; sku: string }[]).find((x) => x.sku && norm(c.name).includes(norm(x.sku)));
    if (p) map.set(c.id, p.id);
  }
  return map;
}

async function inCooldown(rule: Rule, objectId: string) {
  const since = new Date(Date.now() - rule.cooldown_minutes * 60_000).toISOString();
  const { data } = await supabaseAdmin.from("ad_rule_logs" as never)
    .select("id").eq("rule_id", rule.id).eq("object_id", objectId).gte("created_at", since).limit(1);
  return ((data ?? []) as unknown[]).length > 0;
}

/** Réactivation autorisée seulement si la DERNIÈRE action d'une règle sur cet objet était une pause. */
async function pausedByRule(objectId: string) {
  const { data } = await supabaseAdmin.from("ad_rule_logs" as never)
    .select("action, simulated, success").eq("object_id", objectId).eq("simulated", false).eq("success", true)
    .in("action", ["pause", "activate"]).order("created_at", { ascending: false }).limit(1);
  const last = ((data ?? []) as { action: string }[])[0];
  return last?.action === "pause";
}

/**
 * Scaling : change le budget QUOTIDIEN (campagne si budget campagne, sinon
 * chaque ensemble actif). Hausse plafonnée par budget_max_usd, baisse limitée
 * par budget_min_usd. Une seule modif par objet pendant le délai de la règle.
 */
async function changeBudget(rule: Rule, targets: BudgetTarget[], m: Metrics, productId: string | null, token: string) {
  const pct = Math.max(1, Math.min(100, Number(rule.budget_pct ?? 20))) / 100;
  const up = rule.action === "increase_budget";
  let done = 0;
  for (const t of targets) {
    if (t.status !== "ACTIVE" || !t.dailyCents) continue;
    if (await inCooldown(rule, t.id)) continue;
    const cur = t.dailyCents / 100;
    let next = up ? cur * (1 + pct) : cur * (1 - pct);
    if (up && rule.budget_max_usd) next = Math.min(next, Number(rule.budget_max_usd));
    if (!up && rule.budget_min_usd) next = Math.max(next, Number(rule.budget_min_usd));
    next = Math.max(1, Math.round(next * 100) / 100);
    if (Math.abs(next - cur) < 0.5) continue; // déjà au plafond / plancher
    let success = true, error: string | null = null;
    if (!rule.simulate) {
      try {
        const res = await fetch(`${META}/${t.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ daily_budget: String(Math.round(next * 100)), access_token: t.token ?? token }).toString(),
        });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      } catch (e) { success = false; error = e instanceof Error ? e.message : String(e); }
    }
    const clean = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Number.isFinite(v) ? Math.round(v * 100) / 100 : null]));
    await supabaseAdmin.from("ad_rule_logs" as never).insert({
      rule_id: rule.id, rule_name: rule.name, level: rule.level, object_id: t.id, object_name: t.name,
      product_id: productId, action: rule.action, simulated: rule.simulate, success, error, metrics: clean,
      detail: `Budget quotidien $${cur.toFixed(2)} → $${next.toFixed(2)} (${up ? "+" : "-"}${Math.round(pct * 100)} %)`,
    } as never);
    done++;
  }
  return done;
}

async function act(rule: Rule, obj: { id: string; name: string; status: string; productId: string | null }, m: Metrics, token: string) {
  const want = rule.action === "pause" ? "PAUSED" : rule.action === "activate" ? "ACTIVE" : null;
  if (want === "PAUSED" && obj.status !== "ACTIVE") return null;
  if (want === "ACTIVE" && (obj.status !== "PAUSED" || !(await pausedByRule(obj.id)))) return null;
  if (await inCooldown(rule, obj.id)) return null;

  let success = true, error: string | null = null;
  if (want && !rule.simulate) {
    try { await setStatus(obj.id, want, token); } catch (e) { success = false; error = e instanceof Error ? e.message : String(e); }
  }
  const clean = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Number.isFinite(v) ? Math.round(v * 100) / 100 : null]));
  await supabaseAdmin.from("ad_rule_logs" as never).insert({
    rule_id: rule.id, rule_name: rule.name, level: rule.level, object_id: obj.id, object_name: obj.name,
    product_id: obj.productId, action: rule.action, simulated: rule.simulate, success, error, metrics: clean,
  } as never);
  return { object: obj.name, success };
}

export async function runAdRules() {
  const { data: r } = await supabaseAdmin.from("ad_rules" as never).select("*").eq("enabled", true);
  const rules = (r ?? []) as unknown as Rule[];
  if (!rules.length) return { ok: true, rules: 0, actions: 0 };
  // Multi-comptes : campagnes / ensembles / pubs de TOUS les comptes Meta actifs,
  // chaque objet garde le token de son compte pour agir dessus.
  const { activeMetaAccounts, act: actOf } = await import("./meta-accounts");
  const accounts = await activeMetaAccounts();
  if (!accounts.length) return { ok: false, error: "Meta non configuré" };
  const s = { access_token: accounts[0].token };
  const { getAccountTaxConfig, taxFactorFor } = await import("./fx");
  const taxOf = new Map<string, number>();
  for (const a of accounts) taxOf.set(a.token, taxFactorFor(null, await getAccountTaxConfig(a)));
  const all = async (path: (acc: string) => string, params: Record<string, string>) => {
    const out: (Record<string, unknown> & { _token: string; _tax: number })[] = [];
    for (const a of accounts) {
      const rows = await metaGet(path(actOf(a)), params, a.token);
      out.push(...rows.map((r) => ({ ...r, _token: a.token, _tax: taxOf.get(a.token) ?? 1 })));
    }
    return out;
  };
  const { base: rate } = await getUsdToMad(); // taxe appliquée ligne par ligne (_tax)

  const campaigns = (await all((acc) => `${acc}/campaigns`, { fields: "id,name,effective_status,daily_budget", limit: "500" }))
    .map((c) => ({ id: String(c.id), name: String(c.name), status: String(c.effective_status), dailyCents: Number(c.daily_budget ?? 0), token: c._token }));
  const needAdsets = rules.some((r) => r.action === "increase_budget" || r.action === "decrease_budget");
  const adsets = needAdsets
    ? (await all((acc) => `${acc}/adsets`, { fields: "id,name,campaign_id,daily_budget,effective_status", limit: "500" }))
        .map((a) => ({ id: String(a.id), name: String(a.name), campaignId: String(a.campaign_id), status: String(a.effective_status), dailyCents: Number(a.daily_budget ?? 0), token: a._token }))
    : [];
  const budgetTargetsForCampaign = (c: { id: string; name: string; status: string; dailyCents: number; token: string }): BudgetTarget[] =>
    c.dailyCents > 0
      ? [{ id: c.id, name: `Campagne « ${c.name} »`, dailyCents: c.dailyCents, status: c.status, token: c.token }]
      : adsets.filter((a) => a.campaignId === c.id && a.dailyCents > 0)
          .map((a) => ({ id: a.id, name: `Ensemble « ${a.name} »`, dailyCents: a.dailyCents, status: a.status, token: a.token }));
  const isBudget = (r: Rule) => r.action === "increase_budget" || r.action === "decrease_budget";
  const campProduct = await campaignProductMap(campaigns);
  const { data: links } = await supabaseAdmin.from("creative_ads" as never).select("ad_id, creative_id").eq("platform", "meta");
  const adCreative = new Map(((links ?? []) as { ad_id: string; creative_id: string }[]).map((l) => [l.ad_id, l.creative_id]));

  let actions = 0;
  const cache = new Map<string, { camp: Record<string, unknown>[]; ads: Record<string, unknown>[]; orders: Awaited<ReturnType<typeof ordersInWindow>> }>();

  for (const rule of rules) {
    try {
      const range = windowRange(rule.time_window);
      if (!cache.has(rule.time_window)) {
        const tr = JSON.stringify(range);
        const [camp, ads, orders] = await Promise.all([
          all((acc) => `${acc}/insights`, { level: "campaign", fields: "campaign_id,spend,impressions,inline_link_clicks,frequency,actions", time_range: tr, limit: "500" }),
          all((acc) => `${acc}/insights`, { level: "ad", fields: "ad_id,ad_name,adset_id,campaign_id,spend,impressions,inline_link_clicks,frequency,actions", time_range: tr, limit: "500" }),
          ordersInWindow(range),
        ]);
        cache.set(rule.time_window, { camp, ads, orders });
      }
      const { camp, ads, orders } = cache.get(rule.time_window)!;
      const conds = Array.isArray(rule.conditions) ? rule.conditions : [];
      if (!conds.length) continue;

      if (rule.level === "product") {
        const productIds = rule.product_id ? [rule.product_id] : [...new Set(campProduct.values())];
        for (const pid of productIds) {
          const myCamps = campaigns.filter((c) => campProduct.get(c.id) === pid);
          if (!myCamps.length) continue;
          const ins = camp.filter((x) => myCamps.some((c) => c.id === x.campaign_id));
          const spendUsd = ins.reduce((a, x) => a + Number(x.spend ?? 0) * Number((x as { _tax?: number })._tax ?? 1), 0);
          const impressions = ins.reduce((a, x) => a + Number(x.impressions ?? 0), 0);
          const clicks = ins.reduce((a, x) => a + Number(x.inline_link_clicks ?? 0), 0);
          const freq = ins.length ? Math.max(...ins.map((x) => Number(x.frequency ?? 0))) : 0;
          const o = orders.byProduct.get(pid) ?? { orders: 0, delivered: 0 };
          const m = finish({
            spend: spendUsd * rate, orders: o.orders, delivered: o.delivered,
            meta_results: ins.reduce((a, x) => a + leadsOf(x.actions), 0), impressions, frequency: freq,
          }, clicks);
          if (!conds.every((c) => check(c, m))) continue;
          for (const c of myCamps) {
            if (isBudget(rule)) {
              actions += await changeBudget(rule, budgetTargetsForCampaign(c), m, pid, c.token);
              continue;
            }
            const done = await act(rule, { id: c.id, name: `Campagne « ${c.name} »`, status: c.status, productId: pid }, m, c.token);
            if (done) actions++;
          }
        }
      } else {
        const statuses = new Map((await all((acc) => `${acc}/ads`, { fields: "id,effective_status", limit: "500" }))
          .map((a) => [String(a.id), String(a.effective_status)]));
        for (const x of ads) {
          const adId = String(x.ad_id);
          const pid = campProduct.get(String(x.campaign_id)) ?? null;
          if (rule.product_id && pid !== rule.product_id) continue;
          const cr = adCreative.get(adId);
          const o = cr ? orders.byCreative.get(cr) ?? { orders: 0, delivered: 0 } : { orders: 0, delivered: 0 };
          const m = finish({
            spend: Number(x.spend ?? 0) * Number((x as { _tax?: number })._tax ?? 1) * rate, orders: o.orders, delivered: o.delivered,
            meta_results: leadsOf(x.actions), impressions: Number(x.impressions ?? 0), frequency: Number(x.frequency ?? 0),
          }, Number(x.inline_link_clicks ?? 0));
          if (!conds.every((c) => check(c, m))) continue;
          if (isBudget(rule)) {
            // Niveau pub : le budget est porté par son ensemble (ou sa campagne en CBO)
            const camp = campaigns.find((c) => c.id === String(x.campaign_id));
            const targets = camp && camp.dailyCents > 0
              ? budgetTargetsForCampaign(camp)
              : adsets.filter((a) => a.id === String(x.adset_id) && a.dailyCents > 0)
                  .map((a) => ({ id: a.id, name: `Ensemble « ${a.name} »`, dailyCents: a.dailyCents, status: a.status, token: a.token }));
            actions += await changeBudget(rule, targets, m, pid, String(x._token));
            continue;
          }
          const done = await act(rule, { id: adId, name: `Pub « ${x.ad_name} »`, status: statuses.get(adId) ?? "", productId: pid }, m, String(x._token));
          if (done) actions++;
        }
      }
      await supabaseAdmin.from("ad_rules" as never).update({ last_run_at: new Date().toISOString() } as never).eq("id", rule.id);
    } catch (e) {
      await supabaseAdmin.from("ad_rule_logs" as never).insert({
        rule_id: rule.id, rule_name: rule.name, level: rule.level, action: rule.action,
        simulated: rule.simulate, success: false, error: e instanceof Error ? e.message : String(e),
      } as never);
    }
  }
  return { ok: true, rules: rules.length, actions };
}
