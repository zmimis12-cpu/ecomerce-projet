import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getAgentStats } from "@/lib/call-center/queries";
import { LiveAgentsTable } from "@/components/call-center/live-agents-table";

export const metadata: Metadata = { title: "Agents — Call Center" };
export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  await requireRole(["super_admin", "admin", "manager"]);

  // Use getAgentStats — same logic as agent detail page
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
        <p className="text-sm text-muted-foreground mt-1">Performance et statistiques des agents.</p>
      </div>
      <LiveAgentsTable initialAgents={agents} />
    </div>
  );
}
