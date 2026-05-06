"use server";
/**
 * lib/delivery/sheet-sync/actions.ts
 * Sync Google Sheet rows → Digylog → write back tracking/status.
 *
 * Sheet columns (1-indexed):
 * A: Order Reference  B: Name        C: Phone      D: Address
 * E: City             F: COD Amount  G: Product SKU H: Quantity
 * I: Notes            J: Tracking    K: Status     L: Errors
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { getSheetsConfig, readSheetRows, updateSheetRow } from "@/lib/automation/google-sheets";
import { createDigylogClientFromDB } from "@/lib/delivery/digylog/client";
import { revalidatePath } from "next/cache";

const MANAGER = ["super_admin","admin","manager"] as const;

export interface SheetRowResult {
  rowNumber:      number;
  orderReference: string;
  customerName:   string;
  productSku:     string;
  tracking:       string | null;
  status:         "sent" | "failed" | "skipped" | "invalid";
  error:          string | null;
}

export interface SyncResult {
  success:      boolean;
  error?:       string;
  total:        number;
  sent:         number;
  failed:       number;
  skipped:      number;
  batchId?:     string;
  batchNumber?: string;
  rows:         SheetRowResult[];
}

function normalizePhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("212") && d.length === 12) return "0" + d.slice(3);
  if (d.startsWith("0")   && d.length === 10) return d;
  return ("0" + d).slice(-10).padStart(10, "0");
}

export async function syncSheetToDigylog(sheetId?: string): Promise<SyncResult> {
  await requireRole([...MANAGER]);

  let config: ReturnType<typeof getSheetsConfig>;
  try { config = getSheetsConfig(); }
  catch (e) {
    return { success: false, error: String(e), total:0, sent:0, failed:0, skipped:0, rows:[] };
  }

  const spreadsheetId = sheetId || config.sheets.confirmed.id;
  const sheetName     = config.sheets.confirmed.sheetName;

  if (!spreadsheetId) {
    return { success: false, error: "GOOGLE_SHEET_ID_CONFIRMED manquant dans Vercel.", total:0, sent:0, failed:0, skipped:0, rows:[] };
  }

  let rawRows: string[][];
  try { rawRows = await readSheetRows(spreadsheetId, sheetName); }
  catch (e) {
    return { success: false, error: `Lecture Sheet impossible: ${String(e)}`, total:0, sent:0, failed:0, skipped:0, rows:[] };
  }

  if (!rawRows.length) return { success: true, total:0, sent:0, failed:0, skipped:0, rows:[] };

  // Load Digylog settings
  const { data: dgRaw } = await supabaseAdmin
    .from("digylog_settings")
    .select("default_network_id,default_store_name,default_port,default_mode,default_status_on_create")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  const dg = dgRaw as { default_network_id:number; default_store_name:string; default_port:1|2; default_mode:1|2; default_status_on_create:0|1 } | null;
  if (!dg?.default_store_name) {
    return { success: false, error: "Paramètres Digylog manquants.", total:0, sent:0, failed:0, skipped:0, rows:[] };
  }

  const networkId = parseInt(String(dg.default_network_id), 10);
  if (!networkId) {
    return { success: false, error: `ID réseau invalide: ${dg.default_network_id}`, total:0, sent:0, failed:0, skipped:0, rows:[] };
  }

  const client = await createDigylogClientFromDB();
  if (!client.hasToken()) {
    return { success: false, error: "Token Digylog manquant.", total:0, sent:0, failed:0, skipped:0, rows:[] };
  }

  const { data: dcData } = await supabaseAdmin.from("delivery_companies").select("id").eq("slug","digylog").maybeSingle();
  const companyId = (dcData as { id:string }|null)?.id ?? null;

  const results: SheetRowResult[] = [];
  let sent = 0, failed = 0, skipped = 0;
  const sentOrderIds: string[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row       = rawRows[i];
    const rowNumber = i + 2;

    const orderRef = (row[0] ?? "").trim();
    const name     = (row[1] ?? "").trim();
    const phone    = (row[2] ?? "").trim();
    const address  = (row[3] ?? "").trim();
    const city     = (row[4] ?? "").trim();
    const codAmt   = parseFloat((row[5] ?? "0").replace(/[^0-9.]/g, "")) || 0;
    const sku      = (row[6] ?? "").trim();
    const qty      = parseInt(row[7] ?? "1", 10) || 1;
    const notes    = (row[8] ?? "").trim();
    const existingTracking = (row[9] ?? "").trim();
    const statusCell       = (row[10] ?? "").trim().toLowerCase();

    if (!orderRef && !name && !phone) continue;

    // Skip already sent rows
    if (statusCell === "sent" && existingTracking) {
      results.push({ rowNumber, orderReference: orderRef, customerName: name, productSku: sku, tracking: existingTracking, status: "skipped", error: null });
      skipped++;
      continue;
    }

    // Validate
    const missing: string[] = [];
    if (!orderRef) missing.push("Order Reference");
    if (!name)     missing.push("Name");
    if (!phone)    missing.push("Phone");
    if (!address)  missing.push("Address");
    if (!city)     missing.push("City");
    if (!codAmt)   missing.push("COD Amount");
    if (!sku)      missing.push("Product SKU");

    if (missing.length) {
      const errMsg = `Champs manquants: ${missing.join(", ")}`;
      try { await updateSheetRow(spreadsheetId, sheetName, rowNumber, { K: "Not Sent", L: errMsg }); } catch {}
      results.push({ rowNumber, orderReference: orderRef, customerName: name, productSku: sku, tracking: null, status: "invalid", error: errMsg });
      failed++;
      continue;
    }

    const normalPhone = normalizePhone(phone);

    // Find or create order
    let orderId: string | null = null;
    let orderNumber = orderRef;

    const { data: existingOrder } = await supabaseAdmin
      .from("orders")
      .select("id,order_number,delivery_tracking_number")
      .or(`order_number.eq.${orderRef},external_delivery_id.eq.${orderRef}`)
      .maybeSingle();

    if (existingOrder) {
      const eo = existingOrder as { id:string; order_number:string; delivery_tracking_number:string|null };
      orderId     = eo.id;
      orderNumber = eo.order_number;

      if (eo.delivery_tracking_number) {
        try { await updateSheetRow(spreadsheetId, sheetName, rowNumber, { J: eo.delivery_tracking_number, K: "Sent", L: "" }); } catch {}
        results.push({ rowNumber, orderReference: orderRef, customerName: name, productSku: sku, tracking: eo.delivery_tracking_number, status: "skipped", error: null });
        skipped++;
        continue;
      }

      await supabaseAdmin.from("orders").update({
        customer_name: name, customer_phone: normalPhone,
        customer_city: city, customer_address: address,
        total_amount_mad: codAmt, notes: notes || null,
      } as never).eq("id", orderId);

    } else {
      const { data: newOrder, error: createErr } = await supabaseAdmin
        .from("orders")
        .insert({
          order_number: orderRef, customer_name: name,
          customer_phone: normalPhone, customer_city: city,
          customer_address: address, total_amount_mad: codAmt,
          notes: notes || null, status: "confirmed",
          source: "google_sheet", import_source: "sheet_sync",
          subtotal: codAmt, total_amount: codAmt,
        } as never)
        .select("id,order_number").single();

      if (createErr || !newOrder) {
        const errMsg = `Erreur création: ${createErr?.message ?? "inconnue"}`;
        try { await updateSheetRow(spreadsheetId, sheetName, rowNumber, { K: "Not Sent", L: errMsg }); } catch {}
        results.push({ rowNumber, orderReference: orderRef, customerName: name, productSku: sku, tracking: null, status: "failed", error: errMsg });
        failed++;
        continue;
      }

      orderId     = (newOrder as { id:string; order_number:string }).id;
      orderNumber = (newOrder as { id:string; order_number:string }).order_number;

      // Find product by SKU
      const { data: prod } = await supabaseAdmin.from("products").select("id,name").eq("sku", sku).maybeSingle();
      const prodId   = (prod as { id:string; name:string }|null)?.id ?? null;
      const prodName = (prod as { id:string; name:string }|null)?.name ?? sku;

      await supabaseAdmin.from("order_items").insert({
        order_id: orderId, product_id: prodId, sku,
        product_name: prodName, quantity: qty,
        unit_price_mad: codAmt, total_price_mad: codAmt * qty, line_cogs: 0,
      } as never);
    }

    // Send to Digylog
    const digylogResult = await client.createOrders({
      network: networkId, store: dg.default_store_name,
      mode: (dg.default_mode ?? 1) as 1|2,
      status: (dg.default_status_on_create ?? 1) as 0|1,
      checkDuplicate: 1,
      orders: [{
        num: orderNumber, type: 1, mode: (dg.default_mode ?? 1) as 1|2,
        network: String(networkId), fc: null, store: dg.default_store_name,
        name, phone: normalPhone, address: address || "N/A", city,
        price: codAmt, refs: [{ designation: sku, quantity: qty }],
        openproduct: 1, port: (dg.default_port ?? 1) as 1|2, note: notes || "",
      }],
    });

    if (!digylogResult.ok || !digylogResult.orders.length) {
      const errMsg = digylogResult.error ?? "Pas de tracking retourné";
      try { await updateSheetRow(spreadsheetId, sheetName, rowNumber, { K: "Not Sent", L: errMsg }); } catch {}
      results.push({ rowNumber, orderReference: orderRef, customerName: name, productSku: sku, tracking: null, status: "failed", error: errMsg });
      failed++;
      continue;
    }

    const created  = digylogResult.orders[0];
    const tracking = created.tracking;
    const blId     = created.bl != null ? Number(created.bl) : null;

    // Save shipment + update order
    await supabaseAdmin.from("delivery_shipments").upsert({
      order_id: orderId, delivery_company_id: companyId,
      tracking_number: tracking, external_order_id: orderNumber,
      external_status: "Non envoyée", external_status_id: 0,
      internal_status: "not_sent", bl_id: blId,
      raw_payload: created as never, last_synced_at: new Date().toISOString(),
    } as never, { onConflict: "order_id" });

    await supabaseAdmin.from("orders").update({
      delivery_tracking_number: tracking, delivery_company_id: companyId,
      delivery_external_status: "Non envoyée", delivery_external_status_id: 0,
      delivery_status: "not_sent", delivery_last_sync_at: new Date().toISOString(),
      status: "sent_to_delivery", bl_id: blId,
      external_delivery_id: orderNumber, import_source: "sheet_sync",
    } as never).eq("id", orderId);

    // Write back to sheet
    try {
      await updateSheetRow(spreadsheetId, sheetName, rowNumber, { J: tracking, K: "Sent", L: "" });
    } catch (e) {
      console.error("Sheet write-back failed:", e);
    }

    sentOrderIds.push(orderId);
    results.push({ rowNumber, orderReference: orderRef, customerName: name, productSku: sku, tracking, status: "sent", error: null });
    sent++;
  }

  // Create delivery batch for sent orders
  let batchId: string | undefined;
  let batchNumber: string | undefined;

  if (sentOrderIds.length > 0) {
    const { createBatch } = await import("@/lib/delivery/batch/actions");
    const bRes = await createBatch(sentOrderIds, `Sheet Sync — ${new Date().toLocaleDateString("fr-MA")}`);
    if (bRes.success && bRes.batchId) {
      batchId     = bRes.batchId;
      batchNumber = bRes.batchNumber;

      // Find the real Digylog BL ID from the sent orders
      // When status=1 (add+send), Digylog returns bl in each order response
      // When status=0, we need to call PUT /orders/send to get the bl
      let realBlId: number | null = null;

      // Try to get bl_id from already-saved orders
      const { data: sentOrders } = await supabaseAdmin
        .from("orders")
        .select("bl_id, delivery_tracking_number")
        .in("id", sentOrderIds)
        .not("bl_id", "is", null)
        .limit(1);

      const existingBlId = (sentOrders?.[0] as { bl_id?: number } | undefined)?.bl_id ?? null;

      if (existingBlId) {
        realBlId = existingBlId;
      } else {
        // status=0 case: call PUT /orders/send to get bl_id
        const trackingsToSend = results
          .filter((r) => r.status === "sent" && r.tracking)
          .map((r) => r.tracking!);

        if (trackingsToSend.length > 0) {
          try {
            const sendRes = await client.sendOrders(trackingsToSend);
            if (sendRes.ok && sendRes.bl) {
              realBlId = sendRes.bl;
              // Update all sent orders with the real bl_id
              await supabaseAdmin.from("orders")
                .update({ bl_id: realBlId, status: "sent_to_delivery" } as never)
                .in("id", sentOrderIds);
              await supabaseAdmin.from("delivery_shipments")
                .update({ bl_id: realBlId, internal_status: "not_sent" } as never)
                .in("order_id", sentOrderIds);
            }
          } catch (e) {
            console.error("[sheet-sync] sendOrders failed:", e);
          }
        }
      }

      // Update batch with real bl_id, status, store_name
      await supabaseAdmin.from("delivery_batches").update({
        status:      "sent",
        sent_at:     new Date().toISOString(),
        bl_id:       realBlId,
        store_name:  dg?.default_store_name ?? null,
        shipping_company: "Digylog",
      } as never).eq("id", bRes.batchId);

      await supabaseAdmin.from("delivery_batch_orders")
        .update({ status: "sent" } as never)
        .eq("batch_id", bRes.batchId);
    }
  }

  revalidatePath("/admin/delivery/batches");
  revalidatePath("/admin/delivery/sheet-sync");

  const totalRows = rawRows.filter((r) => r[0]?.trim() || r[1]?.trim()).length;
  return { success: true, total: totalRows, sent, failed, skipped, batchId, batchNumber, rows: results };
}
