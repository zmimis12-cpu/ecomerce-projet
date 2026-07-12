/**
 * lib/dashboard/queries.ts
 * Server-side dashboard data queries — Real Finance System.
 * All finance data requires manager+ role — enforced by callers.
 */
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeCity, getExpectedDeliveryCost } from "@/lib/delivery/reconciliation-utils";

export interface DashboardSummary {
  total_leads:            number;
  confirmed_count:        number;
  sent_to_delivery_count: number;
  in_transit_count:       number;
  delivered_count:        number;
  paid_count:             number;
  returned_count:         number;
  refused_count:          number;
  no_answer_count:        number;
  cancelled_count:        number;
  estimated_revenue:      number;
  real_revenue:           number;
  estimated_profit:       number;
  real_profit:            number;
  total_cogs:             number;
  total_delivery_cost:    number;
  total_return_losses:    number;
  pending_collection:     number;
  net_a_recevoir:         number;
  net_collected:          number;  // Argent déjà collecté par Digylog, net des frais de livraison
  total_ads_spend:        number;  // Meta (réel, synced) + TikTok/Google/autre (saisie manuelle)
  real_profit_net_ads:    number;  // real_profit - total_ads_spend
  total_call_center_cost: number;  // commissions agents sur commandes payées de la période
  total_other_expenses:   number;  // domaine, abonnements, etc. (table expenses)
  true_final_profit:      number;  // real_profit - pub - call center - autres charges = LE vrai profit
  confirmation_rate:      number;
  delivery_rate:          number;
  // New real finance fields
  total_delivery_margin:  number;  // +10 MAD per Casa order
  total_delivery_overcharge: number; // Digylog overcharged us
  casa_orders_count:      number;
  net_margin_pct:         number;
  roi:                    number;
}

export interface FinanceAnomaly {
  id:              string;
  order_id:        string;
  tracking_number: string | null;
  anomaly_type:    string;
  expected_value:  number;
  actual_value:    number;
  difference:      number;
  description:     string | null;
  resolved:        boolean;
  created_at:      string;
}

export interface ProductPerformance {
  product_id:          string;
  product_name:        string;
  sku:                 string;
  image_url:           string | null;
  sale_price_mad:      number;
  total_cost_mad:      number;
  unit_profit:         number;
  ads_cost_mad:        number;
  is_real_ad_spend:    boolean;
  lead_count:          number;
  confirmed_count:     number;
  delivered_count:     number;
  returned_count:      number;
  refused_count:       number;
  confirmation_rate:   number;
  delivery_rate:       number;
  refusal_rate:        number;
  total_revenue:       number;
  real_revenue:        number;
  estimated_profit:    number;
  real_profit:         number;
  total_cogs:          number;
  total_delivery_cost: number;
  return_losses:       number;
  real_margin_pct:     number;
  performance_status:  "profitable" | "losing" | "needs_review" | "no_data";
  // Ads budget analysis columns
  ads_total:           number;   // Total dépensé en pub pour ce produit (réel ou estimé)
  ads_max_estimation:  number;   // Budget max estimé (marge × taux_conf × taux_livr)
  ads_max_real:        number;   // Budget max réel ajusté avec vrais taux
  cost_per_delivered:  number;   // Coût ads par commande livrée
  ads_live:            number | null; // Spend live du jour depuis l'API (null = non connecté)
}

export interface DailyFinance {
  day:               string;
  leads:             number;
  confirmed:         number;
  delivered:         number;
  returned:          number;
  estimated_revenue: number;
  real_revenue:      number;
  estimated_profit:  number;
  real_profit:       number;
}

export interface DeliveryClaim {
  id:                       string;
  order_number:             string;
  customer_name:            string;
  customer_phone:           string;
  delivery_tracking_number: string | null;
  total_amount_mad:         number;
  status:                   string;
  is_paid:                  boolean;
  return_cost_mad:          number;
  delivery_cost_real_mad:   number;
  claim_amount:             number;
  claim_type:               "pending_collection" | "return_claim" | "other";
  updated_at:               string;
}

export interface DateFilter {
  from: string;
  to:   string;
  storeId?:   string;
  providerId?: string;
}

// ── Ad spend breakdown by platform (Meta/TikTok/Google/Non attribué) ────────
export interface AdSpendPlatformRow {
  platform: string;
  label: string;
  matched_mad: number;    // attribué à un produit
  unmatched_mad: number;  // pas attribué (campagne sans SKU/assignation)
  total_mad: number;
}

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta", tiktok: "TikTok", google: "Google Ads", other: "Autre",
};

export async function getAdSpendByPlatform(filter?: DateFilter): Promise<{
  rows: AdSpendPlatformRow[];
  grand_total: number;
}> {
  let matchedQ   = supabaseAdmin.from("product_ad_spend").select("platform, spend_mad");
  let unmatchedQ = supabaseAdmin.from("unmatched_ad_spend").select("platform, spend_mad");
  let manualQ    = supabaseAdmin.from("manual_ad_spend").select("platform, amount_mad");
  if (filter) {
    matchedQ   = matchedQ.gte("period_start", filter.from).lte("period_end", filter.to);
    unmatchedQ = unmatchedQ.gte("period_start", filter.from).lte("period_end", filter.to);
    manualQ    = manualQ.gte("spend_date", filter.from).lte("spend_date", filter.to);
  }
  const [{ data: matchedRows }, { data: unmatchedRows }, { data: manualRows }] =
    await Promise.all([matchedQ, unmatchedQ, manualQ]);

  const byPlatform = new Map<string, { matched: number; unmatched: number }>();
  const bump = (platform: string, key: "matched" | "unmatched", amount: number) => {
    const cur = byPlatform.get(platform) ?? { matched: 0, unmatched: 0 };
    cur[key] += amount;
    byPlatform.set(platform, cur);
  };
  for (const r of (matchedRows ?? []) as { platform: string; spend_mad: number }[]) {
    bump(r.platform, "matched", r.spend_mad ?? 0);
  }
  for (const r of (unmatchedRows ?? []) as { platform: string; spend_mad: number }[]) {
    bump(r.platform, "unmatched", r.spend_mad ?? 0);
  }
  for (const r of (manualRows ?? []) as { platform: string; amount_mad: number }[]) {
    bump(r.platform, "matched", r.amount_mad ?? 0); // saisie manuelle = pas de notion de produit, comptée comme "attribuée" au global plateforme
  }

  const rows: AdSpendPlatformRow[] = [...byPlatform.entries()]
    .map(([platform, v]) => ({
      platform,
      label: PLATFORM_LABELS[platform] ?? platform,
      matched_mad:   Math.round(v.matched * 100) / 100,
      unmatched_mad: Math.round(v.unmatched * 100) / 100,
      total_mad:     Math.round((v.matched + v.unmatched) * 100) / 100,
    }))
    .sort((a, b) => b.total_mad - a.total_mad);

  const grand_total = Math.round(rows.reduce((s, r) => s + r.total_mad, 0) * 100) / 100;

  return { rows, grand_total };
}


export async function getDashboardSummary(filter?: DateFilter): Promise<DashboardSummary> {
  const supabase = await createClient();

  let q = supabase
    .from("orders")
    .select([
      "status","is_paid","total_amount_mad","estimated_profit",
      "real_profit_mad","cogs_total","delivery_cost_real_mad","return_cost_mad",
      "customer_city","expected_delivery_cost","delivery_margin","actual_delivery_cost",
      "assigned_to",
    ].join(","))
    .neq("status", "cancelled");

  if (filter) {
    q = q.gte("created_at", filter.from).lte("created_at", filter.to + "T23:59:59");
  }
  if (filter?.storeId) {
    q = q.eq("delivery_store_id", filter.storeId);
  }

  const { data } = await q;
  const rows = (data ?? []) as {
    status: string; is_paid: boolean;
    total_amount_mad: number; estimated_profit: number;
    real_profit_mad: number | null; cogs_total: number;
    delivery_cost_real_mad: number; return_cost_mad: number;
    customer_city: string | null;
    expected_delivery_cost: number | null;
    delivery_margin: number | null;
    actual_delivery_cost: number | null;
    assigned_to: string | null;
  }[];

  const CONFIRMED_STATUSES = new Set(["confirmed","sent_to_delivery","in_transit","delivered","paid"]);
  const DELIVERED_STATUSES = new Set(["delivered","paid"]);

  const total_leads            = rows.length;
  const confirmed_count        = rows.filter((r) => CONFIRMED_STATUSES.has(r.status)).length;
  const sent_to_delivery_count = rows.filter((r) => r.status === "sent_to_delivery").length;
  const in_transit_count       = rows.filter((r) => r.status === "in_transit").length;
  const delivered_count        = rows.filter((r) => DELIVERED_STATUSES.has(r.status)).length;
  const paid_count             = rows.filter((r) => r.status === "paid" && r.is_paid).length;
  const returned_count         = rows.filter((r) => r.status === "returned").length;
  const refused_count          = rows.filter((r) => r.status === "refused_delivery").length;
  const no_answer_count        = rows.filter((r) => r.status === "no_answer").length;
  const cancelled_count        = 0;

  const estimated_revenue   = rows.reduce((s, r) => s + (r.total_amount_mad ?? 0), 0);
  const real_revenue        = rows.filter((r) => r.is_paid).reduce((s, r) => s + (r.total_amount_mad ?? 0), 0);
  const estimated_profit    = rows.reduce((s, r) => s + (r.estimated_profit ?? 0), 0);
  const real_profit         = rows.filter((r) => r.is_paid).reduce((s, r) => s + (r.real_profit_mad ?? 0), 0);
  const total_cogs          = rows.reduce((s, r) => s + (r.cogs_total ?? 0), 0);
  const total_delivery_cost = rows.reduce((s, r) => s + (r.delivery_cost_real_mad ?? 0), 0);
  const total_return_losses = rows.reduce((s, r) => s + (r.return_cost_mad ?? 0), 0);
  const pending_collection  = rows
    .filter((r) => DELIVERED_STATUSES.has(r.status) && !r.is_paid)
    .reduce((s, r) => s + (r.total_amount_mad ?? 0), 0);

  // Net à recevoir = montant collecté - frais livraison (20 MAD Casa, 35 MAD autres villes)
  const net_a_recevoir = rows
    .filter((r) => DELIVERED_STATUSES.has(r.status) && !r.is_paid)
    .reduce((s, r) => {
      const city = (r.customer_city ?? "").toLowerCase();
      const livFee = city.includes("casablanca") || city.includes("casa") || city === "الدار البيضاء" ? 20 : 35;
      return s + (r.total_amount_mad ?? 0) - livFee;
    }, 0);

  // Net déjà collecté = commandes payées, montant collecté - frais de livraison réel.
  // NOTE: actual_delivery_cost (default 35) et delivery_cost_real_mad (default 0) ne
  // sont JAMAIS mis à jour par l'app avec le vrai frais par commande — on ne peut pas
  // s'y fier (ex: Casa reste à 35 au lieu de 20). On utilise donc le calcul par ville,
  // qui matche exactement les factures Digylog réelles (vérifié: 34/34 sans écart).
  const net_collected = rows
    .filter((r) => r.is_paid)
    .reduce((s, r) => {
      const city   = (r.customer_city ?? "").toLowerCase();
      const livFee = city.includes("casablanca") || city.includes("casa") || city === "الدار البيضاء" ? 20 : 35;
      return s + (r.total_amount_mad ?? 0) - livFee;
    }, 0);

  // Delivery margin: +10 MAD for each Casa order
  let total_delivery_margin = 0;
  let total_delivery_overcharge = 0;
  let casa_orders_count = 0;

  for (const r of rows) {
    const city = r.customer_city ?? "";
    const norm = normalizeCity(city);
    const expectedCost = getExpectedDeliveryCost(city);
    const actualCost   = r.actual_delivery_cost ?? r.delivery_cost_real_mad ?? expectedCost;
    const margin       = r.delivery_margin ?? (35 - expectedCost);

    if (norm === "Casablanca") casa_orders_count++;
    total_delivery_margin += margin;

    // Overcharge = Digylog charged more than expected
    const overcharge = actualCost - expectedCost;
    if (overcharge > 0.5) total_delivery_overcharge += overcharge;
  }

  const confirmation_rate = total_leads > 0
    ? Math.round(confirmed_count / total_leads * 1000) / 10 : 0;
  const delivery_rate = confirmed_count > 0
    ? Math.round(delivered_count / confirmed_count * 1000) / 10 : 0;
  const net_margin_pct = real_revenue > 0
    ? Math.round(real_profit / real_revenue * 1000) / 10 : 0;
  const roi = total_cogs > 0
    ? Math.round(real_profit / total_cogs * 1000) / 10 : 0;

  // ── Total dépensé en pub (Meta réel via sync + non-matché + TikTok/Google manuel) ──
  let metaQ      = supabaseAdmin.from("product_ad_spend").select("spend_mad");
  let unmatchedQ = supabaseAdmin.from("unmatched_ad_spend").select("spend_mad");
  let manualQ    = supabaseAdmin.from("manual_ad_spend").select("amount_mad");
  if (filter) {
    metaQ      = metaQ.gte("period_start", filter.from).lte("period_end", filter.to);
    unmatchedQ = unmatchedQ.gte("period_start", filter.from).lte("period_end", filter.to);
    manualQ    = manualQ.gte("spend_date", filter.from).lte("spend_date", filter.to);
  }
  const [{ data: metaSpendRows }, { data: unmatchedSpendRows }, { data: manualSpendRows }] =
    await Promise.all([metaQ, unmatchedQ, manualQ]);
  const metaSpendTotal      = ((metaSpendRows ?? []) as { spend_mad: number }[]).reduce((s, r) => s + (r.spend_mad ?? 0), 0);
  const unmatchedSpendTotal = ((unmatchedSpendRows ?? []) as { spend_mad: number }[]).reduce((s, r) => s + (r.spend_mad ?? 0), 0);
  const manualSpendTotal    = ((manualSpendRows ?? []) as { amount_mad: number }[]).reduce((s, r) => s + (r.amount_mad ?? 0), 0);
  const total_ads_spend     = Math.round((metaSpendTotal + unmatchedSpendTotal + manualSpendTotal) * 100) / 100;
  const real_profit_net_ads = Math.round((real_profit - total_ads_spend) * 100) / 100;

  // ── Commissions call center (agents) sur les commandes payées de la période ──
  const paidRowsByAgent = new Map<string, number>();
  for (const r of rows) {
    if (r.status === "paid" && r.is_paid && r.assigned_to) {
      paidRowsByAgent.set(r.assigned_to, (paidRowsByAgent.get(r.assigned_to) ?? 0) + 1);
    }
  }
  let total_call_center_cost = 0;
  if (paidRowsByAgent.size > 0) {
    const { data: agentRates } = await supabaseAdmin
      .from("cc_agents")
      .select("id, commission")
      .in("id", [...paidRowsByAgent.keys()]);
    const rateById = new Map(((agentRates ?? []) as { id: string; commission: number }[]).map((a) => [a.id, a.commission ?? 3]));
    for (const [agentId, count] of paidRowsByAgent) {
      total_call_center_cost += count * (rateById.get(agentId) ?? 3);
    }
  }
  total_call_center_cost = Math.round(total_call_center_cost * 100) / 100;

  // ── Autres charges (domaine, abonnements, etc. — table expenses) ──
  let expensesQ = supabaseAdmin.from("expenses").select("amount_mad");
  if (filter) expensesQ = expensesQ.gte("expense_date", filter.from).lte("expense_date", filter.to);
  const { data: expenseRows } = await expensesQ;
  const total_other_expenses = Math.round(
    ((expenseRows ?? []) as { amount_mad: number }[]).reduce((s, e) => s + (e.amount_mad ?? 0), 0) * 100
  ) / 100;

  const true_final_profit = Math.round(
    (real_profit - total_ads_spend - total_call_center_cost - total_other_expenses) * 100
  ) / 100;

  return {
    total_leads, confirmed_count, sent_to_delivery_count, in_transit_count,
    delivered_count, paid_count, returned_count, refused_count,
    no_answer_count, cancelled_count,
    estimated_revenue, real_revenue, estimated_profit, real_profit,
    total_cogs, total_delivery_cost, total_return_losses, pending_collection, net_a_recevoir,
    net_collected, total_ads_spend, real_profit_net_ads,
    total_call_center_cost, total_other_expenses, true_final_profit,
    confirmation_rate, delivery_rate,
    total_delivery_margin, total_delivery_overcharge, casa_orders_count,
    net_margin_pct, roi,
  };
}

// ── Finance anomalies ──────────────────────────────────────────────────────────
export async function getFinanceAnomalies(limit = 50): Promise<FinanceAnomaly[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("finance_anomalies")
    .select("*")
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as FinanceAnomaly[];
}

// ── Detect and save anomalies from current orders ─────────────────────────────
export async function detectFinanceAnomalies(filter?: DateFilter): Promise<number> {
  const supabase = await createClient();

  let q = supabase
    .from("orders")
    .select("id,order_number,delivery_tracking_number,customer_city,total_amount_mad,delivery_cost_real_mad,actual_delivery_cost,is_paid,status,real_profit_mad")
    .neq("status", "cancelled");

  if (filter) {
    q = q.gte("created_at", filter.from).lte("created_at", filter.to + "T23:59:59");
  }

  const { data } = await q;
  type ORow = {
    id: string; order_number: string; delivery_tracking_number: string | null;
    customer_city: string | null; total_amount_mad: number;
    delivery_cost_real_mad: number; actual_delivery_cost: number | null;
    is_paid: boolean; status: string; real_profit_mad: number | null;
  };

  const orders = (data ?? []) as ORow[];
  const anomalies: Record<string, unknown>[] = [];

  for (const o of orders) {
    const city = o.customer_city ?? "";
    const expectedCost = getExpectedDeliveryCost(city);
    const actualCost   = o.actual_delivery_cost ?? o.delivery_cost_real_mad ?? expectedCost;
    const feeDiff      = actualCost - expectedCost;

    // Delivery overcharge
    if (feeDiff > 0.5) {
      anomalies.push({
        order_id:        o.id,
        tracking_number: o.delivery_tracking_number,
        anomaly_type:    "delivery_overcharge",
        expected_value:  expectedCost,
        actual_value:    actualCost,
        difference:      feeDiff,
        description:     `${normalizeCity(city)}: attendu ${expectedCost} MAD, facturé ${actualCost} MAD`,
      });
    }

    // Delivered but unpaid for too long
    if (["delivered","paid"].includes(o.status) && !o.is_paid) {
      anomalies.push({
        order_id:        o.id,
        tracking_number: o.delivery_tracking_number,
        anomaly_type:    "unpaid_delivered",
        expected_value:  o.total_amount_mad,
        actual_value:    0,
        difference:      o.total_amount_mad,
        description:     `Commande livrée non payée: ${o.total_amount_mad} MAD`,
      });
    }

    // Negative profit
    if (o.is_paid && o.real_profit_mad !== null && o.real_profit_mad < -10) {
      anomalies.push({
        order_id:        o.id,
        tracking_number: o.delivery_tracking_number,
        anomaly_type:    "negative_profit",
        expected_value:  0,
        actual_value:    o.real_profit_mad,
        difference:      o.real_profit_mad,
        description:     `Profit négatif: ${o.real_profit_mad.toFixed(2)} MAD`,
      });
    }
  }

  if (anomalies.length > 0) {
    // Upsert anomalies (skip if already exists for same order + type)
    for (const a of anomalies) {
      await supabase.from("finance_anomalies").upsert(
        a as never,
        { onConflict: "order_id,anomaly_type", ignoreDuplicates: true }
      );
    }
  }

  return anomalies.length;
}

// ── Product performance ────────────────────────────────────────────────────────
export async function getProductPerformance(filter?: DateFilter): Promise<ProductPerformance[]> {
  const supabase = await createClient();

  const { data: products } = await supabase
    .from("products")
    .select("id,name,sku,sale_price_mad,total_cost_mad,estimated_profit_mad,ads_cost_mad,packaging_cost_mad,confirmation_cost_mad,shipping_cost_mad")
    .order("name");

  if (!products?.length) return [];

  const ps = products as {
    id: string; name: string; sku: string; sale_price_mad: number;
    total_cost_mad: number; estimated_profit_mad: number;
    ads_cost_mad: number; packaging_cost_mad: number;
    confirmation_cost_mad: number; shipping_cost_mad: number;
  }[];

  // Fetch primary image per product in one batched query
  const { data: imgRows } = await supabase
    .from("product_images")
    .select("product_id, public_url, is_primary, display_order")
    .in("product_id", ps.map((p) => p.id))
    .order("display_order");
  const imageByProduct = new Map<string, string>();
  for (const img of (imgRows ?? []) as { product_id: string; public_url: string; is_primary: boolean }[]) {
    const existing = imageByProduct.get(img.product_id);
    if (!existing || img.is_primary) imageByProduct.set(img.product_id, img.public_url);
  }

  // Real synced ad spend (Meta/Google/TikTok) overlapping the selected
  // period, summed across platforms. Falls back to the manual ads_cost_mad
  // field on the product when no sync has happened yet for this period.
  const realAdSpendByProduct = new Map<string, number>();
  try {
    let adSpendQ = supabase
      .from("product_ad_spend")
      .select("product_id, spend_mad, period_start, period_end")
      .in("product_id", ps.map((p) => p.id));
    if (filter) {
      adSpendQ = adSpendQ.lte("period_start", filter.to).gte("period_end", filter.from);
    }
    const { data: adSpendRows } = await adSpendQ;
    for (const row of (adSpendRows ?? []) as { product_id: string; spend_mad: number }[]) {
      realAdSpendByProduct.set(row.product_id, (realAdSpendByProduct.get(row.product_id) ?? 0) + row.spend_mad);
    }
  } catch { /* table may not exist yet — fall back silently */ }

  // Live spend from Meta API — spend for today, fetched in real time.
  // This is what powers the ADS/O (en cours) column.
  // Only fetches when Meta credentials are configured; null otherwise.
  const liveSpendByProduct = new Map<string, number>();
  try {
    const { data: metaSettings } = await supabaseAdmin
      .from("ad_platform_settings")
      .select("access_token, account_id, is_active")
      .eq("platform", "meta")
      .maybeSingle();

    if (metaSettings && (metaSettings as { is_active: boolean }).is_active) {
      const { MetaAdsClient } = await import("@/lib/ads/meta/client");
      const { matchCampaignsToProducts } = await import("@/lib/ads/matcher");
      const today = new Date().toISOString().slice(0, 10);
      const client = new MetaAdsClient(
        (metaSettings as { access_token: string }).access_token,
        (metaSettings as { account_id: string }).account_id
      );
      const liveResult = await client.getCampaignSpend(today, today);
      if (liveResult.ok && liveResult.campaigns.length > 0) {
        const productList = ps.map((p) => ({ id: p.id, sku: p.sku, name: p.name }));
        const { matches } = matchCampaignsToProducts(productList, liveResult.campaigns);
        for (const m of matches) {
          if (m.total_spend > 0) liveSpendByProduct.set(m.product_id, m.total_spend);
        }
      }
    }
  } catch { /* live fetch failed — ads_live stays null */ }

  // Fix: filter orders by period FIRST, then get items for those orders only
  // This prevents counting all-time orders when a date filter is active
  let ordPeriodQ = supabase
    .from("orders")
    .select("id,status,is_paid,total_amount_mad,estimated_profit,real_profit_mad,cogs_total,delivery_cost_real_mad,return_cost_mad")
    .neq("status", "cancelled");
  if (filter) {
    ordPeriodQ = ordPeriodQ.gte("created_at", filter.from).lte("created_at", filter.to + "T23:59:59");
  }
  const { data: periodOrders } = await ordPeriodQ;
  const periodOrderIds = ((periodOrders ?? []) as { id: string }[]).map((o) => o.id);
  if (!periodOrderIds.length) return ps.map((p) => makeEmptyPerf(p, imageByProduct.get(p.id) ?? null, realAdSpendByProduct.get(p.id)));

  const { data: items } = await supabase
    .from("order_items")
    .select("product_id,order_id")
    .in("product_id", ps.map((p) => p.id))
    .in("order_id", periodOrderIds.slice(0, 500));
  if (!items?.length) return ps.map((p) => makeEmptyPerf(p, imageByProduct.get(p.id) ?? null, realAdSpendByProduct.get(p.id)));

  const orderIds = [...new Set((items as { order_id: string }[]).map((i) => i.order_id))];

  const ordQ = supabase
    .from("orders")
    .select("id,status,is_paid,total_amount_mad,estimated_profit,real_profit_mad,cogs_total,delivery_cost_real_mad,return_cost_mad")
    .in("id", orderIds)
    .neq("status", "cancelled");

  const { data: orders } = await ordQ;
  type OrderRow = {
    id: string; status: string; is_paid: boolean; total_amount_mad: number;
    estimated_profit: number; real_profit_mad: number | null;
    cogs_total: number; delivery_cost_real_mad: number; return_cost_mad: number;
  };
  const ordersMap = new Map<string, Omit<OrderRow, "id">>();
  for (const o of (orders ?? []) as unknown as OrderRow[]) {
    ordersMap.set(o.id, o);
  }

  const productOrders = new Map<string, string[]>();
  for (const item of (items as { product_id: string; order_id: string }[])) {
    if (!productOrders.has(item.product_id)) productOrders.set(item.product_id, []);
    productOrders.get(item.product_id)!.push(item.order_id);
  }

  const CONF = new Set(["confirmed","sent_to_delivery","in_transit","delivered","paid"]);
  const DELV = new Set(["delivered","paid"]);

  return ps.map((p) => {
    const oIds = productOrders.get(p.id) ?? [];
    const rows = oIds.map((id) => ordersMap.get(id)).filter(Boolean) as {
      status: string; is_paid: boolean; total_amount_mad: number;
      estimated_profit: number; real_profit_mad: number | null;
      cogs_total: number; delivery_cost_real_mad: number; return_cost_mad: number;
    }[];

    const lead_count      = rows.length;
    const confirmed_count = rows.filter((r) => CONF.has(r.status)).length;
    const delivered_count = rows.filter((r) => DELV.has(r.status)).length;
    const returned_count  = rows.filter((r) => r.status === "returned").length;
    const refused_count   = rows.filter((r) => r.status === "refused_delivery").length;

    const confirmation_rate = lead_count > 0
      ? Math.round(confirmed_count / lead_count * 1000) / 10 : 0;
    const delivery_rate = confirmed_count > 0
      ? Math.round(delivered_count / confirmed_count * 1000) / 10 : 0;
    const refusal_rate = confirmed_count > 0
      ? Math.round(refused_count / confirmed_count * 1000) / 10 : 0;

    const total_revenue    = rows.reduce((s, r) => s + (r.total_amount_mad ?? 0), 0);
    const real_revenue     = rows.filter((r) => r.is_paid).reduce((s, r) => s + (r.total_amount_mad ?? 0), 0);
    const estimated_profit = rows.reduce((s, r) => s + (r.estimated_profit ?? 0), 0);
    const total_cogs       = rows.reduce((s, r) => s + (r.cogs_total ?? 0), 0);
    const total_delivery_cost = rows.reduce((s, r) => s + (r.delivery_cost_real_mad ?? 0), 0);
    const return_losses    = rows.reduce((s, r) => s + (r.return_cost_mad ?? 0), 0);

    // Real ad spend from a connected platform (Meta/Google/TikTok) takes
    // priority over the manual ads_cost_mad field on the product. The manual
    // field was a one-time estimate; the synced value reflects what was
    // actually spent during the selected period.
    const realAdSpend   = realAdSpendByProduct.get(p.id);
    const adsCostToUse  = realAdSpend ?? p.ads_cost_mad ?? 0;
    const is_real_ad_spend = realAdSpend !== undefined;

    // real_profit_mad stored on each order already nets out the product's
    // manual ads_cost_mad at order time. When a real synced spend exists for
    // the period, replace that estimate with the real total instead.
    const real_profit_base = rows.filter((r) => r.is_paid).reduce((s, r) => s + (r.real_profit_mad ?? 0), 0);
    const real_profit = is_real_ad_spend
      ? real_profit_base + (p.ads_cost_mad ?? 0) * rows.filter((r) => r.is_paid).length - realAdSpend!
      : real_profit_base;

    const real_margin_pct  = real_revenue > 0
      ? Math.round(real_profit / real_revenue * 1000) / 10 : 0;

    const performance_status =
      lead_count === 0 ? "no_data" :
      real_profit < 0  ? "losing" :
      real_margin_pct >= 15 ? "profitable" : "needs_review";

    // ── Ads budget analysis ─────────────────────────────────────────────────
    // Number of days in the selected period (default 30 if no filter)
    const nbDays = filter
      ? Math.max(1, Math.round((new Date(filter.to).getTime() - new Date(filter.from).getTime()) / 86400_000) + 1)
      : 30;

    // Total ads spend for this product (real from platform API or manual estimate × leads)
    const ads_total = is_real_ad_spend
      ? adsCostToUse
      : (p.ads_cost_mad ?? 0) * lead_count;

    // Profit sans ads = what's left after ALL costs except ads
    // = sale_price - (total_cost - ads_cost) = pure margin before ad spend
    // ADS MAX ESTIMÉ = (prix_vente - prix_achat - charges) ÷ 4
    // Marge sans ads = sale_price - total_cost (sans la part ads déjà dans total_cost)
    const marge_sans_ads = p.sale_price_mad - (p.total_cost_mad - (p.ads_cost_mad ?? 0));
    const ads_max_estimation = marge_sans_ads > 0
      ? Math.round(marge_sans_ads / 4)
      : 0;

    // ADS MAX RÉEL = total ads Meta dépensés ÷ nombre livré
    // = coût réel en ads pour chaque commande livrée
    const ads_max_real = delivered_count > 0 && adsCostToUse > 0
      ? Math.round(adsCostToUse / delivered_count)
      : 0;

    // COÛT PAR LIVRÉ = même que ads_max_real
    const cost_per_delivered = ads_max_real;

    // Suppress nbDays unused warning — kept for future daily budget feature
    void nbDays;

    return {
      product_id: p.id, product_name: p.name, sku: p.sku,
      image_url: imageByProduct.get(p.id) ?? null,
      sale_price_mad: p.sale_price_mad, total_cost_mad: p.total_cost_mad,
      unit_profit: p.estimated_profit_mad, ads_cost_mad: adsCostToUse, is_real_ad_spend,
      lead_count, confirmed_count, delivered_count, returned_count, refused_count,
      confirmation_rate, delivery_rate, refusal_rate,
      total_revenue, real_revenue, estimated_profit, real_profit,
      total_cogs, total_delivery_cost, return_losses, real_margin_pct,
      performance_status: performance_status as ProductPerformance["performance_status"],
      ads_total, ads_max_estimation, ads_max_real, cost_per_delivered,
      ads_live: liveSpendByProduct.get(p.id) ?? null,
    };
  });
}

function makeEmptyPerf(
  p: { id: string; name: string; sku: string; sale_price_mad: number; total_cost_mad: number; estimated_profit_mad: number; ads_cost_mad: number },
  imageUrl: string | null = null,
  realAdSpend?: number
): ProductPerformance {
  return {
    product_id: p.id, product_name: p.name, sku: p.sku,
    image_url: imageUrl,
    sale_price_mad: p.sale_price_mad, total_cost_mad: p.total_cost_mad,
    unit_profit: p.estimated_profit_mad,
    ads_cost_mad: realAdSpend ?? p.ads_cost_mad,
    is_real_ad_spend: realAdSpend !== undefined,
    lead_count: 0, confirmed_count: 0, delivered_count: 0, returned_count: 0, refused_count: 0,
    confirmation_rate: 0, delivery_rate: 0, refusal_rate: 0,
    total_revenue: 0, real_revenue: 0, estimated_profit: 0, real_profit: 0,
    total_cogs: 0, total_delivery_cost: 0, return_losses: 0, real_margin_pct: 0,
    performance_status: "no_data",
    ads_total: 0, ads_max_estimation: 0, ads_max_real: 0, cost_per_delivered: 0, ads_live: null,
  };
}

// ── Daily finance ──────────────────────────────────────────────────────────────
export async function getDailyFinance(days = 30, storeId?: string): Promise<DailyFinance[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

  const { data } = await supabase
    .from("orders")
    .select("created_at,status,is_paid,total_amount_mad,estimated_profit,real_profit_mad")
    .gte("created_at", since)
    .neq("status", "cancelled");

  const map = new Map<string, DailyFinance>();
  const CONF = new Set(["confirmed","sent_to_delivery","in_transit","delivered","paid"]);
  const DELV = new Set(["delivered","paid"]);

  for (const o of (data ?? []) as {
    created_at: string; status: string; is_paid: boolean;
    total_amount_mad: number; estimated_profit: number; real_profit_mad: number | null;
  }[]) {
    const day = o.created_at.slice(0, 10);
    if (!map.has(day)) map.set(day, {
      day, leads:0, confirmed:0, delivered:0, returned:0,
      estimated_revenue:0, real_revenue:0, estimated_profit:0, real_profit:0,
    });
    const d = map.get(day)!;
    d.leads++;
    if (CONF.has(o.status)) d.confirmed++;
    if (DELV.has(o.status)) d.delivered++;
    if (o.status === "returned") d.returned++;
    d.estimated_revenue += o.total_amount_mad ?? 0;
    if (o.is_paid) d.real_revenue += o.total_amount_mad ?? 0;
    d.estimated_profit += o.estimated_profit ?? 0;
    if (o.is_paid) d.real_profit += o.real_profit_mad ?? 0;
  }

  return [...map.values()].sort((a, b) => b.day.localeCompare(a.day));
}

// ── Delivery claims ────────────────────────────────────────────────────────────
export async function getDeliveryClaims(): Promise<{ claims: DeliveryClaim[]; total: number }> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select("id,order_number,customer_name,customer_phone,delivery_tracking_number,total_amount_mad,status,is_paid,return_cost_mad,delivery_cost_real_mad,updated_at")
    .in("status", ["delivered","paid","returned"])
    .order("updated_at", { ascending: false })
    .limit(200);

  const claims = ((data ?? []) as {
    id: string; order_number: string; customer_name: string; customer_phone: string;
    delivery_tracking_number: string | null; total_amount_mad: number;
    status: string; is_paid: boolean; return_cost_mad: number;
    delivery_cost_real_mad: number; updated_at: string;
  }[])
    .filter((o) =>
      (["delivered","paid"].includes(o.status) && !o.is_paid) ||
      o.status === "returned"
    )
    .map((o) => ({
      ...o,
      claim_amount: ["delivered","paid"].includes(o.status) && !o.is_paid
        ? o.total_amount_mad : o.return_cost_mad,
      claim_type: (["delivered","paid"].includes(o.status) && !o.is_paid
        ? "pending_collection"
        : o.status === "returned" ? "return_claim" : "other") as DeliveryClaim["claim_type"],
    }));

  const total = claims.reduce((s, c) => s + c.claim_amount, 0);
  return { claims, total };
}
