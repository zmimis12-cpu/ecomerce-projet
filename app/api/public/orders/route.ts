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
import { type NextRequest, NextResponse } from "next/server";
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
  } = body as Record<string, string | number>;

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
  const subtotal   = unitPrice * qty;
  const cogs       = unitCost * qty;
  const estProfit  = subtotal - cogs;

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
      notes:             String(notes).trim() || null,
      import_source:     "landing_page",
      assigned_to:       agentId,
      ip_hash:           hashIp(ip),
      user_agent:        request.headers.get("user-agent")?.slice(0, 255) ?? null,
      is_duplicate:      isDuplicate,
      duplicate_of:      duplicateOfId,
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
  await supabaseAdmin.from("order_items").insert({
    order_id:      orderId,
    product_id:    p.id,
    product_name:  p.name,
    product_sku:   p.sku,
    unit_price:    unitPrice,
    unit_cost_mad: unitCost,
    quantity:      qty,
    discount_pct:  0,
  } as never);

  // ── 9. Log rate limit entry ───────────────────────────────────────────────────
  await recordRequest(ip);

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
