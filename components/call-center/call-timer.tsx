"use client";
/**
 * CallTimer — core agent interaction component.
 * Shows a live timer, enforces 20s before "Confirmed",
 * saves call log via server action on submit.
 */
import { useState, useEffect, useRef, useTransition } from "react";
import { logCall } from "@/lib/call-center/actions";
import { MIN_CONFIRM_SECONDS, CALL_RESULT_LABELS } from "@/types/call-center";
import type { CallResult } from "@/types/call-center";
import { cn } from "@/lib/utils";
import { Phone, PhoneOff, Clock } from "lucide-react";

interface CallTimerProps {
  orderId: string;
  customerPhone: string;
  onComplete: (result: CallResult) => void;
}

type Phase = "idle" | "calling" | "done";

export function CallTimer({ orderId, customerPhone, onComplete }: CallTimerProps) {
  const [phase, setPhase]       = useState<Phase>("idle");
  const [elapsed, setElapsed]   = useState(0);
  const [notes, setNotes]       = useState("");
  const [isPending, startTransition] = useTransition();
  const [toast, setToast]       = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const startRef    = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start timer
  function startCall() {
    startRef.current = new Date().toISOString();
    setElapsed(0);
    setPhase("calling");
    intervalRef.current = setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);
  }

  // Stop timer and log
  function endCall(result: CallResult) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const endedAt = new Date().toISOString();
    const dur     = elapsed;
    setPhase("done");

    startTransition(async () => {
      const res = await logCall({
        orderId,
        phoneDialed:     customerPhone,
        result,
        durationSeconds: dur,
        notes,
        startedAt:  startRef.current ?? endedAt,
        endedAt,
      });

      if (res.success) {
        setToast({ type: "success", msg: `Appel enregistré : ${CALL_RESULT_LABELS[result]}` });
        setTimeout(() => setToast(null), 3000);
        onComplete(result);
      } else {
        setToast({ type: "error", msg: res.error ?? "Erreur." });
        setTimeout(() => setToast(null), 5000);
        setPhase("calling"); // allow retry
      }
    });
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const canConfirm = elapsed >= MIN_CONFIRM_SECONDS;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="space-y-4">
      {toast && (
        <div className={cn(
          "rounded-lg px-4 py-3 text-sm font-medium",
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-50 border border-red-200 text-red-700"
        )}>
          {toast.type === "success" ? "✓ " : "✕ "}{toast.msg}
        </div>
      )}

      {/* Phone number — large */}
      <div className="rounded-xl border bg-secondary/20 px-5 py-4 text-center">
        <p className="text-xs text-muted-foreground mb-1">Numéro à appeler</p>
        <p className="text-3xl font-mono font-bold tracking-widest text-foreground">
          {customerPhone}
        </p>
      </div>

      {/* Timer display */}
      {phase !== "idle" && (
        <div className="flex items-center justify-center gap-2 py-2">
          <Clock className={cn("h-4 w-4", phase === "calling" ? "text-green-500 animate-pulse" : "text-muted-foreground")} />
          <span className={cn(
            "text-2xl font-mono font-bold tabular-nums",
            phase === "calling" ? "text-green-600" : "text-muted-foreground"
          )}>
            {mm}:{ss}
          </span>
          {phase === "calling" && !canConfirm && (
            <span className="text-xs text-muted-foreground">
              ({MIN_CONFIRM_SECONDS - elapsed}s avant confirmation)
            </span>
          )}
        </div>
      )}

      {/* Notes */}
      {phase === "calling" && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Notes de l&apos;appel
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observations, raison du refus…"
            rows={2}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>
      )}

      {/* Action buttons */}
      {phase === "idle" && (
        <button
          type="button"
          onClick={startCall}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-600 text-white py-3 text-sm font-semibold hover:bg-green-700 transition-colors"
        >
          <Phone className="h-5 w-5" /> Démarrer l&apos;appel
        </button>
      )}

      {phase === "calling" && (
        <div className="grid grid-cols-2 gap-2">
          {/* Confirm — disabled before 20s */}
          <button
            type="button"
            onClick={() => endCall("confirmed")}
            disabled={!canConfirm || isPending}
            className={cn(
              "col-span-2 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all",
              canConfirm
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-green-100 text-green-400 cursor-not-allowed"
            )}
          >
            ✓ {canConfirm ? "Confirmer la commande" : `Confirmer (${MIN_CONFIRM_SECONDS - elapsed}s)`}
          </button>

          {[
            { result: "refused"            as CallResult, label: "Refusé",         cls: "bg-red-100 text-red-700 hover:bg-red-200" },
            { result: "no_answer"          as CallResult, label: "Sans réponse",   cls: "bg-orange-100 text-orange-700 hover:bg-orange-200" },
            { result: "unreachable"        as CallResult, label: "Injoignable",    cls: "bg-slate-100 text-slate-700 hover:bg-slate-200" },
            { result: "callback_requested" as CallResult, label: "Rappel demandé", cls: "bg-blue-100 text-blue-700 hover:bg-blue-200" },
            { result: "wrong_number"       as CallResult, label: "Mauvais n°",     cls: "bg-purple-100 text-purple-700 hover:bg-purple-200" },
          ].map(({ result, label, cls }) => (
            <button
              key={result}
              type="button"
              onClick={() => endCall(result)}
              disabled={isPending}
              className={cn("rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50", cls)}
            >
              {label}
            </button>
          ))}

          {/* End call without result */}
          <button
            type="button"
            onClick={() => { if (intervalRef.current) clearInterval(intervalRef.current); setPhase("idle"); setElapsed(0); }}
            disabled={isPending}
            className="flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-xs text-muted-foreground hover:bg-secondary transition-colors"
          >
            <PhoneOff className="h-3.5 w-3.5" /> Annuler
          </button>
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-xl bg-secondary/30 py-4 text-center text-sm text-muted-foreground">
          Appel enregistré — {isPending ? "Sauvegarde…" : "✓ Sauvegardé"}
        </div>
      )}
    </div>
  );
}
