"use client";
/**
 * CallTimer — core agent interaction component.
 * - Live timer
 * - 20s anti-fake lock on "Confirmed"
 * - fake_order + duplicate + callback_requested
 * - Callback date/time scheduling
 */
import { useState, useEffect, useRef, useTransition } from "react";
import { logCall, scheduleCallback } from "@/lib/call-center/actions";
import { MIN_CONFIRM_SECONDS, CALL_RESULT_LABELS, CALL_RESULT_COLORS } from "@/types/call-center";
import type { CallResult } from "@/types/call-center";
import { cn } from "@/lib/utils";
import { Phone, PhoneOff, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

interface CallTimerProps {
  orderId:       string;
  customerPhone: string;
}

type Phase = "idle" | "calling" | "done";

export function CallTimer({ orderId, customerPhone }: CallTimerProps) {
  const [phase, setPhase]   = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [notes, setNotes]   = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [isPending, startTransition] = useTransition();
  const [toast, setToast]   = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const startRef    = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCall() {
    startRef.current = new Date().toISOString();
    setElapsed(0);
    setPhase("calling");
    intervalRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }

  function endCall(result: CallResult) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const dur = elapsed;
    setPhase("done");

    // Callback scheduling
    if (result === "callback_requested" && callbackAt) {
      startTransition(async () => {
        await scheduleCallback({ orderId, callbackAt, reason: notes });
        setToast({ type: "success", msg: "Rappel planifié." });
      });
      return;
    }

    startTransition(async () => {
      const res = await logCall({
        orderId,
        phoneDialed:     customerPhone,
        result,
        durationSeconds: dur,
        notes:           notes.trim() || "",
        startedAt:       startRef.current!,
        endedAt:         new Date().toISOString(),
      });
      if (res.success) {
        setToast({ type: "success", msg: `${CALL_RESULT_LABELS[result]} — enregistré.` });
      } else {
        setToast({ type: "error", msg: res.error ?? "Erreur." });
        setPhase("idle");
      }
    });
  }

  // Cleanup on unmount
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const canConfirm   = elapsed >= MIN_CONFIRM_SECONDS;
  const secRemaining = Math.max(0, MIN_CONFIRM_SECONDS - elapsed);
  const fmt          = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ── IDLE ──────────────────────────────────────────────────────────────────
  if (phase === "idle") return (
    <div className="space-y-4">
      <button type="button" onClick={startCall}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-600 text-white py-5 text-lg font-bold hover:bg-green-700 transition-colors active:scale-[0.98]">
        <Phone className="h-6 w-6" />
        Démarrer l&apos;appel
      </button>
      <p className="text-center text-xs text-muted-foreground">
        Le bouton &quot;Confirmé&quot; sera débloqué après {MIN_CONFIRM_SECONDS}s d&apos;appel.
      </p>
    </div>
  );

  // ── DONE ──────────────────────────────────────────────────────────────────
  if (phase === "done") return (
    <div className={cn(
      "rounded-xl border-2 p-5 text-center space-y-2",
      toast?.type === "success" ? "border-green-400 bg-green-50" : "border-red-400 bg-red-50"
    )}>
      {toast?.type === "success"
        ? <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto" />
        : <AlertTriangle className="h-8 w-8 text-red-600 mx-auto" />}
      <p className="font-semibold">{toast?.msg}</p>
      <p className="text-xs text-muted-foreground">Durée: {fmt(elapsed)}</p>
      <button type="button" onClick={() => { setPhase("idle"); setElapsed(0); setNotes(""); setToast(null); }}
        className="text-xs text-primary hover:underline">
        Nouvel appel
      </button>
    </div>
  );

  // ── CALLING ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Timer display */}
      <div className={cn(
        "rounded-xl p-5 text-center border-2 transition-colors",
        canConfirm ? "border-green-400 bg-green-50" : "border-orange-300 bg-orange-50"
      )}>
        <div className="flex items-center justify-center gap-2 mb-1">
          <Clock className={cn("h-5 w-5", canConfirm ? "text-green-600" : "text-orange-500")} />
          <span className={cn("text-4xl font-mono font-bold tabular-nums", canConfirm ? "text-green-700" : "text-orange-600")}>
            {fmt(elapsed)}
          </span>
        </div>
        {!canConfirm && (
          <p className="text-xs text-orange-600 font-medium">
            ⏳ Confirmation disponible dans {secRemaining}s
          </p>
        )}
        {canConfirm && (
          <p className="text-xs text-green-600 font-semibold">✓ Confirmation débloquée</p>
        )}
      </div>

      {/* Notes */}
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes sur l'appel…" rows={2}
        className="flex w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />

      {/* Callback date (shown always for flexibility) */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground whitespace-nowrap">Rappel le :</label>
        <input type="datetime-local" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)}
          className="flex-1 h-8 rounded-lg border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {/* Result buttons */}
      <div className="grid grid-cols-2 gap-2">
        {/* CONFIRMED — locked until 20s */}
        <button type="button"
          onClick={() => canConfirm && endCall("confirmed")}
          disabled={!canConfirm || isPending}
          className={cn(
            "col-span-2 flex items-center justify-center gap-2 rounded-xl py-4 text-base font-bold transition-all",
            canConfirm
              ? "bg-green-600 text-white hover:bg-green-700 active:scale-[0.98]"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          )}>
          <CheckCircle2 className="h-5 w-5" />
          {canConfirm ? "✓ Confirmer la commande" : `Confirmer (attendre ${secRemaining}s)`}
        </button>

        {/* Other results */}
        {([
          ["refused",            "Refusé",           "bg-red-100 text-red-700 hover:bg-red-200"],
          ["no_answer",          "Sans réponse",      "bg-orange-100 text-orange-700 hover:bg-orange-200"],
          ["callback_requested", "Rappel demandé",    "bg-blue-100 text-blue-700 hover:bg-blue-200"],
          ["wrong_number",       "Mauvais numéro",    "bg-purple-100 text-purple-700 hover:bg-purple-200"],
          ["fake_order",         "🚫 Fausse commande","bg-red-200 text-red-900 hover:bg-red-300"],
          ["duplicate",          "⚠ Doublon",         "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"],
        ] as [CallResult, string, string][]).map(([result, label, cls]) => (
          <button key={result} type="button"
            onClick={() => endCall(result)}
            disabled={isPending}
            className={cn("rounded-xl py-3 text-sm font-semibold transition-colors disabled:opacity-50", cls)}>
            {label}
          </button>
        ))}

        {/* End call without result */}
        <button type="button" onClick={() => endCall("no_answer")} disabled={isPending}
          className="col-span-2 flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">
          <PhoneOff className="h-4 w-4" /> Terminer l&apos;appel
        </button>
      </div>
    </div>
  );
}
