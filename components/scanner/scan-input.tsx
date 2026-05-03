"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import { scanExit, scanReturn } from "@/lib/scanner/actions";
import { RETURN_CONDITIONS, RETURN_CONDITION_LABELS, RETURN_CONDITION_COLORS } from "@/types/scanner";
import type { ReturnCondition, ScanResult } from "@/types/scanner";
import { playSound } from "./scanner-sounds";
import { cn } from "@/lib/utils";
import { ScanLine, Barcode, RotateCcw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

type Mode = "exit" | "return";
interface ScanInputProps { mode: Mode; }

export function ScanInput({ mode }: ScanInputProps) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const [tracking, setTracking]   = useState("");
  const [condition, setCondition] = useState<ReturnCondition>("good");
  const [notes, setNotes]         = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult]       = useState<ScanResult | null>(null);
  const [history, setHistory]     = useState<(ScanResult & { time: string })[]>([]);

  // Auto-focus on mount and mode change
  useEffect(() => {
    inputRef.current?.focus();
    setResult(null);
    setTracking("");
  }, [mode]);

  function handleScan() {
    if (!tracking.trim() || isPending) return;

    startTransition(async () => {
      let res: ScanResult;
      if (mode === "exit") {
        res = await scanExit(tracking);
      } else {
        res = await scanReturn(tracking, condition, notes);
      }

      // Play sound immediately
      if (res.isDuplicate) {
        playSound("duplicate");
      } else if (res.success) {
        playSound("success");
      } else {
        playSound("error");
      }

      setResult(res);
      setHistory((h) => [{ ...res, time: new Date().toLocaleTimeString("fr-MA") }, ...h.slice(0, 19)]);
      setTracking("");
      setNotes("");

      setTimeout(() => inputRef.current?.focus(), 50);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleScan();
  }

  const feedbackColor =
    !result ? "" :
    result.isDuplicate ? "border-amber-400 bg-amber-50" :
    result.success     ? "border-green-400 bg-green-50" :
    "border-red-400 bg-red-50";

  const feedbackIcon =
    !result ? null :
    result.isDuplicate ? <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" /> :
    result.success     ? <CheckCircle2  className="h-6 w-6 text-green-600 shrink-0" /> :
    <XCircle className="h-6 w-6 text-red-600 shrink-0" />;

  return (
    <div className="space-y-5 max-w-xl mx-auto">
      {/* Mode indicator */}
      <div className={cn(
        "flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold",
        mode === "exit" ? "bg-indigo-100 text-indigo-800" : "bg-amber-100 text-amber-800"
      )}>
        {mode === "exit"
          ? <><Barcode className="h-5 w-5" /> Mode Sortie — Scan expédition</>
          : <><RotateCcw className="h-5 w-5" /> Mode Retour — Scan réception</>}
      </div>

      {/* Scan form */}
      <div className="rounded-xl border-2 border-primary/30 bg-card p-5 space-y-4">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Numéro de suivi
        </label>
        <input
          ref={inputRef}
          type="text"
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scannez ou saisissez…"
          disabled={isPending}
          autoComplete="off"
          className={cn(
            "flex w-full rounded-lg border-2 bg-background px-4 py-4",
            "text-xl font-mono placeholder:text-muted-foreground/50",
            "focus:outline-none focus:border-primary",
            "disabled:opacity-50 transition-colors"
          )}
        />

        {/* Return condition */}
        {mode === "return" && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Condition *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {RETURN_CONDITIONS.map((c) => {
                const color = RETURN_CONDITION_COLORS[c];
                return (
                  <button key={c} type="button" onClick={() => setCondition(c)}
                    className={cn(
                      "rounded-lg px-3 py-2.5 text-sm font-medium border-2 transition-all",
                      condition === c
                        ? `${color.bg} ${color.text} border-current`
                        : "bg-background text-muted-foreground border-border hover:border-primary/40"
                    )}>
                    {RETURN_CONDITION_LABELS[c]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mode === "return" && (
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optionnel)…" rows={2}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
        )}

        <button type="button" onClick={handleScan}
          disabled={isPending || !tracking.trim()}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-xl py-4 text-base font-bold transition-all",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            mode === "exit"
              ? "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98]"
              : "bg-amber-600 text-white hover:bg-amber-700 active:scale-[0.98]"
          )}>
          <ScanLine className="h-5 w-5" />
          {isPending ? "Traitement…" : mode === "exit" ? "Enregistrer sortie" : "Enregistrer retour"}
        </button>
      </div>

      {/* Feedback — large and clear */}
      {result && (
        <div className={cn(
          "flex items-start gap-3 rounded-xl border-2 px-5 py-4 transition-all",
          feedbackColor
        )}>
          {feedbackIcon}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base">{result.message}</p>
            {result.orderId && (
              <p className="text-sm text-muted-foreground mt-1">
                {result.orderNumber} — {result.customerName}
              </p>
            )}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Historique session ({history.length})
          </p>
          <div className="rounded-xl border bg-card divide-y max-h-56 overflow-y-auto">
            {history.map((h, idx) => (
              <div key={idx} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-xs text-muted-foreground font-mono shrink-0 w-16">{h.time}</span>
                <span className="font-mono text-xs font-medium flex-1 truncate">{h.trackingNumber}</span>
                {h.isDuplicate
                  ? <span className="text-xs text-amber-600 font-medium shrink-0">⚠ Doublon</span>
                  : h.success
                  ? <span className="text-xs text-green-600 font-medium shrink-0">✓ OK</span>
                  : <span className="text-xs text-red-600 font-medium shrink-0">✕ Erreur</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
