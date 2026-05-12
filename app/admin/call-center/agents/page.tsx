import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AgentsTable } from "@/components/call-center/agents-table";
import type { AgentStats } from "@/types/call-center";

export const metadata: Metadata = { title: "Agents — Call Center" };
export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  await requireRole(["super_admin", "admin", "manager"]);

  const { data, error } = await supabaseAdmin.rpc("get_cc_agents");

  const agents: AgentStats[] = (data ?? []).map((row: Record<string, unknown>) => ({
    agent_id: String(row.id ?? ""),
    full_name: String(row.full_name ?? ""),
    email: String(row.email ?? ""),
    role: "call_center_agent",
    total_assigned: 0,
    calls_made: 0,
    confirmed: 0,
    refused: 0,
    no_answer: 0,
    fake_orders: 0,
    duplicates: 0,
    delivered_paid: 0,
    commission_mad: 0,
    confirmation_rate: 0,
    fake_rate: 0,
    avg_duration_sec: null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/call-center"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" /> Call Center
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">Agents</span>
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Agents Call Center</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Performance et statistiques des agents.
        </p>
      </div>

      <div className="rounded-xl border border-red-300 bg-red-50 p-4">
        <p className="text-sm font-bold text-red-700">🔍 DEBUG</p>
        <p className="text-xs text-red-600">Error: {error?.message ?? "none"}</p>
        <p className="text-xs text-red-600">Count: {agents.length}</p>
        {agents.length > 0 && (
          <ul className="list-disc pl-5 mt-2 text-xs text-red-600">
            {agents.map((a) => (
              <li key={a.agent_id}>{a.full_name} ({a.email})</li>
            ))}
          </ul>
        )}
      </div>

      <AgentsTable agents={agents} />
    </div>
  );
}