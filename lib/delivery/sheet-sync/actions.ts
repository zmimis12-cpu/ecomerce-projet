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
import { getDeliveryClient } from "@/lib/delivery/client-factory";
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

type StoreContext = {
  storeId?:      string;
  storeName?:    string;
  sheetName?:    string;
  providerSlug?: string;
  companyId?:    string;
};

export async function syncSheetToDigylog(sheetId?: string, storeCtx?: StoreContext): Promise<SyncResult> {
  await requireRole([...MANAGER]);

  let config: ReturnType<typeof getSheetsConfig>;
  try { config = getSheetsConfig(); }
  catch (e) {
    return { success: false, error: String(e), total:0, sent:0, failed:0, skipped:0, rows:[] };
  }

  const spreadsheetId = sheetId || config.sheets.confirmed.id;
  // Use store-specific sheet name if provided, else fallback to env config
  const sheetName = storeCtx?.sheetName || config.sheets.confirmed.sheetName;

  if (!spreadsheetId) {
    return { success: false, error: "GOOGLE_SHEET_ID_CONFIRMED manquant dans Vercel.", total:0, sent:0, failed:0, skipped:0, rows:[] };
  }

  console.log(`[sheet-sync] Store: ${storeCtx?.storeName ?? "default"} | Sheet: ${spreadsheetId} | Tab: ${sheetName}`);

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

  // Use THIS store's token — never default
  const { createDigylogClientFromDB } = await import("@/lib/delivery/digylog/client");
  const client = await createDigylogClientFromDB(storeCtx?.storeId);

  // Use company ID from store context or lookup
  let companyId = storeCtx?.companyId ?? null;
  if (!companyId) {
    const { data: dcData } = await supabaseAdmin.from("delivery_companies").select("id").eq("slug","digylog").maybeSingle();
    companyId = (dcData as { id:string }|null)?.id ?? null;
  }

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
      // ── AUTO-CREATE order from Sheet row ────────────────────────────────────
      // Find product by SKU for pricing
      const { data: prodData } = await supabaseAdmin
        .from("products")
        .select("id,name,sku,sale_price_mad,total_cost_mad")
        .eq("sku", sku)
        .maybeSingle();
      type ProdRow = { id:string; name:string; sku:string; sale_price_mad:number; total_cost_mad:number };
      const prod = prodData as ProdRow | null;

      const unitCost  = prod?.total_cost_mad ?? 0;
      const subtotal  = codAmt;
      const cogs      = unitCost * qty;
      const estProfit = subtotal - cogs;

      // Insert order — order_number auto-generated by DB trigger
      // Do NOT pass order_number manually (let trigger generate HC-XXXXX)
      const insertPayload: Record<string, unknown> = {
        customer_name:    name,
        customer_phone:   normalPhone,
        customer_city:    city,
        customer_address: address || city,
        status:           "confirmed",
        subtotal,
        shipping_charge:  0,
        discount_amount:  0,
        cogs_total:       cogs,
        estimated_profit: estProfit,
        source:           "google_sheet",
        import_source:    "sheet_sync",
        notes:            notes || null,
        sheet_sync_status:"synced",
        sheet_synced_at:  new Date().toISOString(),
        confirmed_at:     new Date().toISOString(),
      };
      // Only set order_number if provided (avoids conflict with DB trigger)
      if (orderRef) insertPayload.external_delivery_id = orderRef;

      const { data: newOrder, error: createErr } = await supabaseAdmin
        .from("orders")
        .insert(insertPayload as never)
        .select("id,order_number").single();

      if (createErr || !newOrder) {
        const errMsg = `Erreur création: ${createErr?.message ?? "inconnue"}`;
        console.error("[sheet-sync] auto-create failed:", errMsg, { orderRef, name, sku });
        try { await updateSheetRow(spreadsheetId, sheetName, rowNumber, { K: "Not Sent", L: errMsg }); } catch {}
        results.push({ rowNumber, orderReference: orderRef, customerName: name, productSku: sku, tracking: null, status: "failed", error: errMsg });
        failed++;
        continue;
      }

      orderId     = (newOrder as { id:string; order_number:string }).id;
      orderNumber = (newOrder as { id:string; order_number:string }).order_number;

      console.log(`[sheet-sync] Auto-created order ${orderNumber} from sheet row ${rowNumber} (SKU: ${sku})`);

      // Write generated order number back to sheet column A
      try { await updateSheetRow(spreadsheetId, sheetName, rowNumber, { A: orderNumber }); } catch {}

      // Create order item
      const prodId   = prod?.id   ?? null;
      const prodName = prod?.name ?? (sku || "Produit");
      const prodSku  = prod?.sku  ?? sku ?? "";
      const unitPrice = prod?.sale_price_mad ?? codAmt;

      await supabaseAdmin.from("order_items").insert({
        order_id:     orderId,
        product_id:   prodId,
        product_name: prodName,
        product_sku:  prodSku,
        unit_price:   unitPrice,
        unit_cost_mad:unitCost,
        quantity:     qty,
        discount_pct: 0,
      } as never);
    }

    // Send to Digylog
    // IMPORTANT: Always use status=0 (add only, do NOT send per order).
    // We will call PUT /orders/send ONCE after all orders are created.
    // If status=1 is used, Digylog creates one BL per order — wrong behavior.
    const digylogResult = await client.createOrders({
      network: networkId, store: dg.default_store_name,
      mode: (dg.default_mode ?? 1) as 1|2,
      status: 0,  // ALWAYS 0 — never send per order
      checkDuplicate: 1,
      orders: [{
        num: orderNumber, type: 1, mode: (dg.default_mode ?? 1) as 1|2,
        network: String(networkId), fc: null, store: dg.default_store_name,
        name, phone: normalPhone, address: address || "N/A", city,
        price: codAmt, refs: [{ designation: sku, quantity: qty }],
        openproduct: 1, port: (dg.default_port ?? 1) as 1|2, note: notes || "",
      }],
    });

    const digylogOrders = (digylogResult as { orders?: unknown[] }).orders ?? [];
    if (!digylogResult.ok || !digylogOrders.length) {
      const errMsg = String((digylogResult as { error?: unknown }).error ?? "Pas de tracking retourné");
      try { await updateSheetRow(spreadsheetId, sheetName, rowNumber, { K: "Not Sent", L: errMsg }); } catch {}
      results.push({ rowNumber, orderReference: orderRef, customerName: name, productSku: sku, tracking: null, status: "failed", error: errMsg });
      failed++;
      continue;
    }

    const created  = digylogOrders[0] as { tracking?: string } | undefined;
    const tracking = created?.tracking;
    // bl_id is NOT saved here — it will be set after PUT /orders/send groups all orders

    // Save shipment — include delivery_store_id for isolation
    await supabaseAdmin.from("delivery_shipments").upsert({
      order_id: orderId, delivery_company_id: companyId,
      tracking_number: tracking, external_order_id: orderNumber,
      external_status: "Non envoyée", external_status_id: 0,
      internal_status: "not_sent", bl_id: null,
      raw_payload: created as never, last_synced_at: new Date().toISOString(),
    } as never, { onConflict: "order_id" });

    await supabaseAdmin.from("orders").update({
      delivery_tracking_number: tracking,
      delivery_company_id:      companyId,
      delivery_store_id:        storeCtx?.storeId ?? null,  // STORE ISOLATION
      delivery_external_status: "Non envoyée", delivery_external_status_id: 0,
      delivery_status: "not_sent", delivery_last_sync_at: new Date().toISOString(),
      status: "sent_to_delivery", bl_id: null,
      sent_to_delivery_at: new Date().toISOString(),        // for BL du Jour grouping
      external_delivery_id: orderNumber, import_source: "sheet_sync",
    } as never).eq("id", orderId);

    // Write back to sheet
    try {
      await updateSheetRow(spreadsheetId, sheetName, rowNumber, { J: tracking ?? "", K: "Sent", L: "" });
    } catch (e) {
      console.error("Sheet write-back failed:", e);
    }

    sentOrderIds.push(orderId);
    results.push({ rowNumber, orderReference: orderRef, customerName: name, productSku: sku, tracking: tracking ?? null, status: "sent", error: null });
    sent++;
  }

  // ── DAILY BATCH MODE ────────────────────────────────────────────────────────
  // DO NOT call PUT /orders/send here.
  // Orders accumulate in the open daily batch.
  // Admin clicks "Générer BL du jour" to close and get 1 grouped BL.
  let batchId: string | undefined;
  let batchNumber: string | undefined;

  if (sentOrderIds.length > 0) {
    const storeName = dg.default_store_name;
    const today     = new Date().toISOString().slice(0, 10);

    // Find existing open daily batch (same store, same day, no BL yet)
    const { data: existingBatch } = await supabaseAdmin
      .from("delivery_batches")
      .select("id, batch_number, total_orders")
      .eq("batch_date", today)
      .eq("store_name", storeName)
      .eq("shipping_company", "Digylog")
      .eq("status", "draft")  // ONLY draft — printed batches are closed to new orders
      .is("bl_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingBatch) {
      // Add to existing open batch
      batchId     = (existingBatch as { id:string; batch_number:string; total_orders:number }).id;
      batchNumber = (existingBatch as { id:string; batch_number:string; total_orders:number }).batch_number;
      console.log(`[sheet-sync] Adding ${sentOrderIds.length} orders to existing daily batch ${batchNumber}`);
    } else {
      // Create new daily batch for today
      const { data: newBatch, error: batchErr } = await supabaseAdmin
        .from("delivery_batches")
        .insert({
          batch_number:     "",
          batch_date:       today,
          status:           "draft",
          shipping_company: "Digylog",
          store_name:       storeName,
          total_orders:     0,
          total_products:   0,
        } as never)
        .select("id, batch_number")
        .single();

      if (batchErr || !newBatch) {
        console.error("[sheet-sync] Failed to create daily batch:", batchErr?.message);
      } else {
        batchId     = (newBatch as { id:string; batch_number:string }).id;
        batchNumber = (newBatch as { id:string; batch_number:string }).batch_number;
        console.log(`[sheet-sync] Created new daily batch ${batchNumber}`);
      }
    }

    if (batchId) {
      // Link orders to batch
      const batchOrderRows = sentOrderIds.map((oid) => ({
        batch_id:  batchId,
        order_id:  oid,
        status:    "pending",
        tracking_number: null as string | null,
      }));

      // Get trackings for these orders
      const { data: ordRows } = await supabaseAdmin
        .from("orders")
        .select("id, delivery_tracking_number")
        .in("id", sentOrderIds)
        .not("delivery_tracking_number", "is", null);

      const trackMap = new Map<string, string>();
      for (const o of (ordRows ?? []) as { id:string; delivery_tracking_number:string }[]) {
        trackMap.set(o.id, o.delivery_tracking_number);
      }

      for (const row of batchOrderRows) {
        row.tracking_number = trackMap.get(row.order_id) ?? null;
      }

      // Upsert — ignore duplicates if order already in batch
      await supabaseAdmin.from("delivery_batch_orders")
        .upsert(batchOrderRows as never, { onConflict: "batch_id,order_id", ignoreDuplicates: true });

      // Update order → batch link
      await supabaseAdmin.from("orders")
        .update({ delivery_batch_id: batchId } as never)
        .in("id", sentOrderIds);

      // Update batch total_orders count
      const { count } = await supabaseAdmin
        .from("delivery_batch_orders")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", batchId);

      await supabaseAdmin.from("delivery_batches")
        .update({ total_orders: count ?? 0, status: "draft" } as never)
        .eq("id", batchId);

      console.log(`[sheet-sync] ✓ Daily batch ${batchNumber} now has ${count} orders. No BL yet — click "Générer BL du jour" when ready.`);

      // Rebuild product summary so Récap + Tickets print correctly
      const { rebuildBatchProductSummary } = await import("../batch/actions");
      await rebuildBatchProductSummary(batchId);
    }
  }

  revalidatePath("/admin/delivery/batches");
  revalidatePath("/admin/delivery/notes");
  revalidatePath("/admin/delivery/documents");
  revalidatePath("/admin/delivery/sheet-sync");

  const totalRows = rawRows.filter((r) => r[0]?.trim() || r[1]?.trim()).length;
  return { success: true, total: totalRows, sent, failed, skipped, batchId, batchNumber, rows: results };
}
