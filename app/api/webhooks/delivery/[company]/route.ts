/**
 * /api/webhooks/delivery/[company]
 * Universal delivery webhook — handles all providers.
 *
 * URLs:
 *   PUT/POST /api/webhooks/delivery/digylog
 *   PUT/POST /api/webhooks/delivery/ozone
 *   etc.
 *
 * Always returns 200 — providers stop retrying on non-200.
 */
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { applyDigylogStatusUpdate } from "@/lib/delivery/shipment-actions";

const OK = NextResponse.json({ success: true }, { status: 200 });

async function handle(request: NextRequest, company: string) {
  let raw = "";
  let payload: Record<string, unknown> = {};

  try {
    raw     = await request.text();
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    await logWebhook(company, "parse_error", payload);
    return OK;
  }

  console.log(`[webhook/${company}] received`, {
    tracking: payload?.tracking ?? payload?.num ?? null,
    status:   payload?.status ?? payload?.idStatus ?? null,
  });

  await logWebhook(company, "received", payload);

  // Route to correct handler
  switch (company) {
    case "digylog":
      return handleDigylog(payload);
    case "ozone":
      return handleOzone(payload);
    default:
      console.warn(`[webhook] Unknown company: ${company}`);
      return OK;
  }
}

// ─── Digylog handler ──────────────────────────────────────────────────────────
async function handleDigylog(payload: Record<string, unknown>) {
  const tracking = String(
    payload.tracking ?? payload.num ?? payload.trackingNumber ?? payload.code ?? ""
  ).trim();

  if (!tracking) {
    await logWebhook("digylog", "ping_ok", payload);
    return OK;
  }

  const idStatus  = Number(payload.idStatus ?? payload.id_status ?? 0);
  const extStatus = String(payload.status ?? payload.libelle ?? "");

  // Process async — return 200 immediately
  processDigylog({ tracking, idStatus, extStatus, payload }).catch((e) =>
    console.error("[webhook/digylog] error:", e?.message)
  );

  return OK;
}

async function processDigylog(params: {
  tracking: string; idStatus: number; extStatus: string; payload: Record<string, unknown>;
}) {
  const { tracking, idStatus, extStatus, payload } = params;
  try {
    await applyDigylogStatusUpdate({
      tracking,
      externalStatus: extStatus,
      idStatus,
      motif:       String(payload.motif ?? ""),
      postponedTo: (payload.postponedTo as string | null) ?? null,
      eventTime:   String(payload.updatedAt ?? payload.date ?? new Date().toISOString()),
      rawPayload:  payload,
    });
    await logWebhook("digylog", "processed", payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown";
    await logWebhook("digylog", "error", { ...payload, _error: msg });
  }
}

// ─── Ozone handler (placeholder) ─────────────────────────────────────────────
async function handleOzone(payload: Record<string, unknown>) {
  // TODO: implement Ozone status normalization
  console.log("[webhook/ozone] received — not yet implemented", payload);
  await logWebhook("ozone", "not_implemented", payload);
  return OK;
}

// ─── Logger ───────────────────────────────────────────────────────────────────
async function logWebhook(company: string, status: string, payload: unknown) {
  await supabaseAdmin.from("webhook_logs").insert({
    event_type:  `delivery.${company}`,
    status,
    raw_payload: payload as never,
  } as never).then(() => {}, () => {});
}

// ─── Route handlers ───────────────────────────────────────────────────────────
export async function POST(request: NextRequest, { params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  return handle(request, company);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  return handle(request, company);
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  return NextResponse.json({ status: "ok", provider: company });
}
