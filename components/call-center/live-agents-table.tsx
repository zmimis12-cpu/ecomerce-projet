"use client";
/**
 * LiveAgentsTable — polls /api/cc-agents/availability every 5s
 * and updates availability badges without full page reload.
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { TrendingUp, Phone, AlertTriangle, Award, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentStats } from "@/types/call-center";

// ─── Availability badge ───────────────────────────────────────────────────────
function AvailBadge({ status, lastSeen }: { status: string | null | undefined; lastSeen?: string | null }) {
  const effectiveStatus = getEffectiveStatus(status, lastSeen);
  const cfg = {
    available: { cls: "bg-green-100 text-green-700", dot: "bg-green-500", lbl: "En ligne" },
    in_call:   { cls: "bg-blue-100 text-blue-700",   dot: "bg-blue-500",  lbl: "En appel" },
    away:      { cls: "bg-amber-100 text-amber-700",  dot: "bg-amber-500", lbl: "Absent"   },
    offline:   { cls: "bg-gray-100 text-gray-500",    dot: "bg-gray-400",  lbl: "Hors ligne" },
  }[effectiveStatus] ?? { cls: "bg-gray-100 text-gray-500", dot: "bg-gray-400", lbl: "Hors ligne" };

  const tooltip = lastSeen
    ? `Dernière activité: ${new Date(lastSeen).toLocaleTimeString("fr-MA")}`
    : "Jamais vu";

  return (
    <span title={tooltip} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold cursor-help", cfg.cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", cfg.dot,
        effectiveStatus === "available" && "animate-pulse"
      )} />
      {cfg.lbl}
    </span>
  );
}

function getEffectiveStatus(status: string | null | undefined, lastSeen?: string | null): string {
  if (!lastSeen) return "offline";
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff > 2 * 60 * 1000) return "offline";
  return status ?? "offline";
}

// ─── Availability data from API ───────────────────────────────────────────────
type AvailData = { id: string; availability_status: string | null; last_seen_at: string | null };

// ─── Main component ───────────────────────────────────────────────────────────
export function LiveAgentsTable({ initialAgents }: { initialAgents: AgentStats[] }) {
  const [agents, setAgents] = useState<AgentStats[]>(initialAgents);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [polling, setPolling] = useState(false);

  const refreshAvailability = useCallback(async () => {
    try {
      const res = await fetch("/api/cc-agents/availability", { cache: "no-store" });
      if (!res.ok) return;
      const data: AvailData[] = await res.json();
      setAgents((prev) => prev.map((a) => {
        const live = data.find((d) => d.id === a.agent_id);
        if (!live) return a;
        return {
          ...a,
          availability_status: getEffectiveStatus(live.availability_status, live.last_seen_at),
        };
      }));
      setLastRefresh(new Date());
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => {
    // Poll every 5 seconds
    const interval = setInterval(refreshAvailability, 5000);
    return () => clearInterval(interval);
  }, [refreshAvailability]);

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
    <div className="space-y-2">
      {/* Live indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <RefreshCw className={cn("h-3 w-3", polling && "animate-spin")} />
        <span>Live · Mis à jour à {lastRefresh.toLocaleTimeString("fr-MA")}</span>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/30">
                {HEADERS.map((h) => (
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
                  <td className="px-4 py-3">
                    <AvailBadge status={a.availability_status} lastSeen={(a as AgentStats & { last_seen_at?: string }).last_seen_at} />
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-sm">{a.total_assigned}</td>
                  <td className="px-4 py-3 text-center font-mono text-sm">{a.calls_made}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-mono text-sm text-green-600 font-bold">{a.confirmed}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-mono text-sm text-emerald-600 font-bold">{a.delivered_paid ?? 0}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Award className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span className="font-mono text-sm font-bold text-amber-700">
                        {(a.commission_mad ?? 0).toFixed(0)} MAD
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(a.fake_orders ?? 0) > 0
                      ? <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600">
                          <AlertTriangle className="h-3 w-3" />{a.fake_orders}
                        </span>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden min-w-[40px]">
                        <div className={cn("h-full rounded-full",
                          a.confirmation_rate >= 60 ? "bg-green-500" :
                          a.confirmation_rate >= 30 ? "bg-amber-500" : "bg-red-500"
                        )} style={{ width: `${a.confirmation_rate}%` }} />
                      </div>
                      <span className={cn("text-xs font-mono font-medium w-8 text-right",
                        a.confirmation_rate >= 60 ? "text-green-600" :
                        a.confirmation_rate >= 30 ? "text-amber-600" : "text-red-600"
                      )}>{a.confirmation_rate}%</span>
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
    </div>
  );
}
