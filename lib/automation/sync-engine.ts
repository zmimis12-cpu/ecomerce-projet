/**
 * lib/automation/sync-engine.ts
 * Core sync engine — server-side only.
 * Fetches order data, maps to sheet columns, writes to Google Sheets,
 * logs result to google_sheet_sync_logs and webhook_logs.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getSheetsConfig, appendRowToSheet, findRowByOrderNumber,
  ensureSheetHeader,
} from "./google-sheets";
import type { SheetType } from "./google-sheets";

// ─── Column mapping ────────────────────────────────────────────────────────────
// Maps DB fields → Google Sheet columns (in order)
// Order Reference | Name | Phone | Address | City | COD Amount |
// Product SKU | Quantity | Notes | Tracking Number | Status | Errors

interface OrderRow {
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_city: string;
  total_amount_mad: number;
  product_sku: string;
  quantity: number;
  notes: string | null;
  delivery_tracking_number: string | null;
  status: string;
  sync_error: string | null;
}

function orderToSheetRow(o: OrderRow): (string | number | null)[] {
  return [
    o.order_number,
    o.customer_name,
    o.customer_phone,
    o.customer_address,
    o.customer_city,
    o.total_amount_mad,
    o.product_sku,
    o.quantity,
    o.notes ?? "",
    o.delivery_tracking_number ?? "",
    o.status,
    o.sync_error ?? "",
  ];
}

// ─── Fetch order data for sync ─────────────────────────────────────────────────
async function fetchOrderForSync(orderId: string): Promise<OrderRow | null> {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select(`
      id, order_number, customer_name, customer_phone,
      customer_address, customer_city, total_amount_mad,
      notes, delivery_tracking_number, status, sync_error
    `)
    .eq("id", orderId)
    .single();

  if (error || !order) {
    console.error("[sync] fetchOrderForSync error:", error?.message);
    return null;
  }

  // Get first product SKU and quantity from order_items
  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("product_sku, quantity")
    .eq("order_id", orderId)
    .limit(1)
    .single();

  const o = order as unknown as OrderRow;
  const item = items as unknown as { product_sku: string; quantity: number } | null;

  return {
    ...o,
    product_sku: item?.product_sku ?? "",
    quantity:    item?.quantity    ?? 1,
  };
}

// ─── Log to google_sheet_sync_logs ────────────────────────────────────────────
async function logSyncResult(data: {
  orderId: string;
  sheetType: SheetType;
  status: "success" | "failed";
  errorMessage?: string;
  sheetRow?: number;
  payload?: object;
}) {
  await supabaseAdmin.from("google_sheet_sync_logs").insert({
    order_id:      data.orderId,
    sheet_type:    data.sheetType,
    status:        data.status,
    error_message: data.errorMessage ?? null,
    sheet_row:     data.sheetRow ?? null,
    payload:       data.payload ?? null,
  } as never);

  // Update order sync_status
  await supabaseAdmin
    .from("orders")
    .update({
      sync_status:  data.status === "success" ? "synced" : "failed",
      sync_error:   data.errorMessage ?? null,
      last_sync_at: new Date().toISOString(),
    } as never)
    .eq("id", data.orderId);
}

// ─── Log to webhook_logs ───────────────────────────────────────────────────────
async function logWebhookEvent(data: {
  eventType: string;
  orderId: string;
  payload: object;
  status: "success" | "failed";
  error?: string;
  durationMs?: number;
}) {
  await supabaseAdmin.from("webhook_logs").insert({
    event_type:  data.eventType,
    order_id:    data.orderId,
    payload:     data.payload,
    status:      data.status,
    error:       data.error ?? null,
    duration_ms: data.durationMs ?? null,
  } as never);
}

// ─── Main sync function ────────────────────────────────────────────────────────
/**
 * syncOrderToGoogleSheets
 * Called when an order status changes to a sync-triggering status.
 * Features:
 *  - Fetches order + items from DB
 *  - Checks for duplicate row (by order_number in column A)
 *  - Ensures header row exists
 *  - Appends row to correct sheet
 *  - Logs result to DB
 *  - Returns { success, error }
 */
export async function syncOrderToGoogleSheets(
  orderId: string,
  sheetType: SheetType
): Promise<{ success: boolean; error?: string }> {
  const startedAt = Date.now();

  // Check if Google Sheets is configured
  let config: ReturnType<typeof getSheetsConfig>;
  try {
    config = getSheetsConfig();
  } catch (e) {
    const msg = `Google Sheets not configured: ${String(e)}`;
    console.warn("[sync]", msg);
    await logWebhookEvent({
      eventType: `order.${sheetType}`,
      orderId,
      payload: { sheetType },
      status: "failed",
      error: msg,
      durationMs: Date.now() - startedAt,
    });
    return { success: false, error: msg };
  }

  const sheetConfig = config.sheets[sheetType];
  if (!sheetConfig.id) {
    const msg = `Sheet ID not configured for type: ${sheetType}`;
    await logSyncResult({ orderId, sheetType, status: "failed", errorMessage: msg });
    return { success: false, error: msg };
  }

  // Fetch order
  const order = await fetchOrderForSync(orderId);
  if (!order) {
    const msg = "Order not found in database";
    await logSyncResult({ orderId, sheetType, status: "failed", errorMessage: msg });
    return { success: false, error: msg };
  }

  try {
    // Ensure header row exists
    await ensureSheetHeader(sheetConfig.id, sheetConfig.sheetName);

    // Duplicate check — skip if already synced this order to this sheet
    const existingRow = await findRowByOrderNumber(
      sheetConfig.id,
      sheetConfig.sheetName,
      order.order_number
    );

    if (existingRow !== null) {
      // Already exists — update sync status but don't re-write
      await logSyncResult({
        orderId,
        sheetType,
        status: "success",
        sheetRow: existingRow,
        payload: { skipped: true, reason: "duplicate", existingRow },
      });
      await logWebhookEvent({
        eventType: `order.${sheetType}`,
        orderId,
        payload: { sheetType, orderNumber: order.order_number, skipped: true },
        status: "success",
        durationMs: Date.now() - startedAt,
      });
      return { success: true };
    }

    // Build and append row
    const row    = orderToSheetRow(order);
    const result = await appendRowToSheet(sheetConfig.id, sheetConfig.sheetName, row);

    await logSyncResult({
      orderId,
      sheetType,
      status: "success",
      sheetRow: parseInt(result.updatedRange.match(/\d+$/)?.[0] ?? "0"),
      payload: { row, updatedRange: result.updatedRange },
    });

    await logWebhookEvent({
      eventType: `order.${sheetType}`,
      orderId,
      payload: { sheetType, orderNumber: order.order_number, updatedRange: result.updatedRange },
      status: "success",
      durationMs: Date.now() - startedAt,
    });

    return { success: true };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync] syncOrderToGoogleSheets error:", msg);

    await logSyncResult({ orderId, sheetType, status: "failed", errorMessage: msg });
    await logWebhookEvent({
      eventType: `order.${sheetType}`,
      orderId,
      payload: { sheetType, orderNumber: order.order_number },
      status: "failed",
      error: msg,
      durationMs: Date.now() - startedAt,
    });

    return { success: false, error: msg };
  }
}

// ─── Batch retry failed syncs ──────────────────────────────────────────────────
export async function retryFailedSyncs(): Promise<{ retried: number; succeeded: number }> {
  const { data: failedLogs } = await supabaseAdmin
    .from("google_sheet_sync_logs")
    .select("id, order_id, sheet_type")
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!failedLogs || failedLogs.length === 0) return { retried: 0, succeeded: 0 };

  const logs = failedLogs as unknown as { id: string; order_id: string; sheet_type: SheetType }[];
  let succeeded = 0;

  for (const log of logs) {
    const result = await syncOrderToGoogleSheets(log.order_id, log.sheet_type);
    if (result.success) succeeded++;
    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 200));
  }

  return { retried: logs.length, succeeded };
}
