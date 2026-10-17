/**
 * lib/delivery/speedaf/batch.ts — « Récap tickets » pour Speedaf (comme Digylog).
 * Chaque colis Speedaf envoyé est rattaché au lot du jour (delivery_batches, shipping_company = "Speedaf").
 * Server only (pas d'actions exposées ici).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SpeedafClient } from "./client";
import { readSpeedafConfig, getSpeedafCompanyId } from "./config";
import { applySpeedafTrack } from "./sync";

export const SPEEDAF_PROVIDER = "Speedaf";

async function storeName(): Promise<string> {
  const { data } = await supabaseAdmin.from("digylog_settings").select("default_store_name").limit(1).maybeSingle();
  return (data as { default_store_name?: string } | null)?.default_store_name || "Hajtekzone";
}

/** Lot Speedaf ouvert du jour (créé s'il n'existe pas). */
async function getOrCreateSpeedafBatch(day: string, store: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("delivery_batches")
    .select("id")
    .eq("batch_date", day)
    .eq("store_name", store)
    .eq("shipping_company", SPEEDAF_PROVIDER)
    .in("status", ["draft", "tickets_printed"])
    .is("bl_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: created, error } = await supabaseAdmin
    .from("delivery_batches")
    .insert({
      batch_number: "", batch_date: day, status: "draft",
      shipping_company: SPEEDAF_PROVIDER, store_name: store, total_orders: 0, total_products: 0,
    } as never)
    .select("id")
    .single();
  if (error || !created) throw new Error(`Lot Speedaf impossible : ${error?.message}`);
  return (created as { id: string }).id;
}

async function refreshCount(batchId: string) {
  const { count } = await supabaseAdmin
    .from("delivery_batch_orders").select("id", { count: "exact", head: true }).eq("batch_id", batchId);
  await supabaseAdmin.from("delivery_batches").update({ total_orders: count ?? 0 } as never).eq("id", batchId);
}

/** Rattache une commande Speedaf au lot du jour de son envoi. */
export async function attachToSpeedafBatch(orderId: string, tracking: string, sentAt?: string | null, store?: string) {
  const day = (sentAt ?? new Date().toISOString()).slice(0, 10);
  const batchId = await getOrCreateSpeedafBatch(day, store ?? (await storeName()));
  const { data: linked } = await supabaseAdmin
    .from("delivery_batch_orders").select("id").eq("batch_id", batchId).eq("order_id", orderId).maybeSingle();
  if (!linked) {
    await supabaseAdmin.from("delivery_batch_orders").insert({
      batch_id: batchId, order_id: orderId, tracking_number: tracking, status: "pending",
    } as never);
  }
  await supabaseAdmin.from("orders").update({ delivery_batch_id: batchId } as never).eq("id", orderId);
  await refreshCount(batchId);
  return batchId;
}

/** Commande Speedaf annulée → retirée de son lot. */
export async function detachFromBatch(orderId: string) {
  const { data } = await supabaseAdmin.from("delivery_batch_orders").select("batch_id").eq("order_id", orderId);
  const ids = [...new Set(((data ?? []) as { batch_id: string }[]).map((r) => r.batch_id))];
  if (!ids.length) return;
  await supabaseAdmin.from("delivery_batch_orders").delete().eq("order_id", orderId);
  await supabaseAdmin.from("orders").update({ delivery_batch_id: null } as never).eq("id", orderId);
  for (const id of ids) await refreshCount(id);
}

/** Rattrapage : colis Speedaf des 7 derniers jours qui ne sont dans aucun lot. */
export async function backfillSpeedafBatches(): Promise<number> {
  const companyId = await getSpeedafCompanyId();
  if (!companyId) return 0;
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await supabaseAdmin.from("orders")
    .select("id, delivery_tracking_number, sent_to_delivery_at")
    .eq("delivery_company_id", companyId)
    .not("delivery_tracking_number", "is", null)
    .is("delivery_batch_id", null)
    .gte("sent_to_delivery_at", since)
    .order("sent_to_delivery_at", { ascending: true })
    .limit(300);
  const rows = (data ?? []) as { id: string; delivery_tracking_number: string; sent_to_delivery_at: string | null }[];
  if (!rows.length) return 0;
  const store = await storeName();
  for (const o of rows) {
    try { await attachToSpeedafBatch(o.id, o.delivery_tracking_number, o.sent_to_delivery_at, store); } catch { /* suivant */ }
  }
  return rows.length;
}

/** Étiquettes Speedaf (PDF) dans l'ordre demandé — 1 PDF par colis, pour garder le tri du récap. */
export async function speedafLabelPdfs(trackings: string[]): Promise<{ pdfs: Uint8Array[]; missing: string[] }> {
  const cfg = await readSpeedafConfig();
  const client = new SpeedafClient(cfg);
  const byWaybill = new Map<string, Uint8Array>();
  const loose: Uint8Array[] = [];

  for (let i = 0; i < trackings.length; i += 50) {
    const chunk = trackings.slice(i, i + 50);
    const r = await client.printLabels(chunk);
    if (!r.ok) continue;
    for (const l of r.data?.orderLabels ?? []) {
      let bytes: Uint8Array | null = null;
      if (l.labelBase64) bytes = Buffer.from(l.labelBase64, "base64");
      else if (l.labelUrl) {
        const res = await fetch(l.labelUrl.replace(/^http:/, "https:")).catch(() => null);
        if (res?.ok) bytes = new Uint8Array(await res.arrayBuffer());
      }
      if (!bytes) continue;
      if (l.waybillNo) byWaybill.set(l.waybillNo, bytes);
      else loose.push(bytes);
    }
    // Certaines réponses donnent seulement des URLs (1 PDF pour tout le lot)
    if (!r.data?.orderLabels?.length) {
      for (const u of r.data?.urls ?? []) {
        const res = await fetch(u.replace(/^http:/, "https:")).catch(() => null);
        if (res?.ok) loose.push(new Uint8Array(await res.arrayBuffer()));
      }
    }
  }
  const pdfs: Uint8Array[] = [];
  const missing: string[] = [];
  for (const t of trackings) {
    const b = byWaybill.get(t);
    if (b) pdfs.push(b); else missing.push(t);
  }
  return { pdfs: [...pdfs, ...loose], missing: loose.length ? [] : missing };
}

/** Synchro des statuts d'un lot Speedaf. */
export async function syncSpeedafBatch(trackings: string[]) {
  const cfg = await readSpeedafConfig();
  const client = new SpeedafClient(cfg);
  let synced = 0;
  for (let i = 0; i < trackings.length; i += 50) {
    const r = await client.track(trackings.slice(i, i + 50));
    if (!r.ok) return { success: false, error: `Speedaf : ${r.error}` };
    for (const res of r.data ?? []) {
      const tracks = [...(res.tracks ?? [])].sort((a, b) => a.time.localeCompare(b.time));
      const last = tracks[tracks.length - 1];
      if (last && (await applySpeedafTrack(res.mailNo, last, "auto_sync")).changed) synced++;
    }
  }
  return { success: true, synced };
}
