/**
 * POST /api/public/abandoned — panier abandonné (landing page).
 * Appelé par le formulaire dès qu'un téléphone marocain valide est tapé.
 * Une seule ligne « pending » par téléphone + produit (mise à jour si le client modifie).
 * Ignoré si le client a déjà commandé ce produit (48 h). Ne bloque jamais la page.
 */
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/public/validation";
import { getClientIp, hashIp } from "@/lib/public/rate-limit";

const ok = () => NextResponse.json({ ok: true });
const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return ok(); }
  if (s(body.website, 200)) return ok(); // honeypot

  const phone = normalizePhone(s(body.customer_phone, 30));
  const productId = s(body.product_id, 40);
  if (!phone || !/^[0-9a-f-]{36}$/i.test(productId)) return ok();

  const ipHash = hashIp(getClientIp(request));
  const since48h = new Date(Date.now() - 48 * 3600e3).toISOString();
  const since1h = new Date(Date.now() - 3600e3).toISOString();

  const [ordered, existing, ipCount] = await Promise.all([
    supabaseAdmin.from("orders").select("id").eq("customer_phone", phone).gte("created_at", since48h)
      .not("status", "in", '("cancelled","returned")').limit(1),
    supabaseAdmin.from("abandoned_carts" as never).select("id").eq("customer_phone", phone).eq("product_id", productId)
      .eq("status", "pending").limit(1),
    supabaseAdmin.from("abandoned_carts" as never).select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since1h),
  ]);
  if ((ordered.data ?? []).length) return ok();          // déjà commandé
  if ((ipCount.count ?? 0) > 15) return ok();             // anti-abus

  const payload: Record<string, unknown> = {};
  for (const k of ["product_slug", "offer_id", "quantity", "bundle_price", "bumps", "variants", "customer_address",
    "meta_pixel_id", "meta_fbp", "meta_fbc", "tiktok_pixel_id", "tiktok_ttp", "tiktok_ttclid", "creative_code"]) {
    if (body[k] !== undefined) payload[k] = body[k];
  }
  const row = {
    product_id: productId,
    landing_page_slug: s(body.product_slug, 120) || null,
    customer_name: s(body.customer_name, 120) || null,
    customer_phone: phone,
    customer_city: s(body.customer_city, 80) || null,
    total_amount: Number(body.total) > 0 ? Math.min(100000, Number(body.total)) : null,
    quantity: Math.min(10, Math.max(1, Number(body.quantity) || 1)),
    creative_code: /^[A-Za-z0-9_-]{1,20}$/.test(s(body.creative_code, 20)) ? s(body.creative_code, 20).toUpperCase() : null,
    payload, ip_hash: ipHash, updated_at: new Date().toISOString(),
  };
  const ex = (existing.data ?? []) as { id: string }[];
  if (ex.length) await supabaseAdmin.from("abandoned_carts" as never).update(row as never).eq("id", ex[0].id);
  else await supabaseAdmin.from("abandoned_carts" as never).insert(row as never);
  return ok();
}
