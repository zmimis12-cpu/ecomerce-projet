"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { normalizePay, type AgentPay } from "@/lib/call-center/pay-shared";

/** Enregistre la rémunération d'un agent (fiche agent). userId = users.id = orders.assigned_to. */
export async function saveAgentPay(userId: string, input: AgentPay & { since?: string }): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["super_admin", "admin"]);
  const pay = normalizePay(input);
  const since = input.since && /^\d{4}-\d{2}-\d{2}$/.test(input.since) ? input.since + "T00:00:00Z" : undefined;

  const { data: row } = await supabaseAdmin.from("call_center_agents" as never)
    .select("id, metadata").eq("user_id", userId).maybeSingle();
  const cols = {
    salary_type: pay.mode === "hybrid" ? "hybrid" : pay.mode === "salary" ? "fixed" : "commission",
    fixed_salary_mad: pay.salary,
    commission_per_delivered: pay.amount,
  };

  let error: { message: string } | null = null;
  if (row) {
    const r = row as { id: string; metadata: Record<string, unknown> | null };
    const prev = (r.metadata?.pay ?? {}) as { since?: string };
    const metadata = { ...(r.metadata ?? {}), pay: { ...pay, since: since ?? prev.since } };
    ({ error } = await supabaseAdmin.from("call_center_agents" as never)
      .update({ ...cols, metadata } as never).eq("id", r.id));
  } else {
    const { data: u } = await supabaseAdmin.from("users").select("full_name").eq("id", userId).maybeSingle();
    ({ error } = await supabaseAdmin.from("call_center_agents" as never).insert({
      user_id: userId, display_name: (u as { full_name?: string } | null)?.full_name ?? "Agent", active: true,
      ...cols, metadata: { pay: { ...pay, since: since ?? new Date().toISOString() } },
    } as never));
  }
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/call-center/agents/${userId}`);
  revalidatePath("/admin/call-center/commissions");
  revalidatePath("/admin");
  return { ok: true };
}
