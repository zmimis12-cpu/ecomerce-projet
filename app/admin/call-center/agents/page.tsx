import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AgentsTable } from "@/components/call-center/agents-table";

export const metadata: Metadata = { title: "Agents — Call Center" };
export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  await requireRole(["super_admin", "admin", "manager"]);

  const { data: agents, error } = await supabaseAdmin
    .from("cc_agents")
    .select("*")
    .eq("active", true)
    .order("full_name");

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
        <p className="text-xs text-red-600">Count: {(agents ?? []).length}</p>
        {agents && agents.length > 0 && (
          <ul className="list-disc pl-5 mt-2 text-xs text-red-600">
            {(agents as any[]).map((a) => (
              <li key={a.id}>{a.full_name} ({a.email})</li>
            ))}
          </ul>
        )}
      </div>

      <AgentsTable agents={(agents as any[]) ?? []} />
    </div>
  );
}