/**
 * lib/orders/auto-assign.ts
 * Auto-assign new orders to the least-busy available call center agent.
 * Strategy: agent with fewest open (non-terminal) assigned orders.
 * Server-side only — uses supabaseAdmin to bypass RLS.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

const TERMINAL_STATUSES = ["confirmed", "refused", "delivered", "paid", "cancelled", "returned"];

/**
 * Returns the ID of the best available agent, or null if none found.
 * "Available" = role call_center_agent + is_active = true.
 * "Least busy" = fewest orders with non-terminal status assigned to them.
 */
export async function findAvailableAgent(): Promise<string | null> {
  // Get all active call center agents
  const { data: agents } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("role", "call_center_agent")
    .eq("is_active", true);

  if (!agents || agents.length === 0) return null;

  const agentList = agents as { id: string }[];
  const agentIds  = agentList.map((a) => a.id);

  // Count open orders per agent
  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("assigned_to")
    .in("assigned_to", agentIds)
    .not("status", "in", `(${TERMINAL_STATUSES.map((s) => `"${s}"`).join(",")})`);

  // Build count map
  const counts: Record<string, number> = {};
  for (const id of agentIds) counts[id] = 0;
  for (const o of (orders ?? []) as { assigned_to: string }[]) {
    if (counts[o.assigned_to] !== undefined) counts[o.assigned_to]++;
  }

  // Return agent with lowest count
  let bestAgent: string | null = null;
  let bestCount = Infinity;
  for (const [id, count] of Object.entries(counts)) {
    if (count < bestCount) { bestCount = count; bestAgent = id; }
  }

  return bestAgent;
}
