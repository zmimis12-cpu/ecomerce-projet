import { cn } from "@/lib/utils";
import Link from "next/link";
import type { AgentStats } from "@/types/call-center";
import { TrendingUp, Phone, AlertTriangle, Award } from "lucide-react";

function AvailBadge({ status }: { status?: string | null }) {
  const s = status ?? "offline";
  const cls =
    s === "available" ? "bg-green-100 text-green-700" :
    s === "in_call"   ? "bg-blue-100 text-blue-700"  :
    s === "away"      ? "bg-amber-100 text-amber-700" :
                        "bg-gray-100 text-gray-500";
  const lbl =
    s === "available" ? "Disponible" :
    s === "in_call"   ? "En appel"   :
    s === "away"      ? "Absent"     : "Hors ligne";
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", cls)}>
      {lbl}
    </span>
  );
}

export function AgentsTable({ agents }: { agents: AgentStats[] }) {
  if (agents.length === 0) {
    return (
      <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-14">
        <Phone className="h-9 w-9 text-muted-foreground/30 mb-2" />
        <p className="text-sm font-medium">Aucun agent</p>
        <p className="text-xs text-muted-foreground mt-1">
          Créez des utilisateurs avec le rôle <strong>Call Center</strong> dans Paramètres → Utilisateurs.
        </p>
      </div>
    );
  }

  const HEADERS = [
    "Agent", "Disponibilité", "Assignées", "Appels", "Confirmés",
    "Livrés payés", "Commission", "Fausses", "Taux conf.", "Durée moy.", ""
  ];

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-secondary/30">
              {HEADERS.map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {agents.map((a) => (
              <tr key={a.agent_id} className="hover:bg-secondary/20 transition-colors">

                {/* 1. Agent */}
                <td className="px-4 py-3">
                  <p className="font-medium text-sm">{a.full_name}</p>
                  <p className="text-xs text-muted-foreground">{a.email}</p>
                </td>

                {/* 2. Disponibilité */}
                <td className="px-4 py-3">
                  <AvailBadge status={a.availability_status} />
                </td>

                {/* 3. Assignées */}
                <td className="px-4 py-3 text-center font-mono text-sm">
                  {a.total_assigned}
                </td>

                {/* 4. Appels */}
                <td className="px-4 py-3 text-center font-mono text-sm">
                  {a.calls_made}
                </td>

                {/* 5. Confirmés */}
                <td className="px-4 py-3 text-center">
                  <span className="font-mono text-sm text-green-600 font-bold">{a.confirmed}</span>
                </td>

                {/* 6. Livrés payés */}
                <td className="px-4 py-3 text-center">
                  <span className="font-mono text-sm text-emerald-600 font-bold">{a.delivered_paid ?? 0}</span>
                </td>

                {/* 7. Commission */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Award className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="font-mono text-sm font-bold text-amber-700">
                      {(a.commission_mad ?? 0).toFixed(0)} MAD
                    </span>
                  </div>
                </td>

                {/* 8. Fausses */}
                <td className="px-4 py-3 text-center">
                  {(a.fake_orders ?? 0) > 0
                    ? <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600">
                        <AlertTriangle className="h-3 w-3" />{a.fake_orders}
                      </span>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </td>

                {/* 9. Taux conf. */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden min-w-[40px]">
                      <div
                        className={cn("h-full rounded-full",
                          a.confirmation_rate >= 60 ? "bg-green-500" :
                          a.confirmation_rate >= 30 ? "bg-amber-500" : "bg-red-500"
                        )}
                        style={{ width: `${a.confirmation_rate}%` }}
                      />
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

                {/* 10. Durée moy. */}
                <td className="px-4 py-3 text-center text-xs text-muted-foreground font-mono">
                  {a.avg_duration_sec !== null ? `${a.avg_duration_sec}s` : "—"}
                </td>

                {/* 11. Action */}
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/call-center/agents/${a.agent_id}`}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
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
