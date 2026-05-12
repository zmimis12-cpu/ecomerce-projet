import { createClient } from "@/lib/supabase/server";
import type { AgentStats, CallCenterOrder, CallLog } from "@/types/call-center";

export async function getAgentStats(): Promise<AgentStats[]> {
  const supabase = await createClient();

  const { data: agents, error: agentsError } = await supabase
    .from("cc_agents")
    .select("id, full_name, email, active, availability, commission")
    .eq("active", true)
    .order("full_name");

  if (agentsError || !agents || agents.length === 0) return [];

  const agentRows = agents as unknown as {
    id: string; full_name: string; email: string | null;
    active: boolean; availability: string | null; commission: number;
  }[];

  const [{ data: orders }, { data: callLogs }] = await Promise.all([
    supabase.from("orders").select("assigned_to, status"),
    supabase.from("call_logs").select("agent_id, disposition, duration_seconds"),
  ]);

  const orderRows = (orders ?? []) as { assigned_to: string; status: string }[];
  const logRows = (callLogs ?? []) as { agent_id: string; disposition: string; duration_seconds: number | null }[];

  return agentRows.map((agent): AgentStats => {
    const agentOrders = orderRows.filter((o) => o.assigned_to === agent.id);
    const agentLogs = logRows.filter((l) => l.agent_id === agent.id);

    const confirmed = agentLogs.filter((l) => l.disposition === "confirmed").length;
    const refused = agentLogs.filter((l) => l.disposition === "refused").length;
    const noAnswer = agentLogs.filter((l) => l.disposition === "no_answer").length;
    const fakeOrders = agentLogs.filter((l) => l.disposition === "fake_order").length;
    const duplicates = agentLogs.filter((l) => l.disposition === "duplicate").length;

    const durations = agentLogs.map((l) => l.duration_seconds).filter((d): d is number => d !== null);
    const avgDur = durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null;

    const callsMade = agentLogs.length;
    const deliveredPaid = agentOrders.filter((o) => ["paid", "delivered"].includes(o.status)).length;
    const commissionAmount = deliveredPaid * (agent.commission ?? 3);

    return {
      agent_id: agent.id,
      full_name: agent.full_name,
      email: agent.email ?? "",
      role: "call_center_agent",
      total_assigned: agentOrders.length,
      calls_made: callsMade,
      confirmed,
      refused,
      no_answer: noAnswer,
      fake_orders: fakeOrders,
      duplicates,
      delivered_paid: deliveredPaid,
      commission_mad: commissionAmount,
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
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select("id, order_number, customer_name, customer_phone, customer_city, customer_address, status, call_status, call_attempts, last_call_at, assigned_to, notes, created_at")
    .not("status", "in", '("cancelled","returned","paid","delivered")')
    .order("created_at", { ascending: false })
    .limit(200);

  if (options.isAgent && options.authId) query = query.eq("assigned_to", options.authId);
  else {
    if (options.agentId) query = query.eq("assigned_to", options.agentId);
    if (options.unassigned) query = query.is("assigned_to", null);
    if (options.callStatus) query = query.eq("call_status", options.callStatus);
  }

  const { data, error } = await query;
  if (error) return [];

  const orderRows = (data ?? []) as unknown as CallCenterOrder[];
  if (!orderRows.length) return [];

  const ids = [...new Set(orderRows.map((o) => o.assigned_to).filter(Boolean))] as string[];
  const agentMap: Record<string, string> = {};
  if (ids.length) {
    const { data: au } = await supabase.from("cc_agents").select("id, full_name").in("id", ids);
    for (const a of (au ?? []) as { id: string; full_name: string }[]) agentMap[a.id] = a.full_name;
  }

  const orderIds = orderRows.map((o) => o.id);
  const { data: items } = await supabase.from("order_items").select("order_id, product_name, product_sku").in("order_id", orderIds);
  const itemMap: Record<string, { product_name: string; product_sku: string }> = {};
  for (const item of (items ?? []) as { order_id: string; product_name: string; product_sku: string }[]) {
    if (!itemMap[item.order_id]) itemMap[item.order_id] = item;
  }

  return orderRows.map((o) => ({
    ...o,
    agent_name: o.assigned_to ? (agentMap[o.assigned_to] ?? null) : null,
    first_product_name: itemMap[o.id]?.product_name ?? null,
    first_product_sku: itemMap[o.id]?.product_sku ?? null,
  }));
}

export async function getCallCenterOrderDetail(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.from("orders")
    .select("id, order_number, customer_name, customer_phone, customer_city, customer_address, customer_region, status, call_status, call_attempts, last_call_at, assigned_to, notes, created_at")
    .eq("id", id).single();
  if (error || !data) return null;

  const order = data as unknown as CallCenterOrder;
  const [{ data: items }, { data: logs }] = await Promise.all([
    supabase.from("order_items").select("id, product_name, product_sku, quantity").eq("order_id", id),
    supabase.from("call_logs").select("id, agent_id, disposition, duration_seconds, notes, call_started_at, created_at").eq("order_id", id).order("created_at", { ascending: false }).limit(10),
  ]);

  return { order, items: (items ?? []) as { id: string; product_name: string; product_sku: string; quantity: number }[], logs: (logs ?? []) as unknown as CallLog[] };
}

export async function getCallCenterSummary() {
  const supabase = await createClient();

  const { data } = await supabase.from("orders").select("id, assigned_to, call_status, status").not("status", "in", '("cancelled","returned","paid","delivered")');
  const rows = (data ?? []) as { id: string; assigned_to: string | null; call_status: string | null; status: string }[];

  const total = rows.length;
  const assigned = rows.filter((o) => o.assigned_to).length;
  const unassigned = rows.filter((o) => !o.assigned_to).length;
  const confirmed = rows.filter((o) => o.call_status === "confirmed").length;
  const refused = rows.filter((o) => o.call_status === "refused").length;
  const no_answer = rows.filter((o) => o.call_status === "no_answer").length;
  const rate = assigned === 0 ? 0 : Math.round((confirmed / assigned) * 100);

  return { total, assigned, unassigned, confirmed, refused, no_answer, confirmation_rate: rate };
}