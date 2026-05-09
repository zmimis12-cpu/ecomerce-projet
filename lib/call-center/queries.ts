/**
 * lib/call-center/queries.ts
 */
import { createClient } from "@/lib/supabase/server";
import type { AgentStats, CallCenterOrder, CallLog } from "@/types/call-center";

// ─── Agent stats ───────────────────────────────────────────────────────────────
export async function getAgentStats(): Promise<AgentStats[]> {
  const supabase = await createClient();

  const { data: agents, error: agentsError } = await supabase
    .from("call_center_agents")
    .select(`
      user_id,
      display_name,
      active,
      availability_status,
      commission_per_delivered,
      users:users!inner (
        id,
        email,
        role,
        is_active
      )
    `)
    .eq("active", true)
    .order("display_name");

  if (agentsError || !agents || agents.length === 0) return [];

  type AgentRow = {
    user_id: string;
    display_name: string | null;
    active: boolean;
    availability_status: string | null;
    commission_per_delivered: number;
    users: {
      id: string;
      email: string;
      role: string;
      is_active: boolean;
    } | null;
  };

  const agentRows = agents as unknown as AgentRow[];
  const userIds = agentRows.map((a) => a.user_id);

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

  type OrderRow = { id: string; assigned_to: string; status: string; call_status: string | null };
  type LogRow = { agent_id: string; disposition: string; duration_seconds: number | null };

  const orderRows = (orders ?? []) as OrderRow[];
  const logRows = (callLogs ?? []) as LogRow[];

  return agentRows
    .map((agent) => {
      const user = agent.users;
      if (!user) return null as unknown as AgentStats;

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
      };
    })
    .filter(Boolean);
}