/**
 * lib/finance/fee-rules.ts
 *
 * Dynamic shipping fee rules engine.
 * Replaces hardcoded Casa=25/Other=35 logic.
 * Rules loaded from DB, cached in memory per request.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export type FeeRule = {
  city_pattern:    string;
  is_casablanca:   boolean;
  shipping_fee:    number;
  return_fee:      number;
  fulfillment_fee: number;
  priority:        number;
};

// ─── Cache rules per request (Next.js request cache) ─────────────────────────
let cachedRules: Map<string, FeeRule[]> | null = null;
let cacheExpiry = 0;

async function getRules(providerSlug: string): Promise<FeeRule[]> {
  const now = Date.now();
  if (cachedRules && now < cacheExpiry) {
    return cachedRules.get(providerSlug) ?? [];
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("shipping_fee_rules")
      .select("provider_slug, city_pattern, is_casablanca, shipping_fee, return_fee, fulfillment_fee, priority")
      .eq("is_active", true)
      .order("priority", { ascending: false });

    if (error) throw error;

    cachedRules = new Map<string, FeeRule[]>();
    for (const r of (data ?? []) as (FeeRule & { provider_slug: string })[]) {
      const arr = cachedRules.get(r.provider_slug) ?? [];
      arr.push(r);
      cachedRules.set(r.provider_slug, arr);
    }
    cacheExpiry = now + 5 * 60 * 1000;
  } catch (e) {
    // Table missing in production — use empty map (fallback to hardcoded)
    console.warn("[fee-rules] shipping_fee_rules unavailable, using fallback:", e);
    cachedRules = new Map<string, FeeRule[]>();
    cacheExpiry = now + 60 * 1000; // retry in 1 min
  }

  return cachedRules.get(providerSlug) ?? [];
}

// ─── Main fee lookup ──────────────────────────────────────────────────────────
export async function getShippingFees(
  city: string,
  providerSlug = "digylog",
  storeId?: string
): Promise<{ shippingFee: number; returnFee: number; fulfillmentFee: number; isCasablanca: boolean; rule: string }> {
  const rules = await getRules(providerSlug);
  const cityNorm = city.toLowerCase().trim();

  // Find best matching rule (highest priority first)
  for (const rule of rules) {
    const pattern = rule.city_pattern.toLowerCase();
    const matches = pattern === "%" || cityNorm.includes(pattern) || pattern.includes(cityNorm);
    if (matches) {
      return {
        shippingFee:    rule.shipping_fee,
        returnFee:      rule.return_fee,
        fulfillmentFee: rule.fulfillment_fee,
        isCasablanca:   rule.is_casablanca,
        rule:           rule.city_pattern,
      };
    }
  }

  // Fallback if no rules in DB
  const isCasa = isKnownCasablanca(cityNorm);
  return {
    shippingFee:    isCasa ? 25 : 35,
    returnFee:      isCasa ? 15 : 20,
    fulfillmentFee: 0,
    isCasablanca:   isCasa,
    rule:           "fallback",
  };
}

// ─── Synchronous fallback (when DB not available) ─────────────────────────────
const CASA_PATTERNS = ["casablanca", "casa", "derb sultan", "ain chock", "hay hassani", "sidi maarouf", "ain sebaa", "moulay rachid", "sbata", "bournazel", "maarif", "ain diab", "californie", "anfa", "gauthier"];

export function isKnownCasablanca(city: string): boolean {
  const n = city.toLowerCase().trim();
  return CASA_PATTERNS.some((p) => n.includes(p) || p.includes(n));
}

export function getShippingFeeSync(city: string): { shippingFee: number; returnFee: number; isCasablanca: boolean } {
  const isCasa = isKnownCasablanca(city);
  return { shippingFee: isCasa ? 25 : 35, returnFee: isCasa ? 15 : 20, isCasablanca: isCasa };
}

// ─── Expected payout calculation ──────────────────────────────────────────────
export async function calculateExpectedPayout(params: {
  codAmount:    number;
  city:         string;
  isReturned:   boolean;
  providerSlug: string;
}): Promise<{
  expectedShippingFee: number;
  expectedReturnFee:   number;
  expectedNet:         number;
  isCasablanca:        boolean;
}> {
  const fees = await getShippingFees(params.city, params.providerSlug);

  if (params.isReturned) {
    // Returned: no COD, pay return fee
    return {
      expectedShippingFee: 0,
      expectedReturnFee:   fees.returnFee,
      expectedNet:         -(fees.returnFee),  // net cost to us
      isCasablanca:        fees.isCasablanca,
    };
  }

  // Delivered: receive COD, minus shipping fee
  const expectedNet = params.codAmount - fees.shippingFee;
  return {
    expectedShippingFee: fees.shippingFee,
    expectedReturnFee:   0,
    expectedNet,
    isCasablanca:        fees.isCasablanca,
  };
}
