/**
 * lib/call-center/queries.ts
 */
import { createClient } from "@/lib/supabase/server";
import type { AgentStats, CallCenterOrder, CallLog } from "@/types/call-center";

// ============================================================================
// Agent stats (SOURCE UNIQUE : call_center_agents JOIN users)
// ============================================================================
export async function getAgentStats(): Promise<AgentStats[]> {
  const supabase = await createClient();

  // Étape 1 : Récupérer les agents actifs depuis call_center_agents
  const { data: agents, error: agentsError } = await supabase
    .from("call_center_agents")
    .select("user_id, display_name, active, availability_status, commission_per_delivered")
    .eq("active", true)
    .order("display_name");

  if (agentsError) {
    console.error("[getAgentStats] Error fetching agents:", agentsError.message);
    return [];
  }

  if (!agents || agents.length === 0) {
    console.log("[getAgentStats] No active agents found in call_center_agents");
    return [];
  }

  // Étape 2 : Récupérer les infos users pour ces agents
  const userIds = agents.map((a: any) => a.user_id);

  const { data: users } = await supabase
    .from("users")
    .select("id, email, role, is_active")
    .in("id", userIds);

  // Construire un map user_id → user
  const userMap: Record<string, any> = {};
  for (const u of (users ?? [])) {
    userMap[u.id] = u;
  }

  // Étape 3 : Récupérer les commandes et call logs en parallèle
  const [{ data: orders }, { data: callLogs }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, assigned_to, status, call_status")
      .in("assigned_to", userIds),
    supabase
      .from("call_logs")
      .select("agent_id, disposition, duration_seconds")
      .in("agent_id", userIds),
  ]);

  const orderRows = (orders ?? []) as { id: string; assigned_to: string; status: string; call_status: string | null }[];
  const logRows = (callLogs ?? []) as { agent_id: string; disposition: string; duration_seconds: number | null }[];

  // Étape 4 : Construire le résultat
  return (agents as any[])
    .map((agent) => {
      const user = userMap[agent.user_id];
      if (!user) return null;

      const agentOrders = orderRows.filter((o) => o.assigned_to === agent.user_id);
      const agentLogs = logRows.filter((l) => l.agent_id === agent.user_id);

      const confirmed = agentLogs.filter((l) => l.disposition === "confirmed").length;
      const refused = agentLogs.filter((l) => l.disposition === "refused").length;
      const noAnswer = agentLogs.filter((l) => l.disposition === "no_answer").length;
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
      const confirmationRate = callsMade === 0 ? 0 : Math.round((confirmed / callsMade) * 100);
      const fakeRate = callsMade === 0 ? 0 : Math.round((fakeOrders / callsMade) * 100);

      const deliveredPaid = agentOrders.filter((o) =>
        ["paid", "delivered"].includes(o.status)
      ).length;
      const commission = deliveredPaid * (agent.commission_per_delivered ?? 3);

      return {
        agent_id: user.id,
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
        commission_mad: commission,
        confirmation_rate: confirmationRate,
        fake_rate: fakeRate,
        avg_duration_sec: avgDur,
      } as AgentStats;
    })
    .filter(Boolean) as AgentStats[];
}

// ============================================================================
// Orders for call center list
// ============================================================================
export async function getCallCenterOrders(
  options: {
    agentId?: string;
    unassigned?: boolean;
    callStatus?: string;
    isAgent?: boolean;
    authId?: string;
  } = {}
): Promise<CallCenterOrder[]> {
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(`
      id, order_number, customer_name, customer_phone,
      customer_city, customer_address, status, call_status,
      call_attempts, last_call_at, assigned_to, notes, created_at
    `)
    .not("status", "in", '("cancelled","returned","paid","delivered")')
    .order("created_at", { ascending: false })
    .limit(200);

  if (options.isAgent && options.authId) {
    query = query.eq("assigned_to", options.authId);
  } else {
    if (options.agentId)    query = query.eq("assigned_to", options.agentId);
    if (options.unassigned) query = query.is("assigned_to", null);
    if (options.callStatus) query = query.eq("call_status", options.callStatus);
  }

  const { data, error } = await query;
  if (error) { console.error("[cc] getCallCenterOrders:", error.message); return []; }

  const orderRows = (data ?? []) as unknown as CallCenterOrder[];
  if (orderRows.length === 0) return [];

  const agentIds = [...new Set(orderRows.map((o) => o.assigned_to).filter(Boolean))] as string[];
  const agentMap: Record<string, string> = {};
  if (agentIds.length > 0) {
    const { data: agentUsers } = await supabase
      .from("users").select("id, full_name").in("id", agentIds);
    for (const a of (agentUsers ?? []) as { id: string; full_name: string }[]) {
      agentMap[a.id] = a.full_name;
    }
  }

  const orderIds = orderRows.map((o) => o.id);
  const { data: items } = await supabase
    .from("order_items")
    .select("order_id, product_name, product_sku")
    .in("order_id", orderIds);

  const itemMap: Record<string, { product_name: string; product_sku: string }> = {};
  for (const item of (items ?? []) as { order_id: string; product_name: string; product_sku: string }[]) {
    if (!itemMap[item.order_id]) itemMap[item.order_id] = item;
  }

  return orderRows.map((o) => ({
    ...o,
    agent_name:         o.assigned_to ? (agentMap[o.assigned_to] ?? null) : null,
    first_product_name: itemMap[o.id]?.product_name ?? null,
    first_product_sku:  itemMap[o.id]?.product_sku  ?? null,
  }));
}

// ============================================================================
// Single order for agent view
// ============================================================================
export async function getCallCenterOrderDetail(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(`
      id, order_number, customer_name, customer_phone,
      customer_city, customer_address, customer_region,
      status, call_status, call_attempts, last_call_at,
      assigned_to, notes, created_at
    `)
    .eq("id", id)
    .single();

  if (error || !data) return null;
  const order = data as unknown as CallCenterOrder;

  const { data: items } = await supabase
    .from("order_items")
    .select("id, product_name, product_sku, quantity")
    .eq("order_id", id);

  const { data: logs } = await supabase
    .from("call_logs")
    .select("id, agent_id, disposition, duration_seconds, notes, call_started_at, created_at")
    .eq("order_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  return {
    order,
    items: (items ?? []) as unknown as { id: string; product_name: string; product_sku: string; quantity: number }[],
    logs:  (logs  ?? []) as unknown as CallLog[],
  };
}

// ============================================================================
// Dashboard summary
// ============================================================================
export async function getCallCenterSummary() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select("id, assigned_to, call_status, status")
    .not("status", "in", '("cancelled","returned","paid","delivered")');

  const rows = (data ?? []) as { id: string; assigned_to: string | null; call_status: string | null; status: string }[];

  const total      = rows.length;
  const assigned   = rows.filter((o) => o.assigned_to).length;
  const unassigned = rows.filter((o) => !o.assigned_to).length;
  const confirmed  = rows.filter((o) => o.call_status === "confirmed").length;
  const refused    = rows.filter((o) => o.call_status === "refused").length;
  const no_answer  = rows.filter((o) => o.call_status === "no_answer").length;
  const rate       = assigned === 0 ? 0 : Math.round((confirmed / assigned) * 100);

  return { total, assigned, unassigned, confirmed, refused, no_answer, confirmation_rate: rate };
}