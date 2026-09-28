/**
 * lib/creatives/queries.ts
 * Rapport vidéos (créatives) → commandes → livrées → gains éditeurs.
 * Server-side only (supabaseAdmin).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Statuts qui comptent comme "livré" pour payer l'éditeur */
export const DELIVERED_STATUSES = ["delivered", "paid"];

export type CommissionType = "fixed" | "percent";

export type EditorInfo = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  commissionType: CommissionType;
  commissionValue: number;
};

export type CreativeStat = {
  id: string;
  code: string;
  title: string;
  videoUrl: string | null;
  platform: string;
  status: "draft" | "in_ads" | "paused";
  createdAt: string;
  editorId: string;
  editorName: string;
  productId: string | null;
  productName: string;
  lpSlug: string | null;
  orders: number;      // commandes créées dans la période
  delivered: number;   // livrées dans la période
  revenue: number;     // CA livré
  earnings: number;    // gain éditeur
};

export type EditorStat = EditorInfo & {
  videos: number;
  videosInAds: number;
  orders: number;
  delivered: number;
  revenue: number;
  earnings: number;
};

export type DeliveredOrderRow = {
  id: string;
  orderNumber: string;
  creativeCode: string;
  creativeTitle: string;
  productName: string;
  amount: number;
  deliveredAt: string;
  earning: number;
};

/** "2026-09" → bornes du mois. "all" ou vide → pas de filtre. */
export function periodRange(month?: string | null): { from: Date | null; to: Date | null; key: string } {
  if (!month || month === "all" || !/^\d{4}-\d{2}$/.test(month)) {
    return { from: null, to: null, key: "all" };
  }
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)), key: month };
}

function inRange(iso: string | null, from: Date | null, to: Date | null) {
  if (!iso) return false;
  if (!from || !to) return true;
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t < to.getTime();
}

export function computeEarning(amount: number, type: CommissionType, value: number) {
  return type === "percent" ? Math.round(amount * value) / 100 : value;
}

export async function getVideoEditors(): Promise<EditorInfo[]> {
  const [{ data: users }, { data: settings }] = await Promise.all([
    supabaseAdmin.from("users").select("id, full_name, email, is_active").eq("role", "video_editor" as never),
    supabaseAdmin.from("video_editor_settings" as never).select("user_id, commission_type, commission_value"),
  ]);
  const map = new Map(
    ((settings ?? []) as { user_id: string; commission_type: CommissionType; commission_value: number }[])
      .map((s) => [s.user_id, s]),
  );
  return ((users ?? []) as { id: string; full_name: string; email: string; is_active: boolean }[])
    .map((u) => ({
      id: u.id,
      name: u.full_name || u.email,
      email: u.email,
      isActive: u.is_active,
      commissionType: map.get(u.id)?.commission_type ?? "fixed",
      commissionValue: Number(map.get(u.id)?.commission_value ?? 5),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCreativesReport(opts: { month?: string | null; editorId?: string | null } = {}) {
  const { from, to, key } = periodRange(opts.month);

  let cq = supabaseAdmin
    .from("creatives" as never)
    .select("id, code, title, video_url, platform, status, created_at, editor_id, product_id")
    .order("created_at", { ascending: false });
  if (opts.editorId) cq = cq.eq("editor_id", opts.editorId);

  const [{ data: creativesRaw }, editors] = await Promise.all([cq, getVideoEditors()]);

  type CRow = {
    id: string; code: string; title: string; video_url: string | null; platform: string;
    status: CreativeStat["status"]; created_at: string; editor_id: string; product_id: string | null;
  };
  const creatives = (creativesRaw ?? []) as unknown as CRow[];
  const editorMap = new Map(editors.map((e) => [e.id, e]));

  const productIds = [...new Set(creatives.map((c) => c.product_id).filter(Boolean))] as string[];
  const creativeIds = creatives.map((c) => c.id);

  const [{ data: products }, { data: lps }, { data: ordersRaw }] = await Promise.all([
    productIds.length
      ? supabaseAdmin.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] }),
    productIds.length
      ? supabaseAdmin.from("landing_pages" as never).select("product_id, slug").in("product_id", productIds)
      : Promise.resolve({ data: [] }),
    creativeIds.length
      ? supabaseAdmin
          .from("orders")
          .select("id, order_number, creative_id, status, total_amount_mad, created_at, delivered_at, updated_at")
          .in("creative_id" as never, creativeIds)
      : Promise.resolve({ data: [] }),
  ]);

  const productName = new Map(((products ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const lpSlug = new Map<string, string>();
  for (const l of (lps ?? []) as { product_id: string; slug: string }[]) {
    if (!lpSlug.has(l.product_id)) lpSlug.set(l.product_id, l.slug);
  }

  type ORow = {
    id: string; order_number: string; creative_id: string; status: string;
    total_amount_mad: number; created_at: string; delivered_at: string | null; updated_at: string;
  };
  const orders = (ordersRaw ?? []) as unknown as ORow[];

  const stats = new Map<string, CreativeStat>();
  for (const c of creatives) {
    const ed = editorMap.get(c.editor_id);
    stats.set(c.id, {
      id: c.id, code: c.code, title: c.title, videoUrl: c.video_url, platform: c.platform,
      status: c.status, createdAt: c.created_at, editorId: c.editor_id,
      editorName: ed?.name ?? "—",
      productId: c.product_id,
      productName: c.product_id ? productName.get(c.product_id) ?? "—" : "—",
      lpSlug: c.product_id ? lpSlug.get(c.product_id) ?? null : null,
      orders: 0, delivered: 0, revenue: 0, earnings: 0,
    });
  }

  const deliveredRows: DeliveredOrderRow[] = [];
  for (const o of orders) {
    const s = stats.get(o.creative_id);
    if (!s) continue;
    if (inRange(o.created_at, from, to)) s.orders++;
    const deliveredAt = o.delivered_at ?? o.updated_at;
    if (DELIVERED_STATUSES.includes(o.status) && inRange(deliveredAt, from, to)) {
      const ed = editorMap.get(s.editorId);
      const amount = Number(o.total_amount_mad ?? 0);
      const earning = computeEarning(amount, ed?.commissionType ?? "fixed", ed?.commissionValue ?? 0);
      s.delivered++;
      s.revenue += amount;
      s.earnings += earning;
      deliveredRows.push({
        id: o.id, orderNumber: o.order_number, creativeCode: s.code, creativeTitle: s.title,
        productName: s.productName, amount, deliveredAt, earning,
      });
    }
  }
  deliveredRows.sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt));

  const creativeStats = [...stats.values()];
  const editorStats: EditorStat[] = editors
    .filter((e) => !opts.editorId || e.id === opts.editorId)
    .map((e) => {
      const mine = creativeStats.filter((c) => c.editorId === e.id);
      return {
        ...e,
        videos: mine.length,
        videosInAds: mine.filter((c) => c.status === "in_ads").length,
        orders: mine.reduce((s, c) => s + c.orders, 0),
        delivered: mine.reduce((s, c) => s + c.delivered, 0),
        revenue: mine.reduce((s, c) => s + c.revenue, 0),
        earnings: mine.reduce((s, c) => s + c.earnings, 0),
      };
    });

  return { period: key, creatives: creativeStats, editors: editorStats, deliveredOrders: deliveredRows };
}

export function lpDomain() {
  return process.env.NEXT_PUBLIC_LP_DOMAIN || "hajtek.ma";
}

export function adLink(slug: string | null, code: string) {
  return slug ? `https://${lpDomain()}/lp/${slug}?cr=${code}` : null;
}

export type CreativeOption = {
  id: string;
  code: string;
  title: string;
  editorName: string;
  productId: string | null;
  status: string;
};

/** Liste courte des vidéos pour les selects (création / modification de commande). */
export async function getCreativeOptions(): Promise<CreativeOption[]> {
  const [{ data: cr }, editors] = await Promise.all([
    supabaseAdmin
      .from("creatives" as never)
      .select("id, code, title, editor_id, product_id, status")
      .order("code", { ascending: false }),
    getVideoEditors(),
  ]);
  const names = new Map(editors.map((e) => [e.id, e.name]));
  return ((cr ?? []) as unknown as {
    id: string; code: string; title: string; editor_id: string; product_id: string | null; status: string;
  }[]).map((c) => ({
    id: c.id, code: c.code, title: c.title,
    editorName: names.get(c.editor_id) ?? "—",
    productId: c.product_id, status: c.status,
  }));
}
