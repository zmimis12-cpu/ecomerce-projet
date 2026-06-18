/**
 * POST/PUT /api/webhooks/digylog
 * Receives real-time status updates from Digylog.
 * Always returns 200 — Digylog stops retrying on any non-200.
 */
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { applyDigylogStatusUpdate } from "@/lib/delivery/shipment-actions";

const OK = NextResponse.json({ success: true }, { status: 200 });

async function handle(request: NextRequest) {
  let raw = "";
  let payload: Record<string, unknown> = {};

  try {
    raw     = await request.text();
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    // Can't parse — log and return 200 anyway so Digylog doesn't retry
    await log("parse_error", raw, {});
    return OK;
  }

  console.log("DIGYLOG WEBHOOK RECEIVED", {
    raw:      raw.slice(0, 300),
    tracking: payload?.tracking ?? payload?.num ?? null,
    status:   payload?.status   ?? null,
    idStatus: payload?.idStatus ?? null,
    ip:       request.headers.get("x-forwarded-for") ?? "unknown",
  });

  // Log raw payload always
  await log("received", payload, {});

  // Extract tracking — Digylog may use different field names
  const tracking =
    String(payload.tracking ?? payload.num ?? payload.trackingNumber ?? payload.code ?? "").trim();

  const idStatus  = Number(payload.idStatus ?? payload.id_status ?? payload.statusId ?? 0);
  const extStatus = String(payload.status   ?? payload.libelle   ?? payload.statusLabel ?? "");

  // If no tracking — it's a test ping from Digylog, just return 200
  if (!tracking) {
    await log("ping_ok", payload, { reason: "No tracking — test ping" });
    return OK;
  }

  // Process async — return 200 immediately so Digylog doesn't timeout
  processWebhook({ tracking, idStatus, extStatus, payload }).catch((err) => {
    console.error("[digylog webhook] Async error:", err?.message);
  });

  return OK;
}

async function processWebhook(params: {
  tracking:   string;
  idStatus:   number;
  extStatus:  string;
  payload:    Record<string, unknown>;
}) {
  const { tracking, idStatus, extStatus, payload } = params;
  try {
    await applyDigylogStatusUpdate({
      tracking,
      externalStatus: extStatus,
      idStatus,
      motif:       String(payload.motif       ?? ""),
      postponedTo: payload.postponedTo as string | null ?? null,
      eventTime:   String(payload.updatedAt   ?? payload.date ?? new Date().toISOString()),
      rawPayload:  payload,
    });
    await log("processed", payload, { tracking, idStatus });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    await log("error", payload, { tracking, error: msg });
    console.error("[digylog webhook] Process error:", msg);
  }
}

export async function POST(request: NextRequest) { return handle(request); }
export async function PUT(request: NextRequest)  { return handle(request); }
export async function GET(request: NextRequest) {
  // Digylog's "key mismatch" error on PUT /webhook suggests it calls this
  // GET endpoint to verify ownership (a common webhook-verification pattern:
  // it sends a challenge/key param and expects it echoed back). Log every
  // GET so we can see exactly what Digylog sends instead of guessing.
  const url = new URL(request.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { params[k] = v; });
  await log("verification_get", { params }, {
    headers: Object.fromEntries(request.headers.entries()),
  });

  // If Digylog sends a challenge/key param, echo it back — standard pattern
  // for "prove you control this URL" webhook verification.
  const challenge = url.searchParams.get("challenge")
    ?? url.searchParams.get("key")
    ?? url.searchParams.get("verify_token")
    ?? url.searchParams.get("hub.challenge");
  if (challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return NextResponse.json({ status: "ok", provider: "digylog" });
}

async function log(status: string, payload: unknown, meta: Record<string, unknown>) {
  await supabaseAdmin.from("webhook_logs").insert({
    event_type:  "delivery.digylog",
    status,
    raw_payload: { payload, ...meta } as never,
  } as never).then(() => {}, () => {});
}
