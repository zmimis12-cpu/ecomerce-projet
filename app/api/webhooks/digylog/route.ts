/**
 * POST/PUT /api/webhooks/digylog
 * Receives real-time status updates from Digylog.
 * Always returns 200 — Digylog stops retrying on any non-200.
 */
import { type NextRequest, NextResponse, after } from "next/server";
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

  // ── Subscription handshake ──────────────────────────────────────────────
  // Digylog calls this endpoint with {"type":"subscribe","key":"<challenge>"}
  // to verify we control this URL before accepting it as a webhook target.
  // It expects the same key echoed back to confirm — without this, every
  // PUT /webhook registration attempt from our admin fails with
  // "Webhook verification failed, key mismatch" because Digylog never
  // got the confirmation it was waiting for.
  if (payload?.type === "subscribe" && payload?.key) {
    await log("subscribe_handshake", payload, { key: payload.key });
    return NextResponse.json({ type: "subscribe", key: payload.key }, { status: 200 });
  }

  // Digylog envoie le tracking dans "traking" (sans c !) et NOTRE numéro de
  // commande dans "num". Avant, on lisait "num" en premier → on cherchait
  // "HC-01505" comme tracking → commande introuvable → webhook ignoré (orphelin).
  let tracking =
    String(payload.traking ?? payload.tracking ?? payload.trackingNumber ?? payload.code ?? "").trim();
  if (!tracking && payload.num) {
    const { data: byNum } = await supabaseAdmin
      .from("orders")
      .select("delivery_tracking_number")
      .eq("order_number", String(payload.num))
      .maybeSingle();
    tracking = String((byNum as { delivery_tracking_number: string | null } | null)?.delivery_tracking_number ?? "").trim();
  }

  const idStatus  = Number(payload.idStatus ?? payload.id_status ?? payload.statusId ?? 0);
  const extStatus = String(payload.status   ?? payload.libelle   ?? payload.statusLabel ?? "");

  // If no tracking — it's a test ping from Digylog, just return 200
  if (!tracking) {
    await log("ping_ok", payload, { reason: "No tracking — test ping" });
    return OK;
  }

  // Traité APRÈS la réponse avec after() : avant, la promesse "fire-and-forget"
  // était coupée par Vercel dès l'envoi du 200 → la mise à jour pouvait ne
  // jamais s'exécuter.
  after(() =>
    processWebhook({ tracking, idStatus, extStatus, payload }).catch((err) => {
      console.error("[digylog webhook] Async error:", err?.message);
    })
  );

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
    // Infos en plus envoyées par Digylog : téléphone livreur + date de report
    const extra: Record<string, unknown> = {};
    if (payload.driverPhone) extra.delivery_driver_phone = String(payload.driverPhone);
    if ("postponedTo" in payload) extra.delivery_reported_to = (payload.postponedTo as string | null) ?? null;
    if (Object.keys(extra).length) {
      await supabaseAdmin.from("orders").update(extra as never).eq("delivery_tracking_number", tracking);
    }
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
  // La colonne s'appelle "payload" (pas raw_payload) : avant, chaque insert
  // échouait en silence → aucun log Digylog n'a jamais été enregistré.
  await supabaseAdmin.from("webhook_logs").insert({
    event_type: "delivery.digylog",
    status,
    payload:    { payload, ...meta } as never,
  } as never).then(() => {}, () => {});
}
