import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { AgentsTable } from "@/components/call-center/agents-table";
import type { AgentStats } from "@/types/call-center";

export const metadata: Metadata = { title: "Agents — Call Center" };
export const dynamic = "force-dynamic";

async function fetchAgents(): Promise<AgentStats[]> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  
  try {
    const res = await fetch(`${baseUrl}/api/cc-agents`, { cache: "no-store" });
    const data = await res.json();
    
    if (!Array.isArray(data)) return [];
    
    return data.map((row: Record<string, unknown>) => ({
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
  } catch {
    return [];
  }
}

export default async function AgentsPage() {
  await requireRole(["super_admin", "admin", "manager"]);
  const agents = await fetchAgents();

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

      <AgentsTable agents={agents} />
    </div>
  );
}