"use server";
/**
 * lib/delivery/repair-actions.ts
 * Repair existing data — regroup old small batches into one daily batch.
 * Server-side only.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { closeDailyBatch } from "@/lib/delivery/batch/actions";

const MANAGER = ["super_admin","admin","manager"] as const;

/**
 * Regroup all orders of a given date/store into one open daily batch.
 * Merges all existing small batches (from old flow) into one.
 */
export async function regroupDailyOrders(params: {
  date:      string; // YYYY-MM-DD
  storeName: string;
  provider:  string;
}): Promise<{
  ok: boolean;
  batchId?: string;
  batchNumber?: string;
  orderCount?: number;
  error?: string;
}> {
  await requireRole([...MANAGER]);
  const { date, storeName, provider } = params;

  // Find all orders sent on this date (by delivery_last_sync_at or created_at)
  const { data: dayOrders } = await supabaseAdmin
    .from("orders")
    .select("id, delivery_tracking_number, delivery_batch_id, bl_id")
    .eq("status", "sent_to_delivery")
    .gte("created_at", `${date}T00:00:00`)
    .lt("created_at",  `${date}T23:59:59`)
    .not("delivery_tracking_number", "is", null);

  type DayOrder = {
    id: string;
    delivery_tracking_number: string;
    delivery_batch_id: string | null;
    bl_id: number | null;
  };

  const orders = (dayOrders ?? []) as DayOrder[];
  if (!orders.length) {
    return { ok: false, error: "Aucune commande trouvée pour cette date." };
  }

  // Find or create the canonical daily batch
  const { data: existing } = await supabaseAdmin
    .from("delivery_batches")
    .select("id, batch_number")
    .eq("batch_date", date)
    .eq("store_name", storeName)
    .eq("shipping_company", provider)
    .in("status", ["draft", "tickets_printed"])
    .is("bl_id", null)
    .order("created_at", { ascending: true }) // oldest first = canonical
    .limit(1)
    .maybeSingle();

  let batchId: string;
  let batchNumber: string;

  if (existing) {
    batchId     = (existing as { id: string; batch_number: string }).id;
    batchNumber = (existing as { id: string; batch_number: string }).batch_number;
  } else {
    const { data: created, error } = await supabaseAdmin
      .from("delivery_batches")
      .insert({
        batch_number:     "",
        batch_date:       date,
        status:           "draft",
        shipping_company: provider,
        store_name:       storeName,
        total_orders:     0,
        total_products:   0,
      } as never)
      .select("id, batch_number")
      .single();

    if (error || !created) {
      return { ok: false, error: `Impossible de créer le batch: ${error?.message}` };
    }
    batchId     = (created as { id: string; batch_number: string }).id;
    batchNumber = (created as { id: string; batch_number: string }).batch_number;
  }

  // Move all day orders into this batch
  const orderIds = orders.map((o) => o.id);

  // Upsert into delivery_batch_orders
  const batchRows = orders.map((o) => ({
    batch_id:        batchId,
    order_id:        o.id,
    tracking_number: o.delivery_tracking_number,
    status:          "pending",
  }));

  await supabaseAdmin.from("delivery_batch_orders")
    .upsert(batchRows as never, { onConflict: "batch_id,order_id", ignoreDuplicates: true });

  // Update orders → new batch
  await supabaseAdmin.from("orders")
    .update({ delivery_batch_id: batchId, bl_id: null } as never)
    .in("id", orderIds);

  // Update count
  const { count } = await supabaseAdmin
    .from("delivery_batch_orders")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId);

  await supabaseAdmin.from("delivery_batches")
    .update({ total_orders: count ?? 0 } as never)
    .eq("id", batchId);

  // Clean up old small batches (mark as cancelled, don't delete)
  const oldBatchIds = [...new Set(
    orders.map((o) => o.delivery_batch_id).filter(Boolean) as string[]
  )].filter((id) => id !== batchId);

  if (oldBatchIds.length) {
    await supabaseAdmin.from("delivery_batches")
      .update({ status: "cancelled" } as never)
      .in("id", oldBatchIds);
  }

  revalidatePath("/admin/delivery/notes");
  revalidatePath("/admin/delivery/documents");

  return { ok: true, batchId, batchNumber, orderCount: count ?? 0 };
}
