"use client";
/**
 * AgentPresence — sets agent to "available" on mount,
 * sends heartbeat every 30s, and cleans up on unmount.
 * Drop this component in any call center page.
 */
import { useEffect } from "react";
import { updateAgentHeartbeat, setAgentAvailability } from "@/lib/call-center/actions";

export function AgentPresence() {
  useEffect(() => {
    // Set available immediately on page open
    setAgentAvailability("available");

    // Heartbeat every 30 seconds
    const interval = setInterval(() => {
      updateAgentHeartbeat();
    }, 30_000);

    // Set offline on page close
    return () => {
      clearInterval(interval);
      // Best-effort — browser may not wait for this
      setAgentAvailability("offline");
    };
  }, []);

  return null; // renders nothing
}
