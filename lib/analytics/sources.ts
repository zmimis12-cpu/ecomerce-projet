/**
 * lib/analytics/sources.ts — « Sources » : quelle plateforme (Meta / TikTok / Google…)
 * et quel placement (Instagram / Facebook) ramène des commandes RENTABLES.
 *
 * Source d'une commande = traces laissées par le client (navigateur in-app Instagram /
 * Facebook / TikTok, ttclid, fbc, gclid). Pub = product_ad_spend (déjà synchronisé)
 * + répartition Instagram/Facebook lue chez Meta (1 appel par compte, en cache 1 h).
 * Lecture seule, 3–4 requêtes groupées → léger pour Supabase.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readCarrierFees, getCarrierResolver, deliveryFee } from "@/lib/delivery/carrier-fees";

export type SourceKey = "instagram" | "facebook" | "meta_other" | "tiktok" | "google" | "direct" | "manual";
export type PlatformKey = "meta" | "tiktok" | "google" | "direct" | "manual";

export const SOURCE_LABEL: Record<SourceKey, string> = {
  instagram: "Instagram", facebook: "Facebook", meta_other: "Meta (navigateur externe)",
  tiktok: "TikTok", google: "Google", direct: "Direct / organique", manual: "Manuel (téléphone / admin)",
};
export const PLATFORM_LABEL: Record<PlatformKey, string> = {
  meta: "Meta", tiktok: "TikTok", google: "Google", direct: "Direct / organique", manual: "Manuel",
};
const PLATFORM_OF: Record<SourceKey, PlatformKey> = {
  instagram: "meta", facebook: "meta", meta_other: "meta", tiktok: "tiktok", google: "google", direct: "direct", manual: "manual",
};

const DELIVERED = new Set(["delivered", "paid", "exchanged"]);
const RETURNED = new Set(["returned", "refused_delivery", "partially_returned"]);
const SHIPPED_OPEN = new Set(["sent_to_delivery", "in_transit", "not_sent", "shipped"]);
const TO_SHIP = new Set(["confirmed", "processing"]);
const PENDING = new Set(["new", "no_answer", "pending", "callback", "postponed"]);

type OrderRow = {
  id: string; status: string; created_at: string; user_agent: string | null; meta_fbc: string | null;
  tiktok_ttclid: string | null; source: string | null; customer_city: string | null;
  total_amount_mad: number | null; cogs_total: number | null; actual_delivery_cost: number | null;
  delivery_company_id: string | null; fulfillment_type: string | null; metadata: Record<string, unknown> | null;
};

export function sourceOf(o: Pick<OrderRow, "user_agent" | "meta_fbc" | "tiktok_ttclid" | "source" | "metadata">): SourceKey {
  const ua = o.user_agent ?? "";
  const md = (o.metadata ?? {}) as { gclid?: string; gbraid?: string; wbraid?: string; utm_source?: string };
  if (o.tiktok_ttclid || /musical_ly|trill_|BytedanceWebview|TikTok/i.test(ua) || md.utm_source === "tiktok") return "tiktok";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return "facebook";
  if (md.gclid || md.gbraid || md.wbraid || md.utm_source === "google") return "google";
  if (o.meta_fbc) return "meta_other";
  if (!ua) return "manual";
  return "direct";
}

export function deviceOf(ua: string | null): string {
  const u = ua ?? "";
  if (/iPhone|iPad/i.test(u)) return "iPhone";
  if (/SM-|Samsung/i.test(u)) return "Samsung";
  if (/RMX|Realme/i.test(u)) return "Realme";
  if (/CPH|OPPO/i.test(u)) return "Oppo";
  if (/Redmi|Xiaomi|POCO|\bM2\d{3}|\b2[0-3]\d{6}[A-Z]/i.test(u)) return "Xiaomi";
  if (/Infinix/i.test(u)) return "Infinix";
  if (/TECNO/i.test(u)) return "Tecno";
  if (/vivo|\bV2\d{3}/i.test(u)) return "Vivo";
  if (/HUAWEI|HONOR|\b[A-Z]{3}-[LA]X\d/i.test(u)) return "Huawei/Honor";
  if (/Android/i.test(u)) return "Android (autre)";
  if (/Windows|Macintosh/i.test(u)) return "Ordinateur";
  return "Inconnu";
}

export type Stats = {
  orders: number; pending: number; confirmed: number; shipped: number; delivered: number; returned: number;
  spend: number | null; margin: number; returnCost: number;
  confRate: number | null; delRate: number | null;
  cpo: number | null; cpConfirmed: number | null; cpDelivered: number | null;
  profit: number | null; profitProjected: number | null;
};
type Acc = { orders: number; pending: number; confirmed: number; toShip: number; onRoad: number; delivered: number; returned: number; margin: number; returnCost: number; spend: number | null };
const emptyAcc = (): Acc => ({ orders: 0, pending: 0, confirmed: 0, toShip: 0, onRoad: 0, delivered: 0, returned: 0, margin: 0, returnCost: 0, spend: null });

function finish(a: Acc, fallbackMargin: number, fallbackDel: number): Stats {
  const treated = a.confirmed + (a.orders - a.pending - a.confirmed);
  const confRate = treated >= 3 ? a.confirmed / treated : null;
  const finished = a.delivered + a.returned;
  const delRate = finished >= 3 ? a.delivered / finished : null;
  const m = a.delivered > 0 ? a.margin / a.delivered : fallbackMargin;
  const r = delRate ?? fallbackDel;
  const avgRet = a.returned > 0 ? a.returnCost / a.returned : 35;
  const coming = a.onRoad + a.toShip + a.pending * (confRate ?? 0.6);
  const sp = a.spend;
  const realized = a.margin - a.returnCost;
  const projected = realized + coming * r * m - coming * (1 - r) * avgRet;
  const div = (x: number) => (sp != null && x > 0 ? Math.round(sp / x) : null);
  return {
    orders: a.orders, pending: a.pending, confirmed: a.confirmed, shipped: a.onRoad + finished, delivered: a.delivered, returned: a.returned,
    spend: sp == null ? null : Math.round(sp), margin: Math.round(a.margin), returnCost: Math.round(a.returnCost),
    confRate, delRate,
    cpo: div(a.orders), cpConfirmed: div(a.confirmed), cpDelivered: div(a.delivered),
    profit: Math.round(realized - (sp ?? 0)), profitProjected: Math.round(projected - (sp ?? 0)),
  };
}

/** Répartition de la dépense Meta par placement (facebook / instagram / autre), part 0–1. */
async function metaPlacementShare(from: string, to: string): Promise<{ facebook: number; instagram: number; other: number } | null> {
  try {
    const { activeMetaAccounts, act } = await import("@/lib/ads/meta-accounts");
    const accs = await activeMetaAccounts();
    const seen = new Set<string>();
    const tot = { facebook: 0, instagram: 0, other: 0 };
    await Promise.all(accs.filter((a) => { const id = act(a); if (!id || !a.token || seen.has(id)) return false; seen.add(id); return true; }).map(async (a) => {
      const url = `https://graph.facebook.com/v21.0/${act(a)}/insights?fields=spend&breakdowns=publisher_platform&time_range=${encodeURIComponent(JSON.stringify({ since: from, until: to }))}&access_token=${encodeURIComponent(a.token)}`;
      const res = await fetch(url, { next: { revalidate: 3600, tags: ["meta-placements"] } });
      const j = await res.json() as { data?: { publisher_platform: string; spend: string }[] };
      for (const r of j.data ?? []) {
        const s = Number(r.spend) || 0;
        if (r.publisher_platform === "facebook") tot.facebook += s;
        else if (r.publisher_platform === "instagram") tot.instagram += s;
        else tot.other += s;
      }
    }));
    const sum = tot.facebook + tot.instagram + tot.other;
    return sum > 0 ? { facebook: tot.facebook / sum, instagram: tot.instagram / sum, other: tot.other / sum } : null;
  } catch { return null; }
}

async function fetchAll<T>(build: (a: number, b: number) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < 30; p++) {
    const { data } = await build(p * 1000, p * 1000 + 999);
    const rows = (data ?? []) as T[]; out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export type SourcesReport = {
  sources: ({ key: SourceKey; label: string } & Stats)[];
  platforms: ({ key: PlatformKey; label: string } & Stats)[];
  placementShare: { facebook: number; instagram: number; other: number } | null;
  products: { id: string; name: string; cells: Partial<Record<PlatformKey, Stats>>; total: Stats }[];
  productList: { id: string; name: string }[];
  profile: Partial<Record<PlatformKey, { cities: [string, number][]; hours: [number, number][]; devices: [string, number][]; deliveredCities: [string, number][] }>>;
  total: Stats;
};

export async function getSourcesReport(from: string, to: string, productId?: string | null): Promise<SourcesReport> {
  const [orders, fees, carrierOf, share] = await Promise.all([
    fetchAll<OrderRow>((a, b) => supabaseAdmin.from("orders")
      .select("id,status,created_at,user_agent,meta_fbc,tiktok_ttclid,source,customer_city,total_amount_mad,cogs_total,actual_delivery_cost,delivery_company_id,fulfillment_type,metadata")
      .gte("created_at", from).lte("created_at", `${to}T23:59:59`).not("is_duplicate", "is", true).not("is_exchange", "is", true)
      .order("created_at").range(a, b)),
    readCarrierFees(), getCarrierResolver(), metaPlacementShare(from, to),
  ]);

  // Produit de chaque commande (1ʳᵉ ligne) — par paquets
  const prodOf = new Map<string, string>();
  const ids = orders.map((o) => o.id);
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabaseAdmin.from("order_items").select("order_id,product_id").in("order_id", ids.slice(i, i + 300));
    for (const it of (data ?? []) as { order_id: string; product_id: string | null }[]) if (it.product_id && !prodOf.has(it.order_id)) prodOf.set(it.order_id, it.product_id);
  }
  const { data: spendRows } = await supabaseAdmin.from("product_ad_spend").select("product_id,platform,spend_mad").gte("period_start", from).lte("period_end", to);
  const spendBy = new Map<string, number>(); // `${product}|${platform}`
  for (const s of (spendRows ?? []) as { product_id: string; platform: string; spend_mad: number }[]) {
    if (productId && s.product_id !== productId) continue;
    const k = `${s.product_id}|${s.platform}`; spendBy.set(k, (spendBy.get(k) ?? 0) + Number(s.spend_mad || 0));
  }
  const productIds = new Set<string>([...prodOf.values(), ...[...spendBy.keys()].map((k) => k.split("|")[0])]);
  const { data: prods } = await supabaseAdmin.from("products").select("id,name").in("id", [...productIds].length ? [...productIds] : ["00000000-0000-0000-0000-000000000000"]);
  const pname = new Map(((prods ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

  const bySource = new Map<SourceKey, Acc>();
  const byPlatform = new Map<PlatformKey, Acc>();
  const byProdPlat = new Map<string, Acc>();
  const byProd = new Map<string, Acc>();
  const total = emptyAcc();
  const prof = new Map<PlatformKey, { cities: Map<string, number>; hours: Map<number, number>; devices: Map<string, number>; del: Map<string, number> }>();
  const get = <K,>(m: Map<K, Acc>, k: K) => { let a = m.get(k); if (!a) { a = emptyAcc(); m.set(k, a); } return a; };
  const hourFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Africa/Casablanca" });
  const city = (c: string | null) => (c ?? "").trim().replace(/\s+/g, " ").replace(/^./, (x) => x.toUpperCase()) || "—";

  for (const o of orders) {
    const pid = prodOf.get(o.id) ?? "none";
    if (productId && pid !== productId) continue;
    const src = sourceOf(o); const plat = PLATFORM_OF[src];
    const carrier = carrierOf(o);
    const selfFee = Number((o.metadata as { self_delivery_fee?: unknown } | null)?.self_delivery_fee ?? 0) || 0;
    const livFee = carrier === "self" ? selfFee : deliveryFee(fees, carrier, o.customer_city, o.actual_delivery_cost);
    const retFee = carrier === "self" ? selfFee : fees[carrier].returnFee;
    const st = o.status;
    for (const a of [get(bySource, src), get(byPlatform, plat), get(byProdPlat, `${pid}|${plat}`), get(byProd, pid), total]) {
      a.orders++;
      if (PENDING.has(st)) a.pending++;
      if (DELIVERED.has(st)) { a.delivered++; a.confirmed++; a.margin += Number(o.total_amount_mad || 0) - Number(o.cogs_total || 0) - livFee; }
      else if (RETURNED.has(st)) { a.returned++; a.confirmed++; a.returnCost += retFee; }
      else if (SHIPPED_OPEN.has(st)) { a.onRoad++; a.confirmed++; }
      else if (TO_SHIP.has(st)) { a.toShip++; a.confirmed++; }
    }
    let p = prof.get(plat);
    if (!p) { p = { cities: new Map(), hours: new Map(), devices: new Map(), del: new Map() }; prof.set(plat, p); }
    const c = city(o.customer_city);
    p.cities.set(c, (p.cities.get(c) ?? 0) + 1);
    if (DELIVERED.has(st)) p.del.set(c, (p.del.get(c) ?? 0) + 1);
    const h = parseInt(hourFmt.format(new Date(o.created_at)), 10) % 24 || 0;
    p.hours.set(h, (p.hours.get(h) ?? 0) + 1);
    const d = deviceOf(o.user_agent);
    p.devices.set(d, (p.devices.get(d) ?? 0) + 1);
  }

  // Dépense par plateforme (+ par produit) ; Meta répartie Instagram / Facebook / autre
  const platSpend = (plat: string, pid?: string) => {
    let s = 0, any = false;
    for (const [k, v] of spendBy) { const [p, pl] = k.split("|"); if (pl === plat && (!pid || p === pid)) { s += v; any = true; } }
    return any ? s : null;
  };
  for (const plat of ["meta", "tiktok", "google"] as PlatformKey[]) {
    const s = platSpend(plat);
    if (s != null) get(byPlatform, plat).spend = s;
  }
  const metaSpend = byPlatform.get("meta")?.spend ?? null;
  if (metaSpend != null && share) {
    get(bySource, "instagram").spend = metaSpend * share.instagram;
    get(bySource, "facebook").spend = metaSpend * share.facebook;
    // Audience Network / Messenger + clients ouverts hors appli Meta
    get(bySource, "meta_other").spend = metaSpend * share.other;
  }
  if (byPlatform.get("tiktok")?.spend != null) get(bySource, "tiktok").spend = byPlatform.get("tiktok")!.spend;
  if (byPlatform.get("google")?.spend != null) get(bySource, "google").spend = byPlatform.get("google")!.spend;
  for (const plat of ["direct", "manual"] as PlatformKey[]) if (byPlatform.has(plat)) get(byPlatform, plat).spend = 0;
  for (const s of ["direct", "manual"] as SourceKey[]) if (bySource.has(s)) get(bySource, s).spend = 0;
  total.spend = [...byPlatform.values()].reduce((s, a) => s + (a.spend ?? 0), 0);

  const fbMargin = total.delivered > 0 ? total.margin / total.delivered : 80;
  const fbDel = (total.delivered + total.returned) > 0 ? total.delivered / (total.delivered + total.returned) : 0.65;

  const sources = (Object.keys(SOURCE_LABEL) as SourceKey[]).filter((k) => bySource.has(k))
    .map((k) => ({ key: k, label: SOURCE_LABEL[k], ...finish(bySource.get(k)!, fbMargin, fbDel) }));
  const platforms = (Object.keys(PLATFORM_LABEL) as PlatformKey[]).filter((k) => byPlatform.has(k))
    .map((k) => ({ key: k, label: PLATFORM_LABEL[k], ...finish(byPlatform.get(k)!, fbMargin, fbDel) }));

  const products: SourcesReport["products"] = [];
  for (const pid of new Set([...byProd.keys(), ...[...spendBy.keys()].map((k) => k.split("|")[0])])) {
    if (pid === "none") continue;
    const cells: Partial<Record<PlatformKey, Stats>> = {};
    let tot = byProd.get(pid) ?? emptyAcc();
    for (const plat of Object.keys(PLATFORM_LABEL) as PlatformKey[]) {
      const a = byProdPlat.get(`${pid}|${plat}`) ?? (platSpend(plat, pid) != null ? emptyAcc() : null);
      if (!a) continue;
      const sp = plat === "direct" || plat === "manual" ? 0 : platSpend(plat, pid);
      cells[plat] = finish({ ...a, spend: sp }, fbMargin, fbDel);
    }
    tot = { ...tot, spend: ["meta", "tiktok", "google"].reduce((s, pl) => s + (platSpend(pl, pid) ?? 0), 0) };
    products.push({ id: pid, name: pname.get(pid) ?? "Produit", cells, total: finish(tot, fbMargin, fbDel) });
  }
  products.sort((a, b) => (b.total.spend ?? 0) - (a.total.spend ?? 0) || b.total.orders - a.total.orders);

  const top = <K,>(m: Map<K, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  const profile: SourcesReport["profile"] = {};
  for (const [plat, p] of prof) profile[plat] = { cities: top(p.cities, 6), hours: top(p.hours, 4), devices: top(p.devices, 5), deliveredCities: top(p.del, 5) };

  const productList = [...pname.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  return { sources, platforms, placementShare: share, products, productList, profile, total: finish(total, fbMargin, fbDel) };
}
