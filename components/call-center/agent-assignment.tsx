"use client";
import { useState, useTransition } from "react";
import { assignOrderToAgent, bulkAssignOrders } from "@/lib/call-center/actions";
import { cn } from "@/lib/utils";

interface Agent { id: string; full_name: string; }

interface AgentAssignmentProps {
  orderId: string;
  currentAgentId: string | null;
  agents: Agent[];
  onAssigned?: () => void;
}

export function AgentAssignment({ orderId, currentAgentId, agents, onAssigned }: AgentAssignmentProps) {
  const [agentId, setAgentId] = useState(currentAgentId ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleChange(newId: string) {
    setAgentId(newId);
    startTransition(async () => {
      await assignOrderToAgent(orderId, newId || null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onAssigned?.();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={agentId}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      >
        <option value="">— Non assigné —</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.full_name}</option>
        ))}
      </select>
      {saved && <span className="text-xs text-green-600 font-medium shrink-0">✓</span>}
    </div>
  );
}

// ─── Bulk assign toolbar ────────────────────────────────────────────────────────
interface BulkAssignProps {
  selectedIds: string[];
  agents: Agent[];
  onComplete: () => void;
}

export function BulkAssignToolbar({ selectedIds, agents, onComplete }: BulkAssignProps) {
  const [agentId, setAgentId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

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
            {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
          <button
            type="button" onClick={handleBulk}
            disabled={!agentId || isPending}
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
