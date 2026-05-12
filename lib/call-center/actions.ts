"use server";
/**
 * lib/call-center/actions.ts
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { syncOrderToGoogleSheets } from "@/lib/automation/sync-engine";
import type { CallResult } from "@/types/call-center";
import type { OrderStatus } from "@/types/orders";

const MANAGER_ROLES  = ["super_admin", "admin", "manager"] as const;
const CC_ROLES       = ["super_admin", "admin", "manager", "call_center_agent"] as const;

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

  if (session.role === "call_center_agent") {
    const { data: order } = await supabase.from("orders").select("assigned_to").eq("id", data.orderId).single();
    const o = order as { assigned_to: string | null } | null;
    if (!o || o.assigned_to !== session.authId) {
      return { success: false, error: "Commande non assignée à vous." };
    }
  }

  const { error: logErr } = await supabase.from("call_logs").insert({
    order_id: data.orderId, agent_id: session.authId,
    phone_dialed: data.phoneDialed, call_direction: "outbound",
    duration_seconds: data.durationSeconds, disposition: data.result,
    notes: data.notes || null, call_started_at: data.startedAt, call_ended_at: data.endedAt,
  } as never);

  if (logErr) return { success: false, error: logErr.message };

  const newStatus = RESULT_TO_STATUS[data.result];
  const { data: currentOrder } = await supabase.from("orders").select("status, call_attempts").eq("id", data.orderId).single();
  const cur = currentOrder as { status: string; call_attempts: number } | null;

  const updatePayload: Record<string, unknown> = {
    call_status: data.result,
    last_call_at: data.endedAt,
    call_attempts: (cur?.call_attempts ?? 0) + 1,
    status: newStatus,
  };

  if (data.notes && data.notes.trim()) {
    updatePayload.notes = data.notes.trim();
  }

  if (data.result === "confirmed") {
    updatePayload.confirmed_by = session.authId;
    updatePayload.confirmed_at = data.endedAt;
  }

  await supabase.from("orders").update(updatePayload as never).eq("id", data.orderId);

  await supabase.from("order_status_history").insert({
    order_id: data.orderId, from_status: cur?.status ?? null, to_status: newStatus,
    changed_by: session.authId, notes: `Appel: ${data.result} — durée: ${data.durationSeconds}s`,
  } as never);

  revalidatePath("/admin/call-center");
  revalidatePath("/admin/call-center/orders");
  revalidatePath(`/admin/orders/${data.orderId}`);

  if (data.result === "confirmed") {
    syncOrderToGoogleSheets(data.orderId, "confirmed").catch(console.error);
  }

  return { success: true };
}

export async function assignOrderToAgent(orderId: string, agentId: string | null) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();

  if (agentId) {
    const { data: agent } = await supabase.from("cc_agents").select("active").eq("id", agentId).maybeSingle();
    const a = agent as { active: boolean } | null;
    if (!a || !a.active) {
      return { success: false, error: "Agent invalide ou inactif." };
    }
  }

  const { error } = await supabase.from("orders").update({ assigned_to: agentId, assigned_at: agentId ? new Date().toISOString() : null } as never).eq("id", orderId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/call-center/queue");
  revalidatePath("/admin/call-center/orders");
  revalidatePath("/admin/orders");
  return { success: true };
}

export async function bulkAssignOrders(orderIds: string[], agentId: string) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();
  const { error } = await supabase.from("orders").update({ assigned_to: agentId } as never).in("id", orderIds);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/call-center/orders");
  return { success: true, count: orderIds.length };
}

export async function updateCallNotes(orderId: string, notes: string) {
  const session = await requireRole([...CC_ROLES]);
  const supabase = await createClient();

  if (session.role === "call_center_agent") {
    const { data: order } = await supabase.from("orders").select("assigned_to").eq("id", orderId).single();
    const o = order as { assigned_to: string | null } | null;
    if (!o || o.assigned_to !== session.authId) {
      return { success: false, error: "Non autorisé." };
    }
  }

  await supabase.from("orders").update({ notes: notes || null } as never).eq("id", orderId);
  revalidatePath(`/admin/call-center/orders/${orderId}`);
  return { success: true };
}

export async function scheduleCallback(data: { orderId: string; callbackAt: string; reason?: string }) {
  await requireRole([...CC_ROLES]);
  const supabase = await createClient();
  await supabase.from("orders").update({ callback_scheduled_at: data.callbackAt, callback_reason: data.reason ?? null, status: "no_answer" } as never).eq("id", data.orderId);
  revalidatePath("/admin/call-center/orders");
  return { success: true };
}

export async function setAgentAvailability(status: "available" | "in_call" | "away" | "offline") {
  const session = await requireRole([...CC_ROLES]);
  const supabase = await createClient();
  await supabase.from("cc_agents").update({ availability: status } as never).eq("id", session.authId);
  revalidatePath("/admin/call-center");
  return { success: true };
}

export async function updateAgentPresence(status: "available" | "in_call" | "away" | "offline") {
  const session = await requireRole([...CC_ROLES]);

  const { error } = await supabaseAdmin
    .from("cc_agents")
    .update({ availability: status, last_seen: new Date().toISOString() } as never)
    .eq("id", session.authId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function autoAssignOrders(): Promise<{ success: boolean; assigned: number; skipped: number }> {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();

  const { data: agents } = await supabase.from("cc_agents").select("id").eq("active", true);
  const agentList = (agents ?? []) as { id: string }[];
  if (!agentList.length) return { success: true, assigned: 0, skipped: 0 };

  const { data: unassigned } = await supabase.from("orders").select("id").is("assigned_to", null).in("status", ["new", "confirmed", "no_answer"]).order("created_at", { ascending: true }).limit(100);
  const orders = (unassigned ?? []) as { id: string }[];
  if (!orders.length) return { success: true, assigned: 0, skipped: 0 };

  const { data: counts } = await supabase.from("orders").select("assigned_to").in("assigned_to", agentList.map((a) => a.id)).in("status", ["new", "confirmed", "no_answer"]);

  const countMap = new Map<string, number>();
  for (const a of agentList) countMap.set(a.id, 0);
  for (const row of (counts ?? []) as { assigned_to: string }[]) {
    countMap.set(row.assigned_to, (countMap.get(row.assigned_to) ?? 0) + 1);
  }

  let assigned = 0;
  for (const order of orders) {
    const agent = [...countMap.entries()].sort((a, b) => a[1] - b[1])[0];
    if (!agent) break;

    await supabase.from("orders").update({ assigned_to: agent[0], assigned_at: new Date().toISOString(), call_status: "pending_call" } as never).eq("id", order.id);
    countMap.set(agent[0], (countMap.get(agent[0]) ?? 0) + 1);
    assigned++;
  }

  revalidatePath("/admin/call-center");
  return { success: true, assigned, skipped: orders.length - assigned };
}