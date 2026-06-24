"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";

const CC_ROLES = ["super_admin", "admin", "manager", "call_center_agent"] as const;

async function getCommissionPerOrder(): Promise<number> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "cc_commission_per_order").maybeSingle();
  return Number((data as { value?: string } | null)?.value ?? 3);
}

export async function getMyAssignedOrders() {
  const session = await requireRole([...CC_ROLES]);
  const supabase = await createClient();
  if (session.role !== "call_center_agent") return [];

  const { data } = await supabase
    .from("orders")
    .select(`id, order_number, customer_name, customer_phone, customer_city, total_amount_mad, status, call_status, assigned_at, callback_scheduled_at, callback_reason, order_items(product_name, quantity)`)
    .eq("assigned_to", session.authId)
    .in("status", ["new", "confirmed", "no_answer", "pending"])
    .order("created_at", { ascending: false })
    .limit(100);

  return (data ?? []) as {
    id: string; order_number: string; customer_name: string; customer_phone: string; customer_city: string;
    total_amount_mad: number; status: string; call_status: string | null;
    assigned_at: string | null; callback_scheduled_at: string | null; callback_reason: string | null;
    order_items: { product_name: string; quantity: number }[];
  }[];
}

export async function getMyStats() {
  const session = await requireRole([...CC_ROLES]);
  const supabase = await createClient();
  const agentId = session.authId;

  const { data: logs } = await supabase.from("call_logs").select("disposition, duration_seconds").eq("agent_id", agentId);
  const logRows = (logs ?? []) as { disposition: string; duration_seconds: number | null }[];

  const callsMade = logRows.length;
  const confirmed = logRows.filter((l) => l.disposition === "confirmed").length;
  const refused = logRows.filter((l) => l.disposition === "refused").length;
  const noAnswer = logRows.filter((l) => l.disposition === "no_answer").length;
  const fakeOrders = logRows.filter((l) => l.disposition === "fake_order").length;
  const durations = logRows.map((l) => l.duration_seconds).filter((d): d is number => d !== null);
  const avgDuration = durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0;

  const { data: assignedOrders } = await supabase.from("orders").select("status, total_amount_mad").eq("assigned_to", agentId);
  const ordRows = (assignedOrders ?? []) as { status: string; total_amount_mad: number }[];
  const deliveredPaid = ordRows.filter((o) => o.status === "paid").length;
  const delivered = ordRows.filter((o) => ["delivered", "paid"].includes(o.status)).length;
  const returned = ordRows.filter((o) => o.status === "returned").length;

  const commission = await getCommissionPerOrder();
  const commissionEarned = deliveredPaid * commission;
  const confirmRate = callsMade > 0 ? Math.round((confirmed / callsMade) * 100) : 0;
  const deliveryRate = confirmed > 0 ? Math.round((delivered / confirmed) * 100) : 0;

  return { callsMade, confirmed, refused, noAnswer, fakeOrders, avgDuration, deliveredPaid, delivered, returned, commissionEarned, confirmRate, deliveryRate, totalAssigned: ordRows.length };
}

export async function getMyCommissions() {
  const session = await requireRole([...CC_ROLES]);
  const agentId = session.authId;

  const { data: deliveredOrders } = await supabaseAdmin.from("orders").select("id, order_number, total_amount_mad, updated_at").eq("assigned_to", agentId).eq("status", "paid");
  const delivered = (deliveredOrders ?? []) as { id: string; order_number: string; total_amount_mad: number; updated_at: string }[];
  const COMMISSION_PER_ORDER = await getCommissionPerOrder();
  const totalEarned = delivered.length * COMMISSION_PER_ORDER;

  const { data: payments } = await supabaseAdmin.from("call_center_agent_payments").select("*").eq("agent_id", agentId).order("period_start", { ascending: false });
  const paymentRows = (payments ?? []) as { id: string; period_start: string; period_end: string; delivered_paid_count: number; gross_amount: number; paid_amount: number; remaining_amount: number; status: string; paid_at: string | null; notes: string | null }[];
  const totalPaid = paymentRows.reduce((s, p) => s + (p.paid_amount ?? 0), 0);
  const totalRemaining = totalEarned - totalPaid;

  return { commissionPerOrder: COMMISSION_PER_ORDER, totalDeliveredPaid: delivered.length, totalEarned, totalPaid, totalRemaining, payments: paymentRows, recentOrders: delivered.slice(0, 20) };
}

export async function getMyCallbacks() {
  const session = await requireRole([...CC_ROLES]);
  const supabase = await createClient();

  const { data } = await supabase.from("orders").select("id, order_number, customer_name, customer_phone, callback_scheduled_at, callback_reason, total_amount_mad").eq("assigned_to", session.authId).not("callback_scheduled_at", "is", null).lte("callback_scheduled_at", new Date(Date.now() + 86400000).toISOString()).order("callback_scheduled_at", { ascending: true });
  return (data ?? []) as { id: string; order_number: string; customer_name: string; customer_phone: string; callback_scheduled_at: string; callback_reason: string | null; total_amount_mad: number }[];
}

export async function recordAgentPayment(params: { agentId: string; periodStart: string; periodEnd: string; paidAmount: number; notes?: string }): Promise<{ success: boolean; error?: string }> {
  const session = await requireRole(["super_admin", "admin", "manager"]);

  const COMMISSION_PER_ORDER = await getCommissionPerOrder();
  const { data: orders } = await supabaseAdmin.from("orders").select("id").eq("assigned_to", params.agentId).eq("status", "paid").gte("updated_at", `${params.periodStart}T00:00:00`).lte("updated_at", `${params.periodEnd}T23:59:59`);
  const count = (orders ?? []).length;
  const gross = count * COMMISSION_PER_ORDER;
  const isFullyPaid = params.paidAmount >= gross;

  const { error } = await supabaseAdmin.from("call_center_agent_payments").insert({
    agent_id: params.agentId, period_start: params.periodStart, period_end: params.periodEnd,
    delivered_paid_count: count, commission_per_order: COMMISSION_PER_ORDER,
    gross_amount: gross, paid_amount: params.paidAmount,
    status: isFullyPaid ? "paid" : params.paidAmount > 0 ? "partially_paid" : "unpaid",
    paid_at: params.paidAmount > 0 ? new Date().toISOString() : null,
    paid_by: session.authId, notes: params.notes ?? null,
  } as never);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getAllAgentsCommissions() {
  await requireRole(["super_admin", "admin", "manager"]);

  const { data: agents } = await supabaseAdmin
    .from("cc_agents")
    .select("id, full_name, email, active, availability, commission")
    .eq("active", true)
    .order("full_name");

  if (!agents || agents.length === 0) return [];

  type AgentRow = { id: string; full_name: string; email: string | null; availability: string | null; commission: number };
  const agentRows = agents as unknown as AgentRow[];
  const results: { id: string; full_name: string; email: string; availability_status: string; deliveredPaid: number; earned: number; totalPaid: number; remaining: number }[] = [];

  for (const agent of agentRows) {
    const { data: orders } = await supabaseAdmin.from("orders").select("id").eq("assigned_to", agent.id).eq("status", "paid");
    const deliveredPaid = (orders ?? []).length;
    const earned = deliveredPaid * (agent.commission ?? 3);
    const { data: payments } = await supabaseAdmin.from("call_center_agent_payments").select("paid_amount").eq("agent_id", agent.id);
    const totalPaid = ((payments ?? []) as { paid_amount: number }[]).reduce((s, p) => s + (p.paid_amount ?? 0), 0);

    results.push({
      id: agent.id,
      full_name: agent.full_name,
      email: agent.email ?? "",
      availability_status: agent.availability ?? "offline",
      deliveredPaid,
      earned,
      totalPaid,
      remaining: earned - totalPaid,
    });
  }

  return results;
}