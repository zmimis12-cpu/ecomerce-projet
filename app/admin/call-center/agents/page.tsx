import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getAgentStats } from "@/lib/call-center/queries";
import { AgentsTable } from "@/components/call-center/agents-table";

export const metadata: Metadata = { title: "Agents — Call Center" };
export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  await requireRole(["super_admin", "admin", "manager"]);
  const agents = await getAgentStats();

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

      {/* DEBUG */}
      <div className="rounded-xl border border-red-300 bg-red-50 p-4">
        <p className="text-sm font-bold text-red-700">🔍 DEBUG: agents.length = {agents.length}</p>
        {agents.length > 0 ? (
          <ul className="list-disc pl-5 mt-2 text-xs text-red-600">
            {agents.map((a) => (
              <li key={a.agent_id}>{a.full_name} ({a.email})</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-red-600 mt-1">Aucun agent retourné par getAgentStats()</p>
        )}
      </div>

      <AgentsTable agents={agents} />
    </div>
  );
}