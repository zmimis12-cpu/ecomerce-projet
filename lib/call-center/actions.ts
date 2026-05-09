"use server";
/**
 * lib/call-center/actions.ts
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { syncOrderToGoogleSheets } from "@/lib/automation/sync-engine";
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
  fake_order:         "cancelled",
  duplicate:          "cancelled",
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

  // Save call notes to orders.notes so they appear in Google Sheets sync
  if (data.notes && data.notes.trim()) {
    updatePayload.notes = data.notes.trim();
  }

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

  // Trigger Google Sheets sync (non-blocking)
  if (data.result === "confirmed") {
    syncOrderToGoogleSheets(data.orderId, "confirmed").catch(console.error);
  } else if (data.result === "refused" || data.result === "no_answer") {
    // No sync needed for these
  }

  return { success: true };
}

// ─── Assign order to agent ─────────────────────────────────────────────────────
export async function assignOrderToAgent(orderId: string, agentId: string | null) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();

  // Server-side validation: agentId must be a call_center_agent
  if (agentId) {
    const { data: agent } = await supabase.from("users").select("role, is_active")
      .eq("id", agentId).maybeSingle();
    const a = agent as { role: string; is_active: boolean } | null;
    if (!a || a.role !== "call_center_agent" || !a.is_active) {
      return { success: false, error: "Utilisateur invalide — doit être agent call center actif." };
    }
  }

  const { error } = await supabase
    .from("orders")
    .update({ assigned_to: agentId, assigned_at: agentId ? new Date().toISOString() : null } as never)
    .eq("id", orderId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/call-center/queue");
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

// ─── Schedule callback ────────────────────────────────────────────────────────
export async function scheduleCallback(data: {
  orderId:    string;
  callbackAt: string;  // ISO datetime
  reason?:    string;
}) {
  await requireRole([...CC_ROLES]);
  const supabase = await createClient();

  await supabase.from("orders").update({
    callback_scheduled_at: data.callbackAt,
    callback_reason:       data.reason ?? null,
    status:                "no_answer",
  } as never).eq("id", data.orderId);

  revalidatePath("/admin/call-center/orders");
  return { success: true };
}

// ─── Get agent commissions ────────────────────────────────────────────────────
export async function getAgentCommissions(agentId?: string) {
  await requireRole([...CC_ROLES]);
  const supabase = await createClient();

  // Get agents with their confirmed + delivered_paid orders
  let q = supabase
    .from("call_logs")
    .select("agent_id, result, orders!inner(status, total_amount_mad)")
    .eq("result", "confirmed");

  if (agentId) q = q.eq("agent_id", agentId);

  const { data } = await q;
  type Row = { agent_id: string; result: string; orders: { status: string; total_amount_mad: number } };
  const rows = (data ?? []) as Row[];

  const map = new Map<string, { confirmed: number; delivered: number; commission: number }>();
  for (const row of rows) {
    const e = map.get(row.agent_id) ?? { confirmed: 0, delivered: 0, commission: 0 };
    e.confirmed++;
    if (["delivered", "paid"].includes(row.orders?.status ?? "")) {
      e.delivered++;
      e.commission += 3; // 3 MAD per delivered — configurable later
    }
    map.set(row.agent_id, e);
  }

  return [...map.entries()].map(([id, stats]) => ({ agentId: id, ...stats }));
}

// ─── Set agent availability ───────────────────────────────────────────────────
export async function setAgentAvailability(
  status: "available" | "in_call" | "away" | "offline"
) {
  const session = await requireRole([...CC_ROLES]);
  const supabase = await createClient();
  await supabase.from("users").update({ availability_status: status } as never)
    .eq("id", session.authId);
  revalidatePath("/admin/call-center");
  return { success: true };
}

// ─── Auto-assign orders to agents (least-assigned) ───────────────────────────
export async function autoAssignOrders(): Promise<{
  success: boolean; assigned: number; skipped: number;
}> {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();

  // Get available agents (call_center_agent + available status)
  const { data: agents } = await supabase
    .from("users")
    .select("id")
    .eq("role", "call_center_agent")
    .eq("is_active", true)
    .eq("availability_status", "available");

  const agentList = (agents ?? []) as { id: string }[];
  if (!agentList.length) return { success: true, assigned: 0, skipped: 0 };

  // Get unassigned orders in pending_call
  const { data: unassigned } = await supabase
    .from("orders")
    .select("id")
    .is("assigned_to", null)
    .in("status", ["new", "confirmed", "no_answer"])
    .order("created_at", { ascending: true })
    .limit(100);

  const orders = (unassigned ?? []) as { id: string }[];
  if (!orders.length) return { success: true, assigned: 0, skipped: 0 };

  // Count pending assigned per agent
  const { data: counts } = await supabase
    .from("orders")
    .select("assigned_to")
    .in("assigned_to", agentList.map((a) => a.id))
    .in("status", ["new", "confirmed", "no_answer"]);

  const countMap = new Map<string, number>();
  for (const a of agentList) countMap.set(a.id, 0);
  for (const row of (counts ?? []) as { assigned_to: string }[]) {
    countMap.set(row.assigned_to, (countMap.get(row.assigned_to) ?? 0) + 1);
  }

  let assigned = 0;
  for (const order of orders) {
    // Pick agent with least pending
    const agent = [...countMap.entries()].sort((a, b) => a[1] - b[1])[0];
    if (!agent) break;

    await supabase.from("orders").update({
      assigned_to: agent[0],
      assigned_at: new Date().toISOString(),
      call_status: "pending_call",
    } as never).eq("id", order.id);

    countMap.set(agent[0], (countMap.get(agent[0]) ?? 0) + 1);
    assigned++;
  }

  revalidatePath("/admin/call-center");
  return { success: true, assigned, skipped: orders.length - assigned };
}
