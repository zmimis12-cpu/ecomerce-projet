/**
 * Mise à jour des commandes Speedaf : webhook (temps réel) + filet de sécurité (cron).
 * Server-only. Même logique que Digylog : événement dédupliqué, commande mise à jour,
 * une commande déjà payée ne redescend jamais (sauf retour).
 */
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { auditStatusChange } from "@/lib/audit/audit-logger";
import { SpeedafClient, type SpeedafTrack } from "./client";
import { readSpeedafConfig, getSpeedafCompanyId } from "./config";
import { mapSpeedafTrack } from "./status";

/** Applique le DERNIER événement Speedaf d'un colis. */
export async function applySpeedafTrack(tracking: string, track: SpeedafTrack, source: "webhook" | "auto_sync") {
  const mapped = mapSpeedafTrack(track.action, track.subAction, track.actionName);
  // Heure locale Speedaf + fuseau (timezone, en heures) → UTC
  const parsed = track.time ? new Date(track.time.replace(" ", "T") + "Z").getTime() : NaN;
  const tzFixed = Number.isFinite(parsed)
    ? new Date(parsed - (typeof track.timezone === "number" ? track.timezone : 0) * 3600_000).toISOString()
    : new Date().toISOString();

  const eventHash = createHash("sha256").update(`speedaf:${tracking}:${track.action}:${track.subAction ?? ""}:${track.time}`).digest("hex");
  const { data: dup } = await supabaseAdmin.from("delivery_status_events").select("id").eq("event_hash", eventHash).maybeSingle();
  if (dup) return { changed: false };

  const { data: ord } = await supabaseAdmin.from("orders")
    .select("id, status, delivery_status").eq("delivery_tracking_number", tracking).maybeSingle();
  const order = ord as { id: string; status: string; delivery_status: string | null } | null;
  if (!order) {
    await supabaseAdmin.from("orphan_webhooks").upsert(
      { tracking_number: tracking, raw_payload: { carrier: "speedaf", ...track } } as never, { onConflict: "tracking_number" },
    ).then(() => {}, () => {});
    return { changed: false, orphan: true };
  }

  const numericId = Number.parseInt(String(track.action), 10);
  const now = new Date().toISOString();
  const label = mapped.label;

  await supabaseAdmin.from("delivery_status_events").insert({
    order_id: order.id, tracking_number: tracking,
    external_status: label, external_status_id: Number.isFinite(numericId) ? numericId : null,
    internal_status: mapped.internal, normalized_status: mapped.internal, event_hash: eventHash,
    motif: track.msgEng || track.message || null, event_time: tzFixed,
    raw_payload: { carrier: "speedaf", source, ...track },
  } as never).then(() => {}, () => {});

  await supabaseAdmin.from("delivery_shipments").update({
    external_status: label, external_status_id: Number.isFinite(numericId) ? numericId : null,
    internal_status: mapped.internal, last_synced_at: now,
  } as never).eq("tracking_number", tracking);

  const upd: Record<string, unknown> = {
    delivery_external_status: label,
    delivery_external_status_id: Number.isFinite(numericId) ? numericId : null,
    delivery_status: mapped.internal,
    delivery_last_sync_at: now,
    shipment_status: mapped.internal,
    shipment_status_updated_at: now,
    status: mapped.orderStatus,
    last_webhook_payload: { carrier: "speedaf", ...track },
  };
  if (mapped.isDelivered) upd.delivered_at = tzFixed;
  if (mapped.isReturned) upd.returned_at = tzFixed;
  if (mapped.internal === "refused_delivery") upd.refused_at = tzFixed;
  if (order.status === "paid" && !mapped.isReturned) { delete upd.status; delete upd.delivered_at; }

  const { error } = await supabaseAdmin.from("orders").update(upd as never).eq("id", order.id);
  if (error) throw new Error(`Mise à jour commande échouée: ${error.message}`);

  if (upd.status && upd.status !== order.status) {
    await supabaseAdmin.from("order_status_history").insert({
      order_id: order.id, from_status: order.status, to_status: upd.status, notes: `Speedaf : ${label}`,
    } as never).then(() => {}, () => {});
  }
  auditStatusChange({
    userId: null, entityType: "order", entityId: order.id, entityLabel: `Tracking: ${tracking}`,
    oldStatus: order.delivery_status ?? "unknown", newStatus: mapped.internal, sourceModule: `speedaf_${source}`,
  });
  return { changed: true };
}

/** Relit chez Speedaf toutes les commandes Speedaf encore en cours (cron toutes les 15 min). */
export async function syncSpeedafActiveOrders(opts: { max?: number } = {}) {
  const cfg = await readSpeedafConfig();
  if (!cfg.enabled) return { ok: true, skipped: "désactivé" };
  const companyId = await getSpeedafCompanyId();
  if (!companyId) return { ok: true, checked: 0 };

  const { data, error } = await supabaseAdmin.from("orders")
    .select("id, delivery_tracking_number")
    .eq("delivery_company_id", companyId)
    .not("delivery_tracking_number", "is", null)
    .in("status", ["sent_to_delivery", "in_transit"])
    .order("delivery_last_sync_at", { ascending: true, nullsFirst: true })
    .limit(opts.max ?? 300);
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as { id: string; delivery_tracking_number: string }[];
  if (!rows.length) return { ok: true, checked: 0, changed: 0 };

  const client = new SpeedafClient(cfg);
  let changed = 0, failed = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const r = await client.track(chunk.map((o) => o.delivery_tracking_number));
    if (!r.ok) { failed += chunk.length; continue; }
    for (const res of r.data ?? []) {
      const tracks = [...(res.tracks ?? [])].sort((a, b) => a.time.localeCompare(b.time));
      const last = tracks[tracks.length - 1];
      if (last) {
        try { if ((await applySpeedafTrack(res.mailNo, last, "auto_sync")).changed) changed++; } catch { failed++; }
      }
    }
    await supabaseAdmin.from("orders").update({ delivery_last_sync_at: now } as never)
      .in("id", chunk.map((o) => o.id));
  }
  return { ok: true, checked: rows.length, changed, failed };
}
