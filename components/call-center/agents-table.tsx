import { cn } from "@/lib/utils";
import Link from "next/link";
import type { AgentStats } from "@/types/call-center";
import { TrendingUp, Phone } from "lucide-react";

export function AgentsTable({ agents }: { agents: AgentStats[] }) {
  if (agents.length === 0) {
    return (
      <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-14">
        <Phone className="h-9 w-9 text-muted-foreground/30 mb-2" />
        <p className="text-sm font-medium">Aucun agent</p>
        <p className="text-xs text-muted-foreground mt-1">Créez des utilisateurs avec le rôle call_center_agent.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-secondary/30">
              {["Agent","Assignées","Appels","Confirmés","Refusés","Sans rép.","Taux","Durée moy.",""].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {agents.map((a) => (
              <tr key={a.agent_id} className="hover:bg-secondary/20 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-sm">{a.full_name}</p>
                  <p className="text-xs text-muted-foreground">{a.email}</p>
                </td>
                <td className="px-4 py-3 text-center font-mono text-sm">{a.total_assigned}</td>
                <td className="px-4 py-3 text-center font-mono text-sm">{a.calls_made}</td>
                <td className="px-4 py-3 text-center">
                  <span className="font-mono text-sm text-green-600 font-medium">{a.confirmed}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="font-mono text-sm text-red-600">{a.refused}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="font-mono text-sm text-orange-600">{a.no_answer}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className={cn(
                        "h-full rounded-full",
                        a.confirmation_rate >= 60 ? "bg-green-500" :
                        a.confirmation_rate >= 30 ? "bg-amber-500" : "bg-red-500"
                      )} style={{ width: `${a.confirmation_rate}%` }} />
                    </div>
                    <span className={cn(
                      "text-xs font-mono font-medium w-8 text-right",
                      a.confirmation_rate >= 60 ? "text-green-600" :
                      a.confirmation_rate >= 30 ? "text-amber-600" : "text-red-600"
                    )}>
                      {a.confirmation_rate}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-xs text-muted-foreground font-mono">
                  {a.avg_duration_sec !== null ? `${a.avg_duration_sec}s` : "—"}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/call-center/agents/${a.agent_id}`}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5" /> Détails
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
