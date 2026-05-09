import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AgentStats, CallCenterOrder, CallLog } from "@/types/call-center";

export async function getAgentStats(): Promise<AgentStats[]> {
  const { data: agents, error: agentsError } = await supabaseAdmin
    .from("call_center_agents")
    .select("user_id, display_name, active, availability_status, commission_per_delivered")
    .eq("active", true)
    .order("display_name");

  if (agentsError) {
    console.error("[getAgentStats] call_center_agents error:", agentsError.message);
    return [];
  }

  if (!agents || agents.length === 0) {
    console.log("[getAgentStats] No agents in call_center_agents");
    return [];
  }

  const userIds: string[] = [];
  const agentMap = new Map<string, { display_name: string | null; commission: number }>();

  for (const row of agents) {
    const a = row as { user_id: string; display_name: string | null; commission_per_delivered: number };
    userIds.push(a.user_id);
    agentMap.set(a.user_id, { display_name: a.display_name, commission: a.commission_per_delivered ?? 3 });
  }

  const { data: users, error: usersError } = await supabaseAdmin
    .from("users")
    .select("id, email, role")
    .in("id", userIds);

  if (usersError) {
    console.error("[getAgentStats] users error:", usersError.message);
    return [];
  }

  if (!users || users.length === 0) {
    console.log("[getAgentStats] No users found for these agent IDs");
    return [];
  }

  const userMap = new Map<string, { email: string; role: string }>();
  for (const u of users as { id: string; email: string; role: string }[]) {
    userMap.set(u.id, { email: u.email, role: u.role });
  }

  const [{ data: orders }, { data: callLogs }] = await Promise.all([
    supabaseAdmin.from("orders").select("assigned_to, status").in("assigned_to", userIds),
    supabaseAdmin.from("call_logs").select("agent_id, disposition, duration_seconds").in("agent_id", userIds),
  ]);

  const orderRows = (orders ?? []) as { assigned_to: string; status: string }[];
  const logRows = (callLogs ?? []) as { agent_id: string; disposition: string; duration_seconds: number | null }[];

  const result: AgentStats[] = [];

  for (const userId of userIds) {
    const agent = agentMap.get(userId);
    const user = userMap.get(userId);
    if (!agent || !user) continue;

    const agentOrders = orderRows.filter((o) => o.assigned_to === userId);
    const agentLogs = logRows.filter((l) => l.agent_id === userId);

    const confirmed = agentLogs.filter((l) => l.disposition === "confirmed").length;
    const refused = agentLogs.filter((l) => l.disposition === "refused").length;
    const noAnswer = agentLogs.filter((l) => l.disposition === "no_answer").length;
    const fakeOrders = agentLogs.filter((l) => l.disposition === "fake_order").length;
    const duplicates = agentLogs.filter((l) => l.disposition === "duplicate").length;

    const durations = agentLogs.map((l) => l.duration_seconds).filter((d): d is number => d !== null);
    const avgDur = durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null;

    const callsMade = agentLogs.length;
    const deliveredPaid = agentOrders.filter((o) => ["paid", "delivered"].includes(o.status)).length;

    result.push({
      agent_id: userId,
      full_name: agent.display_name ?? user.email,
      email: user.email,
      role: user.role,
      total_assigned: agentOrders.length,
      calls_made: callsMade,
      confirmed,
      refused,
      no_answer: noAnswer,
      fake_orders: fakeOrders,
      duplicates,
      delivered_paid: deliveredPaid,
      commission_mad: deliveredPaid * agent.commission,
      confirmation_rate: callsMade === 0 ? 0 : Math.round((confirmed / callsMade) * 100),
      fake_rate: callsMade === 0 ? 0 : Math.round((fakeOrders / callsMade) * 100),
      avg_duration_sec: avgDur,
    });
  }

  return result;
}

export async function getCallCenterOrders(
  options: {
    agentId?: string;
    unassigned?: boolean;
    callStatus?: string;
    isAgent?: boolean;
    authId?: string;
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

  const agentIds = [...new Set(orderRows.map((o) => o.assigned_to).filter(Boolean))] as string[];
  const agentMap: Record<string, string> = {};
  if (agentIds.length) {
    const { data: au } = await supabase.from("users").select("id, full_name").in("id", agentIds);
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
  const { createClient } = await import("@/lib/supabase/server");
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
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data } = await supabase.from("orders").select("id, assigned_to, call_status, status").not("status", "in", '("cancelled","returned","paid","delivered")');
  const rows = (data ?? []) as { id: string; assigned_to: string | null; call_status: string | null; status: string }[];

  return {
    total: rows.length,
    assigned: rows.filter((o) => o.assigned_to).length,
    unassigned: rows.filter((o) => !o.assigned_to).length,
    confirmed: rows.filter((o) => o.call_status === "confirmed").length,
    refused: rows.filter((o) => o.call_status === "refused").length,
    no_answer: rows.filter((o) => o.call_status === "no_answer").length,
    confirmation_rate: rows.filter((o) => o.assigned_to).length === 0 ? 0 : Math.round((rows.filter((o) => o.call_status === "confirmed").length / rows.filter((o) => o.assigned_to).length) * 100),
  };
}