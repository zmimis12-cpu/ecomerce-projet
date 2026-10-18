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

/** Un signal unique empêche React/Next de réutiliser la réponse d'une requête identique faite plus tôt dans le même rendu. */
const fresh = () => new AbortController().signal;

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
    .abortSignal(fresh()) // pas de mémorisation Next.js : toujours relire la base
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
    .from("delivery_batch_orders").select("id", { count: "exact", head: true }).eq("batch_id", batchId).abortSignal(fresh());
  await supabaseAdmin.from("delivery_batches").update({ total_orders: count ?? 0 } as never).eq("id", batchId);
}

/** Rattache une commande Speedaf au lot du jour de son envoi. */
export async function attachToSpeedafBatch(orderId: string, tracking: string, sentAt?: string | null, store?: string) {
  const day = (sentAt ?? new Date().toISOString()).slice(0, 10);
  const batchId = await getOrCreateSpeedafBatch(day, store ?? (await storeName()));
  const { data: linked } = await supabaseAdmin
    .from("delivery_batch_orders").select("id").eq("batch_id", batchId).eq("order_id", orderId).abortSignal(fresh()).maybeSingle();
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

/**
 * Rattrapage, appelé au chargement de « Récap tickets ».
 * ⚠️ Pendant le rendu d'une page, Next.js mémorise les requêtes identiques : on ne fait donc
 * JAMAIS la même recherche en boucle — on groupe par jour en mémoire, 1 lot par jour.
 */
export async function backfillSpeedafBatches(): Promise<number> {
  const companyId = await getSpeedafCompanyId();
  if (!companyId) return 0;
  const store = await storeName();
  await mergeSpeedafDayBatches(store);

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

  // Groupement par jour d'envoi
  const byDay = new Map<string, typeof rows>();
  for (const o of rows) {
    const day = (o.sent_to_delivery_at ?? new Date().toISOString()).slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), o]);
  }

  // Lots Speedaf ouverts existants (une seule requête)
  const { data: open } = await supabaseAdmin.from("delivery_batches")
    .select("id, batch_date, created_at")
    .eq("shipping_company", SPEEDAF_PROVIDER).eq("store_name", store)
    .in("batch_date", [...byDay.keys()])
    .in("status", ["draft", "tickets_printed"]).is("bl_id", null)
    .order("created_at", { ascending: true });
  const openByDay = new Map<string, string>();
  for (const b of (open ?? []) as { id: string; batch_date: string }[]) if (!openByDay.has(b.batch_date)) openByDay.set(b.batch_date, b.id);

  let attached = 0;
  for (const [day, list] of byDay) {
    try {
      const batchId = openByDay.get(day) ?? (await getOrCreateSpeedafBatch(day, store));
      await supabaseAdmin.from("delivery_batch_orders").upsert(
        list.map((o) => ({ batch_id: batchId, order_id: o.id, tracking_number: o.delivery_tracking_number, status: "pending" })) as never,
        { onConflict: "batch_id,order_id", ignoreDuplicates: true },
      );
      await supabaseAdmin.from("orders").update({ delivery_batch_id: batchId } as never).in("id", list.map((o) => o.id));
      await refreshCount(batchId);
      // récap produits recalculé par la page (total_products = 0)
      await supabaseAdmin.from("delivery_batch_product_summary").delete().eq("batch_id", batchId);
      await supabaseAdmin.from("delivery_batches").update({ total_products: 0 } as never).eq("id", batchId);
      attached += list.length;
    } catch { /* jour suivant */ }
  }
  return attached;
}

/** Fusionne les lots Speedaf du même jour pas encore imprimés (corrige les lots en double). */
async function mergeSpeedafDayBatches(store: string) {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabaseAdmin.from("delivery_batches")
    .select("id, batch_date, created_at")
    .eq("shipping_company", SPEEDAF_PROVIDER).eq("store_name", store)
    .eq("status", "draft").is("bl_id", null).is("labels_downloaded_at", null)
    .gte("batch_date", since)
    .order("created_at", { ascending: true });
  const byDay = new Map<string, string[]>();
  for (const b of (data ?? []) as { id: string; batch_date: string }[]) byDay.set(b.batch_date, [...(byDay.get(b.batch_date) ?? []), b.id]);

  for (const ids of byDay.values()) {
    if (ids.length < 2) continue;
    const [keep, ...dupes] = ids;
    const { data: bo } = await supabaseAdmin.from("delivery_batch_orders")
      .select("order_id, tracking_number").in("batch_id", dupes);
    const moved = (bo ?? []) as { order_id: string; tracking_number: string | null }[];
    if (moved.length) {
      await supabaseAdmin.from("delivery_batch_orders").upsert(
        moved.map((m) => ({ batch_id: keep, order_id: m.order_id, tracking_number: m.tracking_number, status: "pending" })) as never,
        { onConflict: "batch_id,order_id", ignoreDuplicates: true },
      );
      await supabaseAdmin.from("orders").update({ delivery_batch_id: keep } as never).in("id", moved.map((m) => m.order_id));
    }
    // les lignes des lots en double partent avec eux (ON DELETE CASCADE)
    await supabaseAdmin.from("delivery_batches").delete().in("id", dupes);
    await refreshCount(keep);
    await supabaseAdmin.from("delivery_batch_product_summary").delete().eq("batch_id", keep);
    await supabaseAdmin.from("delivery_batches").update({ total_products: 0 } as never).eq("id", keep);
  }
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
