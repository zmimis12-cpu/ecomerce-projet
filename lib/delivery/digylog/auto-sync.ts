/**
 * lib/delivery/digylog/auto-sync.ts — filet de sécurité automatique du webhook.
 * Relit chez Digylog chaque commande encore en cours et aligne notre système
 * sur leur panel : statut exact ("Au hub network", "Confirmé par livreur *"…),
 * téléphone du livreur, date de report. Server-only (appelé par le cron).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createDigylogClientFromDB } from "./client";
import { applyDigylogStatusUpdate } from "@/lib/delivery/shipment-actions";

type ORow = {
  id: string;
  delivery_tracking_number: string;
  delivery_store_id: string | null;
  delivery_external_status_id: number | null;
  delivery_driver_phone: string | null;
  delivery_reported_to: string | null;
};

export async function syncDigylogActiveOrders(opts: { max?: number } = {}) {
  const max = opts.max ?? 300;
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id, delivery_tracking_number, delivery_store_id, delivery_external_status_id, delivery_driver_phone, delivery_reported_to")
    .not("delivery_tracking_number", "is", null)
    .in("status", ["sent_to_delivery", "in_transit", "delivered", "postponed"])
    .neq("fulfillment_type", "self_delivery")
    .order("delivery_last_sync_at", { ascending: true, nullsFirst: true })
    .limit(max);
  if (error) return { ok: false, error: error.message };
  const orders = (data ?? []) as unknown as ORow[];
  if (!orders.length) return { ok: true, checked: 0, statusChanged: 0, failed: 0 };

  // Store par défaut = premier store actif avec token (aucun n'a is_default)
  const { data: firstStore } = await supabaseAdmin
    .from("delivery_stores")
    .select("id")
    .eq("is_active", true)
    .not("api_token", "is", null)
    .neq("api_token", "")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const defaultStore = (firstStore as { id: string } | null)?.id ?? null;

  const clients = new Map<string, Awaited<ReturnType<typeof createDigylogClientFromDB>>>();
  const clientFor = async (storeId: string | null) => {
    const key = storeId ?? defaultStore ?? "legacy";
    if (!clients.has(key)) clients.set(key, await createDigylogClientFromDB(storeId ?? defaultStore));
    return clients.get(key)!;
  };

  let statusChanged = 0, failed = 0;
  const now = new Date().toISOString();

  const work = async (o: ORow) => {
    try {
      const client = await clientFor(o.delivery_store_id);
      const info = (await client.getOrderInfos(o.delivery_tracking_number)) as Record<string, unknown> | null;
      if (!info) { failed++; return; }
      const idStatus = Number(info.idStatus ?? 0);
      const label = String(info.status ?? "");

      if (idStatus !== o.delivery_external_status_id && (idStatus || label)) {
        await applyDigylogStatusUpdate({
          tracking: o.delivery_tracking_number,
          externalStatus: label,
          idStatus,
          motif: String(info.motif ?? ""),
          postponedTo: (info.reportedTo as string) ?? null,
          eventTime: String(info.updatedAt ?? now),
          rawPayload: { ...info, _source: "auto_sync" },
        });
        statusChanged++;
      }

      const fee = Number(info.deliveryCost);
      await supabaseAdmin.from("orders").update({
        // Vrais frais Digylog (20/30/35 selon la ville) au lieu du forfait 35 :
        // le trigger recalcule le profit réel automatiquement.
        ...(fee > 0 ? { actual_delivery_cost: fee } : {}),
        delivery_driver_phone: (info.driverPhone as string) || null,
        delivery_reported_to:  (info.reportedTo as string) || null,
        delivery_last_sync_at: now,
      } as never).eq("id", o.id);
    } catch {
      failed++;
    }
  };

  // 6 requêtes en parallèle max pour ne pas saturer l'API Digylog
  for (let i = 0; i < orders.length; i += 6) {
    await Promise.all(orders.slice(i, i + 6).map(work));
  }
  return { ok: true, checked: orders.length, statusChanged, failed };
}
