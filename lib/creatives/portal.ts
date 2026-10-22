/**
 * lib/creatives/portal.ts — lecture des réglages de l'espace éditeur (server only).
 * Stockage : app_settings.editor_portal = { [editorId]: EditorPortalCfg }
 *            app_settings.editor_video_links = VideoDelivery[]
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePortalCfg, type EditorPortalCfg, type VideoDelivery, type ProductBrief } from "./portal-shared";
export * from "./portal-shared";

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown, label: string) {
  return supabaseAdmin.from("app_settings").upsert(
    { key, value: JSON.stringify(value), category: "creatives", label } as never,
    { onConflict: "key" },
  );
}

export async function readPortalConfigs(): Promise<Record<string, EditorPortalCfg>> {
  const raw = await readJson<Record<string, Partial<EditorPortalCfg>>>("editor_portal", {});
  return Object.fromEntries(Object.entries(raw ?? {}).map(([k, v]) => [k, normalizePortalCfg(v)]));
}

export async function readPortalConfig(editorId: string): Promise<EditorPortalCfg> {
  return (await readPortalConfigs())[editorId] ?? normalizePortalCfg(null);
}

export async function readVideoLinks(editorId?: string | null): Promise<VideoDelivery[]> {
  const all = await readJson<VideoDelivery[]>("editor_video_links", []);
  const list = Array.isArray(all) ? all : [];
  return (editorId ? list.filter((d) => d.editorId === editorId) : list)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Fiches produits pour éditeurs : app_settings.editor_product_briefs = { [productId]: ProductBrief } */
export async function readProductBriefs(): Promise<Record<string, ProductBrief>> {
  const raw = await readJson<Record<string, Partial<ProductBrief>>>("editor_product_briefs", {});
  return Object.fromEntries(Object.entries(raw ?? {}).map(([k, v]) => [k, {
    text: String(v?.text ?? ""), links: String(v?.links ?? ""), updatedAt: v?.updatedAt ?? null,
    media: Array.isArray(v?.media) ? v!.media.filter((m) => m && typeof m.url === "string") : [],
  }]));
}

/** Nom + photo principale des produits (rien d'autre : prix, stock… restent privés). */
export async function getProductCards(ids?: string[]): Promise<{ id: string; name: string; image: string | null }[]> {
  if (ids && !ids.length) return [];
  let q = supabaseAdmin.from("products").select("id, name").order("name");
  q = ids ? q.in("id", ids) : q.eq("is_active", true);
  const { data: prods } = await q;
  const list = (prods ?? []) as { id: string; name: string }[];
  if (!list.length) return [];
  const { data: imgs } = await supabaseAdmin
    .from("product_images").select("product_id, public_url, is_primary, display_order")
    .in("product_id", list.map((p) => p.id));
  const best = new Map<string, { url: string; score: number }>();
  for (const i of (imgs ?? []) as { product_id: string; public_url: string; is_primary: boolean; display_order: number | null }[]) {
    const score = (i.is_primary ? -1000 : 0) + (i.display_order ?? 999);
    const cur = best.get(i.product_id);
    if (i.public_url && (!cur || score < cur.score)) best.set(i.product_id, { url: i.public_url, score });
  }
  return list.map((p) => ({ id: p.id, name: p.name, image: best.get(p.id)?.url ?? null }));
}

/**
 * Vidéos de l'éditeur pour la paie « par vidéo / par lot » : chaque vidéo enregistrée
 * dans GestionPro (Vidéos & Éditeurs) compte 1, à sa date de création — pas les liens Drive.
 * Même format que les liens validés → portalEarned / packProgress fonctionnent tels quels.
 */
export async function readEditorVideoUnits(editorId?: string | null): Promise<VideoDelivery[]> {
  let q = supabaseAdmin.from("creatives" as never).select("id, editor_id, product_id, created_at");
  if (editorId) q = q.eq("editor_id", editorId);
  const { data } = await q;
  return ((data ?? []) as { id: string; editor_id: string; product_id: string | null; created_at: string }[]).map((c) => ({
    id: c.id, editorId: c.editor_id, productId: c.product_id ?? "", url: "", note: "",
    status: "accepted" as const, createdAt: c.created_at, reviewedAt: c.created_at, adminNote: "",
  }));
}
