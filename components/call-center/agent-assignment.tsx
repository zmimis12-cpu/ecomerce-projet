"use client";
import { useState, useTransition } from "react";
import { assignOrderToAgent, bulkAssignOrders } from "@/lib/call-center/actions";
import { cn } from "@/lib/utils";

interface Agent {
  id: string;
  full_name: string;
  availability_status?: string | null;
}

const AVAILABILITY_LABELS: Record<string, string> = {
  available: "disponible",
  in_call:   "en appel",
  away:      "absent",
  offline:   "hors ligne",
};

function agentLabel(a: Agent): string {
  const status = a.availability_status ?? "offline";
  return `${a.full_name} — ${AVAILABILITY_LABELS[status] ?? status}`;
}

function isAssignable(a: Agent): boolean {
  const s = a.availability_status ?? "offline";
  return s === "available" || s === "in_call"; // allow in_call too for manual assignment
}

interface AgentAssignmentProps {
  orderId:        string;
  currentAgentId: string | null;
  agents:         Agent[];
  onAssigned?:    () => void;
}

export function AgentAssignment({ orderId, currentAgentId, agents, onAssigned }: AgentAssignmentProps) {
  const [agentId, setAgentId] = useState(currentAgentId ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved]     = useState(false);

  function handleChange(newId: string) {
    setAgentId(newId);
    startTransition(async () => {
      await assignOrderToAgent(orderId, newId || null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onAssigned?.();
    });
  }

  const available  = agents.filter(isAssignable);
  const unavailable = agents.filter((a) => !isAssignable(a));

  return (
    <div className="flex items-center gap-2">
      <select value={agentId} onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
        <option value="">— Non assigné —</option>
        {agents.length === 0 && (
          <option value="" disabled>Aucun agent disponible</option>
        )}
        {available.length > 0 && (
          <optgroup label="Disponibles">
            {available.map((a) => (
              <option key={a.id} value={a.id}>{agentLabel(a)}</option>
            ))}
          </optgroup>
        )}
        {unavailable.length > 0 && (
          <optgroup label="Indisponibles">
            {unavailable.map((a) => (
              <option key={a.id} value={a.id} className="text-muted-foreground">{agentLabel(a)}</option>
            ))}
          </optgroup>
        )}
      </select>
      {saved && <span className="text-xs text-green-600 font-medium shrink-0">✓</span>}
    </div>
  );
}

// ─── Bulk assign toolbar ────────────────────────────────────────────────────────
interface BulkAssignProps {
  selectedIds: string[];
  agents:      Agent[];
  onComplete:  () => void;
}

export function BulkAssignToolbar({ selectedIds, agents, onComplete }: BulkAssignProps) {
  const [agentId, setAgentId]         = useState("");
  const [isPending, startTransition]  = useTransition();
  const [toast, setToast]             = useState<string | null>(null);

  if (selectedIds.length === 0) return null;

  function handleBulk() {
    if (!agentId) return;
    startTransition(async () => {
      const res = await bulkAssignOrders(selectedIds, agentId);
      if (res.success) {
        setToast(`${res.count} commande(s) assignée(s).`);
        setTimeout(() => { setToast(null); onComplete(); }, 2000);
      }
    });
  }

  const available = agents.filter(isAssignable);

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-primary/5 px-4 py-2">
      {toast ? (
        <span className="text-xs text-green-600 font-medium">✓ {toast}</span>
      ) : (
        <>
          <span className="text-xs font-medium">{selectedIds.length} sélectionné(s)</span>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none">
            <option value="">Assigner à…</option>
            {available.length === 0 && <option value="" disabled>Aucun agent disponible</option>}
            {available.map((a) => <option key={a.id} value={a.id}>{agentLabel(a)}</option>)}
          </select>
          <button type="button" onClick={handleBulk} disabled={!agentId || isPending}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground",
              "hover:opacity-90 disabled:opacity-50"
            )}>
            {isPending ? "…" : "Assigner"}
          </button>
        </>
      )}
    </div>
  );
}
