"use server";
/**
 * lib/call-center/actions.ts
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import type { CallResult } from "@/types/call-center";
import type { OrderStatus } from "@/types/orders";

const MANAGER_ROLES  = ["super_admin", "admin", "manager"] as const;
const CC_ROLES       = ["super_admin", "admin", "manager", "call_center_agent"] as const;

// Map call result → order status
const RESULT_TO_STATUS: Record<CallResult, OrderStatus> = {
  confirmed:          "confirmed",
  refused:            "refused",
  no_answer:          "no_answer",
  unreachable:        "no_answer",
  wrong_number:       "no_answer",
  callback_requested: "no_answer",
};

// ─── Log a call ────────────────────────────────────────────────────────────────
export async function logCall(data: {
  orderId: string;
  phoneDialed: string;
  result: CallResult;
  durationSeconds: number;
  notes: string;
  startedAt: string;
  endedAt: string;
}) {
  const session = await requireRole([...CC_ROLES]);
  const supabase = await createClient();

  // Agent restriction — can only log calls for their assigned orders
  if (session.role === "call_center_agent") {
    const { data: order } = await supabase
      .from("orders")
      .select("assigned_to")
      .eq("id", data.orderId)
      .single();
    const o = order as { assigned_to: string | null } | null;
    if (!o || o.assigned_to !== session.authId) {
      return { success: false, error: "Commande non assignée à vous." };
    }
  }

  // Insert call log
  const { error: logErr } = await supabase
    .from("call_logs")
    .insert({
      order_id:        data.orderId,
      agent_id:        session.authId,
      phone_dialed:    data.phoneDialed,
      call_direction:  "outbound",
      duration_seconds: data.durationSeconds,
      disposition:     data.result,
      notes:           data.notes || null,
      call_started_at: data.startedAt,
      call_ended_at:   data.endedAt,
    } as never);

  if (logErr) return { success: false, error: logErr.message };

  // Update order call fields
  const newStatus = RESULT_TO_STATUS[data.result];

  const { data: currentOrder } = await supabase
    .from("orders")
    .select("status, call_attempts")
    .eq("id", data.orderId)
    .single();
  const cur = currentOrder as { status: string; call_attempts: number } | null;

  const updatePayload: Record<string, unknown> = {
    call_status:   data.result,
    last_call_at:  data.endedAt,
    call_attempts: (cur?.call_attempts ?? 0) + 1,
    status:        newStatus,
  };

  if (data.result === "confirmed") {
    updatePayload.confirmed_by = session.authId;
    updatePayload.confirmed_at = data.endedAt;
  }

  await supabase.from("orders").update(updatePayload as never).eq("id", data.orderId);

  // Status history
  await supabase.from("order_status_history").insert({
    order_id:    data.orderId,
    from_status: cur?.status ?? null,
    to_status:   newStatus,
    changed_by:  session.authId,
    notes:       `Appel: ${data.result} — durée: ${data.durationSeconds}s`,
  } as never);

  // Update agent daily stats
  await upsertAgentStats(session.authId, data.result, data.durationSeconds);

  revalidatePath("/admin/call-center");
  revalidatePath(`/admin/call-center/orders`);
  revalidatePath(`/admin/orders/${data.orderId}`);
  return { success: true };
}

// ─── Assign order to agent ─────────────────────────────────────────────────────
export async function assignOrderToAgent(orderId: string, agentId: string | null) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("orders")
    .update({ assigned_to: agentId } as never)
    .eq("id", orderId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/call-center/orders");
  revalidatePath("/admin/orders");
  return { success: true };
}

// ─── Bulk assign ───────────────────────────────────────────────────────────────
export async function bulkAssignOrders(orderIds: string[], agentId: string) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("orders")
    .update({ assigned_to: agentId } as never)
    .in("id", orderIds);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/call-center/orders");
  return { success: true, count: orderIds.length };
}

// ─── Update order notes (agent) ────────────────────────────────────────────────
export async function updateCallNotes(orderId: string, notes: string) {
  const session = await requireRole([...CC_ROLES]);
  const supabase = await createClient();

  if (session.role === "call_center_agent") {
    const { data: order } = await supabase
      .from("orders").select("assigned_to").eq("id", orderId).single();
    const o = order as { assigned_to: string | null } | null;
    if (!o || o.assigned_to !== session.authId) {
      return { success: false, error: "Non autorisé." };
    }
  }

  await supabase.from("orders").update({ notes: notes || null } as never).eq("id", orderId);
  revalidatePath(`/admin/call-center/orders/${orderId}`);
  return { success: true };
}

// ─── Internal: upsert agent daily stats ───────────────────────────────────────
async function upsertAgentStats(agentId: string, result: CallResult, durationSec: number) {
  const supabase = await createClient();
  const today    = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from("agent_daily_stats")
    .select("*")
    .eq("agent_id", agentId)
    .eq("stat_date", today)
    .single();

  const cur = existing as {
    calls_made: number; calls_confirmed: number; calls_refused: number;
    calls_no_answer: number; avg_call_duration_sec: number | null;
    orders_confirmed: number;
  } | null;

  const prevMade      = cur?.calls_made ?? 0;
  const prevDur       = cur?.avg_call_duration_sec ?? 0;
  const newMade       = prevMade + 1;
  const newAvgDur     = Math.round(((prevDur * prevMade) + durationSec) / newMade);

  const payload = {
    agent_id:            agentId,
    stat_date:           today,
    calls_made:          newMade,
    calls_confirmed:     (cur?.calls_confirmed ?? 0) + (result === "confirmed" ? 1 : 0),
    calls_refused:       (cur?.calls_refused   ?? 0) + (result === "refused"   ? 1 : 0),
    calls_no_answer:     (cur?.calls_no_answer ?? 0) + (["no_answer","unreachable","wrong_number"].includes(result) ? 1 : 0),
    avg_call_duration_sec: newAvgDur,
    orders_confirmed:    (cur?.orders_confirmed ?? 0) + (result === "confirmed" ? 1 : 0),
  };

  await supabase.from("agent_daily_stats").upsert(payload as never, {
    onConflict: "agent_id,stat_date",
  });
}
