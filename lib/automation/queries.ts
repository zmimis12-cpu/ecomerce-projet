/**
 * lib/automation/queries.ts
 */
import { createClient } from "@/lib/supabase/server";

export interface SyncLogRow {
  id: string;
  order_id: string;
  order_number: string | null;
  customer_name: string | null;
  sheet_type: string;
  status: string;
  error_message: string | null;
  sheet_row: number | null;
  created_at: string;
}

export interface WebhookLogRow {
  id: string;
  event_type: string;
  order_id: string | null;
  status: string;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

/** Recent sync logs with order info */
export async function getSyncLogs(limit = 50): Promise<SyncLogRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("google_sheet_sync_logs")
    .select("id, order_id, sheet_type, status, error_message, sheet_row, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  const rows = data as unknown as Omit<SyncLogRow, "order_number" | "customer_name">[];
  const orderIds = [...new Set(rows.map((r) => r.order_id))];

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, customer_name")
    .in("id", orderIds);

  const orderMap: Record<string, { order_number: string; customer_name: string }> = {};
  for (const o of (orders ?? []) as unknown as { id: string; order_number: string; customer_name: string }[]) {
    orderMap[o.id] = o;
  }

  return rows.map((r) => ({
    ...r,
    order_number:  orderMap[r.order_id]?.order_number  ?? null,
    customer_name: orderMap[r.order_id]?.customer_name ?? null,
  }));
}

/** Recent webhook logs */
export async function getWebhookLogs(limit = 50): Promise<WebhookLogRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("webhook_logs")
    .select("id, event_type, order_id, status, error, duration_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as unknown as WebhookLogRow[];
}

/** Summary counts for dashboard */
export async function getAutomationSummary() {
  const supabase = await createClient();

  const [syncRes, webhookRes] = await Promise.all([
    supabase.from("google_sheet_sync_logs")
      .select("status")
      .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()),
    supabase.from("webhook_logs")
      .select("status")
      .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()),
  ]);

  const syncRows    = (syncRes.data    ?? []) as { status: string }[];
  const webhookRows = (webhookRes.data ?? []) as { status: string }[];

  return {
    sync: {
      total:   syncRows.length,
      success: syncRows.filter((r) => r.status === "success").length,
      failed:  syncRows.filter((r) => r.status === "failed").length,
    },
    webhooks: {
      total:   webhookRows.length,
      success: webhookRows.filter((r) => r.status === "success").length,
      failed:  webhookRows.filter((r) => r.status === "failed").length,
    },
  };
}

/** Orders pending sync or failed */
export async function getPendingSyncOrders(limit = 50) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, status, sync_status, last_sync_at, sync_error")
    .in("sync_status", ["failed", "pending"])
    .not("status", "in", '("new","refused","no_answer","cancelled")')
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as unknown as {
    id: string; order_number: string; customer_name: string;
    status: string; sync_status: string | null;
    last_sync_at: string | null; sync_error: string | null;
  }[];
}
