/**
 * POST /api/webhooks/delivery/[company]
 * Public webhook endpoint — receives delivery status updates.
 * Never requires authentication (delivery companies call this directly).
 * Security via webhook secret signature verification.
 */
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { applyStatusUpdate } from "@/lib/delivery/shipment-actions";
import { createHmac, timingSafeEqual } from "crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const ip = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-real-ip")
    ?? "unknown";

  let body: string;
  let payload: unknown;

  try {
    body    = await request.text();
    payload = JSON.parse(body);
  } catch {
    await logWebhook(company, "parse_error", null, { error: "Invalid JSON", ip });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Get delivery company config
  const { data: dc } = await supabaseAdmin
    .from("delivery_companies")
    .select("id, slug, webhook_secret")
    .eq("slug", company)
    .eq("is_active", true)
    .maybeSingle();

  if (!dc) {
    return NextResponse.json({ error: "Unknown company" }, { status: 404 });
  }

  const dcData = dc as { id: string; slug: string; webhook_secret: string | null };

  // Verify webhook signature if secret is configured
  if (dcData.webhook_secret) {
    const signature = request.headers.get("x-webhook-signature")
      ?? request.headers.get("x-signature")
      ?? request.headers.get("signature")
      ?? "";

    const expected = createHmac("sha256", dcData.webhook_secret)
      .update(body)
      .digest("hex");

    const sigBuffer  = Buffer.from(signature.replace("sha256=", ""), "hex");
    const expBuffer  = Buffer.from(expected, "hex");

    if (
      sigBuffer.length !== expBuffer.length ||
      !timingSafeEqual(sigBuffer, expBuffer)
    ) {
      await logWebhook(company, "signature_invalid", payload, { ip });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  // Parse the event — handle different payload formats
  const p = payload as Record<string, unknown>;
  const events = extractEvents(p);

  let processed = 0;
  const errors: string[] = [];

  for (const event of events) {
    try {
      await applyStatusUpdate(
        event.trackingNumber,
        event.externalStatus,
        event.rawPayload,
        event.eventTime
      );
      processed++;
    } catch (err) {
      errors.push(`${event.trackingNumber}: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  await logWebhook(company, processed > 0 ? "processed" : "no_events", payload, {
    processed, errors: errors.length, ip,
  });

  return NextResponse.json({ success: true, processed, errors: errors.length });
}

// Extract tracking events from various payload formats
function extractEvents(p: Record<string, unknown>): {
  trackingNumber: string;
  externalStatus: string;
  eventTime:      string;
  rawPayload:     Record<string, unknown>;
}[] {
  const now = new Date().toISOString();

  // Array of events
  if (Array.isArray(p.colis ?? p.events ?? p.shipments)) {
    const arr = (p.colis ?? p.events ?? p.shipments) as Record<string, unknown>[];
    return arr.map((item) => ({
      trackingNumber: String(item.tracking_number ?? item.barcode ?? item.reference ?? ""),
      externalStatus: String(item.statut ?? item.status ?? ""),
      eventTime:      String(item.date ?? item.updated_at ?? now),
      rawPayload:     item,
    })).filter((e) => e.trackingNumber);
  }

  // Single event
  const trackingNumber = String(p.tracking_number ?? p.barcode ?? p.reference ?? "");
  if (!trackingNumber) return [];

  return [{
    trackingNumber,
    externalStatus: String(p.statut ?? p.status ?? ""),
    eventTime:      String(p.date ?? p.updated_at ?? now),
    rawPayload:     p,
  }];
}

async function logWebhook(
  company: string,
  status: string,
  payload: unknown,
  meta: Record<string, unknown>
) {
  await supabaseAdmin.from("webhook_logs").insert({
    event_type:  `delivery.${company}`,
    status,
    raw_payload: { payload, ...meta } as never,
  } as never).then(() => {}, () => {});
}
