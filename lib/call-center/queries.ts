import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AgentStats, CallCenterOrder, CallLog } from "@/types/call-center";

type UserRow = { id: string; full_name: string; email: string; availability_status: string | null; last_seen_at: string | null };
type OrderRow = { assigned_to: string; status: string };
type LogRow = { agent_id: string; disposition: string; duration_seconds: number | null };

const COMMISSION_PER_ORDER = 3;

export async function getAgentStats(): Promise<AgentStats[]> {
  // Same source as Settings → Users: public.users
  const { data: agents } = await supabaseAdmin
    .from("users")
    .select("id, full_name, email, availability_status, last_seen_at")
    .eq("role", "call_center_agent")
    .eq("is_active", true)
    .order("full_name");

  if (!agents || agents.length === 0) return [];

  const rows = agents as unknown as UserRow[];
  const userIds = rows.map((a) => a.id);

  const [{ data: orders }, { data: callLogs }] = await Promise.all([
    supabaseAdmin.from("orders").select("assigned_to, status").in("assigned_to", userIds),
    supabaseAdmin.from("call_logs").select("agent_id, disposition, duration_seconds").in("agent_id", userIds),
  ]);

  const orderRows = (orders ?? []) as unknown as OrderRow[];
  const logRows   = (callLogs ?? []) as unknown as LogRow[];

  return rows.map((a): AgentStats => {
    const agentOrders = orderRows.filter((o) => o.assigned_to === a.id);
    const agentLogs   = logRows.filter((l) => l.agent_id === a.id);
    const confirmed   = agentLogs.filter((l) => l.disposition === "confirmed").length;
    const refused     = agentLogs.filter((l) => l.disposition === "refused").length;
    const noAnswer    = agentLogs.filter((l) => l.disposition === "no_answer").length;
    const fakeOrders = agentLogs.filter((l) => l.disposition === "fake_order").length;
    const duplicates = agentLogs.filter((l) => l.disposition === "duplicate").length;

    const durations = agentLogs
      .map((l) => l.duration_seconds)
      .filter((d): d is number => d !== null);
    const avgDur =
      durations.length > 0
        ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
        : null;

    const callsMade = agentLogs.length;
    const deliveredPaid = agentOrders.filter((o) =>
      ["paid", "delivered"].includes(o.status)
    ).length;

    return {
      agent_id: a.id,
      full_name: a.full_name,
      email: a.email,
      role: "call_center_agent",
availability_status: (() => {
        if (!a.last_seen_at) return "offline";
        const diff = Date.now() - new Date(a.last_seen_at).getTime();
        return diff < 2 * 60 * 1000 ? (a.availability_status ?? "available") : "offline";
      })(),
      last_seen_at: a.last_seen_at,
      total_assigned: agentOrders.length,
      calls_made: callsMade,
      confirmed,
      refused,
      no_answer: noAnswer,
      fake_orders: fakeOrders,
      duplicates,
      delivered_paid: deliveredPaid,
      commission_mad: deliveredPaid * COMMISSION_PER_ORDER,
      confirmation_rate: callsMade === 0 ? 0 : Math.round((confirmed / callsMade) * 100),
      fake_rate: callsMade === 0 ? 0 : Math.round((fakeOrders / callsMade) * 100),
      avg_duration_sec: avgDur,
    };
  });
}

export async function getCallCenterOrders(
  options: {
    agentId?: string; unassigned?: boolean; callStatus?: string;
    isAgent?: boolean; authId?: string;
  } = {}
): Promise<CallCenterOrder[]> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select("id, order_number, customer_name, customer_phone, customer_city, customer_address, status, call_status, call_attempts, last_call_at, assigned_to, notes, created_at")
    .not("status", "in", '("cancelled","returned","paid","delivered")')
    .order("created_at", { ascending: false })
    .limit(200);

  if (options.isAgent && options.authId) {
    query = query.eq("assigned_to", options.authId);
  } else {
    if (options.agentId) query = query.eq("assigned_to", options.agentId);
    if (options.unassigned) query = query.is("assigned_to", null);
    if (options.callStatus) query = query.eq("call_status", options.callStatus);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const rows = data as unknown as CallCenterOrder[];
  if (!rows.length) return [];

  const ids = [...new Set(rows.map((o) => o.assigned_to).filter(Boolean))] as string[];
  const agentMap: Record<string, string> = {};
  if (ids.length) {
    const { data: au } = await supabaseAdmin
      .from("users")
      .select("id, full_name")
      .in("id", ids);
    for (const a of (au ?? []) as unknown as { id: string; full_name: string }[]) {
      agentMap[a.id] = a.full_name ?? "";
    }
  }

  const orderIds = rows.map((o) => o.id);
  const { data: items } = await supabase
    .from("order_items")
    .select("order_id, product_name, product_sku")
    .in("order_id", orderIds);

  const itemMap: Record<string, { product_name: string; product_sku: string }> = {};
  for (const it of (items ?? []) as unknown as { order_id: string; product_name: string; product_sku: string }[]) {
    if (!itemMap[it.order_id]) itemMap[it.order_id] = it;
  }

  return rows.map((o) => ({
    ...o,
    agent_name: o.assigned_to ? (agentMap[o.assigned_to] ?? null) : null,
    first_product_name: itemMap[o.id]?.product_name ?? null,
    first_product_sku: itemMap[o.id]?.product_sku ?? null,
  }));
}

export async function getCallCenterOrderDetail(id: string) {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, customer_phone, customer_city, customer_address, customer_region, status, call_status, call_attempts, last_call_at, assigned_to, notes, created_at")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  const order = data as unknown as CallCenterOrder;

  const [{ data: items }, { data: logs }] = await Promise.all([
    supabase.from("order_items").select("id, product_name, product_sku, quantity").eq("order_id", id),
    supabase.from("call_logs").select("id, agent_id, disposition, duration_seconds, notes, call_started_at, created_at").eq("order_id", id).order("created_at", { ascending: false }).limit(10),
  ]);

  return {
    order,
    items: (items ?? []) as unknown as { id: string; product_name: string; product_sku: string; quantity: number }[],
    logs: (logs ?? []) as unknown as CallLog[],
  };
}

export async function getCallCenterSummary() {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select("id, assigned_to, call_status, status")
    .not("status", "in", '("cancelled","returned","paid","delivered")');

  const rows = (data ?? []) as unknown as {
    id: string; assigned_to: string | null;
    call_status: string | null; status: string;
  }[];

  const assigned = rows.filter((o) => o.assigned_to).length;

  return {
    total: rows.length,
    assigned,
    unassigned: rows.filter((o) => !o.assigned_to).length,
    confirmed: rows.filter((o) => o.call_status === "confirmed").length,
    refused: rows.filter((o) => o.call_status === "refused").length,
    no_answer: rows.filter((o) => o.call_status === "no_answer").length,
    confirmation_rate: assigned === 0 ? 0 : Math.round(
      (rows.filter((o) => o.call_status === "confirmed").length / assigned) * 100
    ),
  };
}