"use client";
/**
 * CallTimer — core agent interaction component.
 * - Live timer
 * - Numéro affiché + appel direct (tel:), statuts disponibles tout de suite (plus de délai)
 * - fake_order + duplicate + callback_requested
 * - Callback date/time scheduling
 */
import { useState, useEffect, useRef, useTransition } from "react";
import { logCall, scheduleCallback } from "@/lib/call-center/actions";
import { CALL_RESULT_LABELS } from "@/types/call-center";
import type { CallResult } from "@/types/call-center";
import { cn } from "@/lib/utils";
import { Phone, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

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
    if (!startRef.current) startRef.current = new Date().toISOString(); // statut posé sans démarrer le chrono
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

  const fmt          = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

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

  // ── APPEL + STATUTS (sans délai) ─────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Numéro + appel direct */}
      <a href={`tel:${customerPhone}`} onClick={() => { if (phase !== "calling") startCall(); }}
        className="w-full flex items-center justify-center gap-3 rounded-xl bg-green-600 text-white py-4 hover:bg-green-700 transition-colors active:scale-[0.98]">
        <Phone className="h-6 w-6" />
        <span className="text-2xl font-bold font-mono tracking-wide" dir="ltr">{customerPhone}</span>
      </a>
      {phase === "calling" && (
        <div className="flex items-center justify-center gap-2 text-green-700">
          <Clock className="h-4 w-4" />
          <span className="font-mono font-bold tabular-nums">{fmt(elapsed)}</span>
        </div>
      )}

      {/* Notes */}
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes sur l'appel…" rows={2}
        className="flex w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />

      {/* Callback date */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground whitespace-nowrap">Rappel le :</label>
        <input type="datetime-local" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)}
          className="flex-1 h-8 rounded-lg border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {/* Statuts */}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => endCall("confirmed")} disabled={isPending}
          className="col-span-2 flex items-center justify-center gap-2 rounded-xl py-4 text-base font-bold bg-green-600 text-white hover:bg-green-700 active:scale-[0.98] disabled:opacity-50">
          <CheckCircle2 className="h-5 w-5" /> ✓ Confirmer la commande
        </button>
        {([
          ["refused",            "Refusé",           "bg-red-100 text-red-700 hover:bg-red-200"],
          ["no_answer",          "Sans réponse",      "bg-orange-100 text-orange-700 hover:bg-orange-200"],
          ["callback_requested", "Rappel demandé",    "bg-blue-100 text-blue-700 hover:bg-blue-200"],
          ["wrong_number",       "Mauvais numéro",    "bg-purple-100 text-purple-700 hover:bg-purple-200"],
          ["fake_order",         "🚫 Fausse commande","bg-red-200 text-red-900 hover:bg-red-300"],
          ["duplicate",          "⚠ Doublon",         "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"],
        ] as [CallResult, string, string][]).map(([result, label, cls]) => (
          <button key={result} type="button" onClick={() => endCall(result)} disabled={isPending}
            className={cn("rounded-xl py-3 text-sm font-semibold transition-colors disabled:opacity-50", cls)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
