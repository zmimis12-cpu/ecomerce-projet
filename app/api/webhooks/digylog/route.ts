/**
 * POST /api/webhooks/digylog
 * Receives real-time status updates from Digylog.
 *
 * Digylog payload:
 * {
 *   tracking: string, num: string, status: string,
 *   idStatus: number, motif: string, postponedTo: string|null, updatedAt: string
 * }
 */
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { applyDigylogStatusUpdate } from "@/lib/delivery/shipment-actions";
import type { DigylogWebhookPayload } from "@/lib/delivery/digylog/client";

export async function POST(request: NextRequest) {
  let body: string;
  let payload: DigylogWebhookPayload;

  try {
    body    = await request.text();
    payload = JSON.parse(body) as DigylogWebhookPayload;
  } catch {
    await log("parse_error", null, { error: "Invalid JSON" });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Optional secret verification
  const secret = process.env.DIGYLOG_WEBHOOK_SECRET;
  if (secret) {
    const provided = request.headers.get("x-webhook-secret")
      ?? request.headers.get("x-digylog-secret")
      ?? "";
    if (provided !== secret) {
      await log("auth_error", payload, { reason: "Bad secret" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Validate required fields
  if (!payload.tracking || payload.idStatus === undefined) {
    await log("invalid_payload", payload, { reason: "Missing tracking or idStatus" });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    await applyDigylogStatusUpdate({
      tracking:       payload.tracking,
      externalStatus: payload.status ?? "",
      idStatus:       payload.idStatus,
      motif:          payload.motif ?? "",
      postponedTo:    payload.postponedTo ?? null,
      eventTime:      payload.updatedAt ?? new Date().toISOString(),
      rawPayload:     payload as unknown as Record<string, unknown>,
    });

    await log("processed", payload, { tracking: payload.tracking, idStatus: payload.idStatus });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await log("error", payload, { error: msg });
    console.error("[digylog webhook] Error:", msg);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Digylog might also use GET for webhook verification
export async function GET() {
  return NextResponse.json({ status: "ok", provider: "digylog" });
}

async function log(status: string, payload: unknown, meta: Record<string, unknown>) {
  await supabaseAdmin.from("webhook_logs").insert({
    event_type:  "delivery.digylog",
    status,
    raw_payload: { payload, ...meta } as never,
  } as never).then(() => {}, () => {});
}
