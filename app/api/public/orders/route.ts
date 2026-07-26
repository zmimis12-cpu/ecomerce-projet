/**
 * POST /api/public/orders
 * Public order intake API — called from landing page form.
 * Security layers:
 *  1. Honeypot field check
 *  2. Input validation + phone normalization
 *  3. IP rate limiting (3 / 10 min)
 *  4. Duplicate detection (same phone + product + 24h)
 *  5. Service role never exposed to client
 */
import { type NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateOrderInput, isHoneypotTriggered } from "@/lib/public/validation";
import { checkRateLimit, recordRequest, getClientIp, hashIp } from "@/lib/public/rate-limit";
import { findAvailableAgent } from "@/lib/orders/auto-assign";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const {
    customer_name    = "",
    customer_phone   = "",
    customer_city    = "",
    customer_address = "",
    quantity         = 1,
    notes            = "",
    website          = "",   // honeypot
    product_id       = "",
    product_slug     = "",
    bundle_price     = 0,    // total price for the bundle sent by the form
  } = body as Record<string, string | number>;

  // Choix de variantes (taille/couleur) — fusionnés dans "notes" pour qu'ils
  // apparaissent automatiquement à Digylog et dans les exports Google Sheets,
  // sans avoir besoin d'une colonne séparée partout.
  const rawVariants = (body as Record<string, unknown>).variants;
  let notesWithVariants = String(notes);
  if (rawVariants && typeof rawVariants === "object") {
    const variantEntries = Object.entries(rawVariants as Record<string, string>)
      .filter(([, v]) => v && String(v).trim());
    if (variantEntries.length > 0) {
      const variantText = variantEntries.map(([k, v]) => `${k}: ${v}`).join(" | ");
      notesWithVariants = notesWithVariants ? `${notesWithVariants} — ${variantText}` : variantText;
    }
  }

  // ── 1. Honeypot ──────────────────────────────────────────────────────────────
  if (isHoneypotTriggered(String(website))) {
    // Silent accept — bots think they succeeded
    return NextResponse.json({ success: true, orderNumber: "ORD-BOT-001" });
  }

  // ── 2. Validate ──────────────────────────────────────────────────────────────
  const validation = validateOrderInput({
    customer_name:    String(customer_name),
    customer_phone:   String(customer_phone),
    customer_city:    String(customer_city),
    customer_address: String(customer_address),
    quantity:         Number(quantity),
    notes:            String(notes),
    website:          String(website),
  });

  if (!validation.ok) {
    return NextResponse.json({ success: false, errors: validation.errors }, { status: 422 });
  }

  const normalizedPhone = validation.phone!;

  // ── 3. Rate limit ─────────────────────────────────────────────────────────────
  const rateCheck = await checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { success: false, error: "لقد تجاوزت الحد المسموح به من الطلبات. يرجى المحاولة لاحقاً." },
      { status: 429 }
    );
  }

  // ── 4. Fetch product (validate exists + get price) ────────────────────────────
  const pid = String(product_id).trim();
  const pslug = String(product_slug).trim();

  let query = supabaseAdmin
    .from("products")
    .select("id, name, sku, sale_price_mad, total_cost_mad, estimated_profit_mad, slug")
    .eq("is_active", true);

  if (pid) {
    query = query.eq("id", pid) as typeof query;
  } else if (pslug) {
    query = query.eq("slug", pslug) as typeof query;
  } else {
    return NextResponse.json({ success: false, error: "المنتج غير محدد." }, { status: 400 });
  }

  const { data: product } = await query.single();
  if (!product) {
    return NextResponse.json({ success: false, error: "المنتج غير موجود." }, { status: 404 });
  }

  const p = product as unknown as {
    id: string; name: string; sku: string;
    sale_price_mad: number; total_cost_mad: number;
    estimated_profit_mad: number; slug: string;
  };

  const qty        = Number(quantity);
  const unitPrice  = p.sale_price_mad;
  const unitCost   = p.total_cost_mad ?? 0;

  // ── Bundle pricing ─────────────────────────────────────────────────────────
  // On va chercher les VRAIS prix de bundle configurés par le vendeur sur la
  // landing page (bundle_1/2/3_price) — jamais une formule générique -10%/-20%
  // qui ne correspond pas forcément aux prix réellement affichés au client.
  let realBundlePrices: Record<number, number | null> = { 1: null, 2: null, 3: null };
  if (product_slug) {
    const { data: lp } = await supabaseAdmin
      .from("landing_pages")
      .select("bundle_1_price, bundle_2_price, bundle_3_price")
      .eq("slug", String(product_slug).trim().toLowerCase())
      .maybeSingle();
    if (lp) {
      const l = lp as { bundle_1_price: number | null; bundle_2_price: number | null; bundle_3_price: number | null };
      realBundlePrices = { 1: l.bundle_1_price, 2: l.bundle_2_price, 3: l.bundle_3_price };
    }
  }

  const BUNDLE_DISCOUNT: Record<number, number> = { 1: 0, 2: 0.10, 3: 0.20 };
  const discount     = BUNDLE_DISCOUNT[qty] ?? 0;
  const genericFallback = Math.round(unitPrice * qty * (1 - discount));
  // Prix attendu = le vrai prix configuré par le vendeur pour cette quantité,
  // sinon (produit sans bundle configuré) on retombe sur la formule générique.
  const expectedTotal = realBundlePrices[qty] ?? genericFallback;

  // Validate client-submitted bundle_price (must be within 5% of expected and >= cost)
  const clientBundlePrice = Number(bundle_price);
  const minAcceptable     = unitCost * qty; // never sell below cost
  let subtotal: number;

  if (
    clientBundlePrice > 0 &&
    clientBundlePrice >= minAcceptable &&
    Math.abs(clientBundlePrice - expectedTotal) / expectedTotal < 0.05
  ) {
    subtotal = clientBundlePrice;
  } else {
    // Recalculate server-side avec le vrai prix vendeur (ou la formule
    // générique en dernier recours si aucun bundle n'est configuré)
    subtotal = expectedTotal;
  }

  const cogs      = unitCost * qty;
  const estProfit = subtotal - cogs;

  // ── 5. Duplicate detection ────────────────────────────────────────────────────
  const since24h = new Date(Date.now() - 86400_000).toISOString();

  const { data: recentOrders } = await supabaseAdmin
    .from("orders")
    .select("id, order_number")
    .eq("customer_phone", normalizedPhone)
    .gte("created_at", since24h)
    .not("status", "in", '("cancelled","returned")');

  let isDuplicate    = false;
  let duplicateOfId: string | null = null;

  if (recentOrders && recentOrders.length > 0) {
    const recentIds = (recentOrders as { id: string }[]).map((o) => o.id);
    const { data: dupeItems } = await supabaseAdmin
      .from("order_items")
      .select("order_id")
      .eq("product_id", p.id)
      .in("order_id", recentIds)
      .limit(1);

    if (dupeItems && dupeItems.length > 0) {
      isDuplicate   = true;
      duplicateOfId = (dupeItems[0] as { order_id: string }).order_id;
    }
  }

  // ── 6. Auto-assign agent ──────────────────────────────────────────────────────
  const agentId = await findAvailableAgent();

  // ── 7. Create order ───────────────────────────────────────────────────────────
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .insert({
      customer_name:     String(customer_name).trim(),
      customer_phone:    normalizedPhone,
      customer_city:     String(customer_city).trim(),
      customer_address:  String(customer_address).trim(),
      status:            "new",
      subtotal,
      shipping_charge:   0,
      discount_amount:   0,
      cogs_total:        cogs,
      estimated_profit:  estProfit,
      total_amount_mad:  subtotal,
      source:            "landing_page",
      landing_page_slug: pslug || p.slug,
      notes:             notesWithVariants.trim() || null,
      import_source:     "landing_page",
      assigned_to:       agentId,
      ip_hash:           hashIp(ip),
      user_agent:        request.headers.get("user-agent")?.slice(0, 255) ?? null,
      is_duplicate:      isDuplicate,
      duplicate_of:      duplicateOfId,
      meta_pixel_id:     typeof body.meta_pixel_id === "string" ? body.meta_pixel_id : null,
      meta_fbp:          typeof body.meta_fbp === "string" ? body.meta_fbp : null,
      meta_fbc:          typeof body.meta_fbc === "string" ? body.meta_fbc : null,
      meta_client_ip:    ip,
      meta_client_ua:    request.headers.get("user-agent")?.slice(0, 255) ?? null,
      tiktok_pixel_id:   typeof body.tiktok_pixel_id === "string" ? body.tiktok_pixel_id : null,
      tiktok_ttp:        typeof body.tiktok_ttp === "string" ? body.tiktok_ttp : null,
      tiktok_ttclid:     typeof body.tiktok_ttclid === "string" ? body.tiktok_ttclid : null,
      tiktok_client_ip:  ip,
      tiktok_client_ua:  request.headers.get("user-agent")?.slice(0, 255) ?? null,
    } as never)
    .select("id, order_number")
    .single();

  if (orderErr || !order) {
    console.error("[public/orders] create error:", orderErr?.message);
    return NextResponse.json({ success: false, error: "حدث خطأ. يرجى المحاولة مجدداً." }, { status: 500 });
  }

  const orderId     = (order as { id: string }).id;
  const orderNumber = (order as { order_number: string }).order_number;

  // ── 8. Create order item ──────────────────────────────────────────────────────
  // unit_price = prix EFFECTIF (prix bundle réel ÷ quantité), pas le prix
  // catalogue brut — sinon l'affichage (unit_price × qté) montre un total
  // différent du vrai total de la commande (ex: 298 affiché vs 249 réel).
  const effectiveUnitPrice = Math.round((subtotal / qty) * 100) / 100;
  await supabaseAdmin.from("order_items").insert({
    order_id:      orderId,
    product_id:    p.id,
    product_name:  p.name,
    product_sku:   p.sku,
    unit_price:    effectiveUnitPrice,
    unit_cost_mad: unitCost,
    quantity:      qty,
    discount_pct:  0,
  } as never);

  // ── 9. Log rate limit entry ───────────────────────────────────────────────────
  await recordRequest(ip);

  // ── 9b. Envoi WhatsApp de confirmation — EN ARRIÈRE-PLAN, ne bloque plus
  // jamais la réponse au client. Avant: `await` ici faisait attendre le
  // client 5-7s (parfois plus, en cas de lenteur/échec Meta API) avant de
  // voir le message de remerciement.
  after(async () => {
    const { sendOrderConfirmationWhatsApp } = await import("@/lib/whatsapp/actions");
    await sendOrderConfirmationWhatsApp(orderId);
  });

  // ── 10. Increment landing page order counter (non-blocking) ───────────────────
  if (pslug) {
    supabaseAdmin.rpc("increment_lp_orders" as never, { p_slug: pslug } as never).then(() => {}, () => {});
  }

  return NextResponse.json({
    success:     true,
    orderNumber,
    message:     "تم استلام طلبك بنجاح. سيتصل بك فريقنا للتأكيد.",
    isDuplicate,
  }, { status: 201 });
}
