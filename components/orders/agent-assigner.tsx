"use client";

import { useState, useTransition } from "react";
import { assignOrderAgent } from "@/lib/orders/actions";
import { User } from "lucide-react";

interface Agent { id: string; full_name: string; email: string; role: string; }

interface AgentAssignerProps {
  orderId: string;
  currentAgentId: string | null;
  agents: Agent[];
}

export function AgentAssigner({ orderId, currentAgentId, agents }: AgentAssignerProps) {
  const [agentId, setAgentId] = useState(currentAgentId ?? "");
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  function handleChange(newId: string) {
    setAgentId(newId);
    startTransition(async () => {
      const result = await assignOrderAgent(orderId, newId || null);
      if (result.success) {
        setToast("Agent assigné.");
        setTimeout(() => setToast(null), 2000);
      }
    });
  }

  const currentAgent = agents.find((a) => a.id === agentId);

  return (
    <div className="space-y-2">
      {toast && <p className="text-xs text-green-600 font-medium">✓ {toast}</p>}
      <div className="flex items-center gap-2">
        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">
          {currentAgent?.full_name ?? "Non assigné"}
        </span>
      </div>
      <select value={agentId} onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
        <option value="">— Non assigné —</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.full_name}</option>
        ))}
      </select>
    </div>
  );
}
