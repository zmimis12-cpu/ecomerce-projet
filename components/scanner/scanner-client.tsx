"use client";
/**
 * Ultra-fast scanner — no confirmation popup, no fetch before scan.
 * 
 * EXIT MODE:   scan → instant result (stock -qty, status update)
 * RETURN MODE: scan → instant log → accumulate list → 
 *              at end, select condition once → confirm all
 */
import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { scanExit, scanReturn } from "@/lib/scanner/actions";
import { RETURN_CONDITIONS, RETURN_CONDITION_LABELS, RETURN_CONDITION_COLORS } from "@/types/scanner";
import type { ReturnCondition, ScanResult } from "@/types/scanner";
import { playSound } from "./scanner-sounds";
import { cn } from "@/lib/utils";
import {
  ScanLine, Barcode, RotateCcw,
  CheckCircle2, AlertTriangle, XCircle, Send,
} from "lucide-react";

type Mode = "exit" | "return";

interface ScannedReturn {
  tracking: string;
  time:     string;
  status:   "ok" | "duplicate" | "error";
  message:  string;
}

export function ScannerClient() {
  const [mode, setMode]               = useState<Mode>("exit");
  const inputRef                      = useRef<HTMLInputElement>(null);
  const [tracking, setTracking]       = useState("");
  const [isPending, startTransition]  = useTransition();
  const [result, setResult]           = useState<ScanResult | null>(null);

  // Exit history
  const [exitHistory, setExitHistory] = useState<(ScanResult & { time: string })[]>([]);

  // Return batch — accumulate scans, confirm condition at end
  const [returnQueue, setReturnQueue] = useState<ScannedReturn[]>([]);
  const [condition, setCondition]     = useState<ReturnCondition>("good");
  const [notes, setNotes]             = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<string | null>(null);

  // Auto-focus on mode change
  useEffect(() => {
    setResult(null);
    setTracking("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [mode]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function switchMode(newMode: Mode) {
    if (newMode !== mode) setMode(newMode);
  }

  // ── EXIT SCAN — ultra fast ────────────────────────────────────────────────
  const handleExitScan = useCallback(() => {
    const snap = tracking.trim().toUpperCase();
    if (!snap || isPending) return;
    setTracking("");
    setTimeout(() => inputRef.current?.focus(), 0);

    startTransition(async () => {
      const res = await scanExit(snap);
      if (res.isDuplicate) playSound("duplicate");
      else if (res.success) playSound("success");
      else playSound("error");
      setResult(res);
      setExitHistory((h) => [{ ...res, time: new Date().toLocaleTimeString("fr-MA") }, ...h.slice(0, 49)]);
    });
  }, [tracking, isPending]);

  // ── RETURN SCAN — ultra fast, just queue it ───────────────────────────────
  const handleReturnScan = useCallback(() => {
    const snap = tracking.trim().toUpperCase();
    if (!snap) return;
    setTracking("");
    setTimeout(() => inputRef.current?.focus(), 0);

    // Check duplicate in queue
    if (returnQueue.some((r) => r.tracking === snap)) {
      playSound("duplicate");
      setReturnQueue((q) => [...q, {
        tracking: snap,
        time: new Date().toLocaleTimeString("fr-MA"),
        status: "duplicate",
        message: `⚠ Doublon dans la liste`,
      }]);
      return;
    }

    playSound("success");
    setReturnQueue((q) => [...q, {
      tracking: snap,
      time: new Date().toLocaleTimeString("fr-MA"),
      status: "ok",
      message: `✓ Ajouté`,
    }]);
  }, [tracking, returnQueue]);

  // ── CONFIRM ALL RETURNS at end ────────────────────────────────────────────
  async function handleConfirmAllReturns() {
    const validTrackings = returnQueue.filter((r) => r.status === "ok").map((r) => r.tracking);
    if (!validTrackings.length) return;
    setIsConfirming(true);
    setConfirmResult(null);

    let ok = 0, errors = 0;
    for (const t of validTrackings) {
      const res = await scanReturn(t, condition, notes);
      if (res.success) ok++; else errors++;
    }

    setIsConfirming(false);
    setConfirmResult(`✓ ${ok} retour(s) enregistré(s)${errors ? ` — ${errors} erreur(s)` : ""}`);
    playSound(errors === 0 ? "success" : "duplicate");
    setReturnQueue([]);
    setNotes("");
  }

  function removeFromQueue(tracking: string) {
    setReturnQueue((q) => q.filter((r) => r.tracking !== tracking));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    if (mode === "exit") handleExitScan();
    else handleReturnScan();
  }

  const feedbackColor =
    !result ? "" :
    result.isDuplicate ? "border-amber-400 bg-amber-50" :
    result.success     ? "border-green-400 bg-green-50" :
                         "border-red-400 bg-red-50";
  const feedbackIcon =
    !result ? null :
    result.isDuplicate ? <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" /> :
    result.success     ? <CheckCircle2  className="h-5 w-5 text-green-600 shrink-0" /> :
                         <XCircle       className="h-5 w-5 text-red-600 shrink-0" />;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Scanner</h1>
        <p className="text-sm text-muted-foreground mt-1">Scan expéditions et retours.</p>
      </div>

      {/* Mode switcher */}
      <div className="flex rounded-xl border bg-secondary/30 p-1 gap-1">
        {(["exit","return"] as Mode[]).map((m) => (
          <button key={m} type="button" onClick={() => switchMode(m)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
              mode === m
                ? m === "exit" ? "bg-indigo-600 text-white shadow-sm" : "bg-amber-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}>
            {m === "exit"
              ? <><Barcode className="h-4 w-4" /> Sortie</>
              : <><RotateCcw className="h-4 w-4" /> Retour {returnQueue.length > 0 && <span className="ml-1 bg-white/30 rounded-full px-1.5 text-xs">{returnQueue.length}</span>}</>}
          </button>
        ))}
      </div>

      {/* ── BIG SCAN INPUT ── */}
      <div className={cn(
        "rounded-xl border-2 bg-card p-4 space-y-3",
        mode === "exit" ? "border-indigo-200" : "border-amber-200"
      )}>
        <input
          ref={inputRef}
          type="text"
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={mode === "exit" ? "Scan sortie…" : "Scan retour…"}
          disabled={isPending}
          autoComplete="off"
          autoFocus
          className="flex w-full rounded-lg border-2 bg-background px-4 py-5 text-2xl font-mono tracking-widest placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary disabled:opacity-50 transition-colors"
        />
        <button
          type="button"
          onClick={mode === "exit" ? handleExitScan : handleReturnScan}
          disabled={isPending || !tracking.trim()}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-xl py-4 text-base font-bold transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed",
            mode === "exit"
              ? "bg-indigo-600 text-white hover:bg-indigo-700"
              : "bg-amber-600 text-white hover:bg-amber-700"
          )}>
          <ScanLine className="h-5 w-5" />
          {isPending ? "…" : mode === "exit" ? "Valider sortie" : "Ajouter à la liste"}
        </button>
      </div>

      {/* ── EXIT: instant feedback ── */}
      {mode === "exit" && result && (
        <div className={cn("flex items-center gap-3 rounded-xl border-2 px-4 py-3", feedbackColor)}>
          {feedbackIcon}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{result.message}</p>
            {result.orderId && <p className="text-xs text-muted-foreground">{result.orderNumber} — {result.customerName}</p>}
          </div>
        </div>
      )}

      {/* ── RETURN: queue list ── */}
      {mode === "return" && (
        <div className="space-y-3">

          {/* Queue */}
          {returnQueue.length > 0 && (
            <div className="rounded-xl border bg-card divide-y">
              <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/20">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {returnQueue.length} tracking(s) scanné(s)
                </span>
                <button type="button" onClick={() => setReturnQueue([])}
                  className="text-xs text-red-500 hover:text-red-700">Vider</button>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {returnQueue.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-secondary/10">
                    <span className="text-muted-foreground font-mono w-14 shrink-0">{r.time}</span>
                    <span className={cn("font-mono font-bold flex-1", r.status === "duplicate" ? "text-amber-600" : r.status === "error" ? "text-red-600" : "text-green-700")}>
                      {r.tracking}
                    </span>
                    {r.status === "duplicate" && <span className="text-amber-500 shrink-0">⚠ doublon</span>}
                    {r.status === "error"     && <span className="text-red-500 shrink-0">✕ erreur</span>}
                    <button type="button" onClick={() => removeFromQueue(r.tracking)}
                      className="text-muted-foreground hover:text-red-500 shrink-0">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Condition selector — only shown when queue has items */}
          {returnQueue.filter((r) => r.status === "ok").length > 0 && (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <p className="text-sm font-semibold">Condition pour tous les retours :</p>
              <div className="grid grid-cols-2 gap-2">
                {RETURN_CONDITIONS.map((c) => {
                  const col = RETURN_CONDITION_COLORS[c];
                  return (
                    <button key={c} type="button" onClick={() => setCondition(c)}
                      className={cn(
                        "rounded-lg px-3 py-2.5 text-sm font-medium border-2 transition-all",
                        condition === c
                          ? `${col.bg} ${col.text} border-current`
                          : "bg-background text-muted-foreground border-border hover:border-primary/40"
                      )}>
                      {RETURN_CONDITION_LABELS[c]}
                    </button>
                  );
                })}
              </div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optionnel)…" rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />

              <button type="button" onClick={handleConfirmAllReturns}
                disabled={isConfirming}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-600 text-white py-4 text-base font-bold hover:bg-amber-700 disabled:opacity-50 transition-colors">
                <Send className="h-5 w-5" />
                {isConfirming ? "Enregistrement…" : `Confirmer ${returnQueue.filter((r) => r.status === "ok").length} retour(s)`}
              </button>
            </div>
          )}

          {/* Confirm result */}
          {confirmResult && (
            <div className="flex items-center gap-2 rounded-xl border-2 border-green-400 bg-green-50 px-4 py-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <p className="font-semibold text-sm text-green-800">{confirmResult}</p>
            </div>
          )}
        </div>
      )}

      {/* ── EXIT HISTORY ── */}
      {mode === "exit" && exitHistory.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Historique ({exitHistory.length})</p>
          <div className="rounded-xl border bg-card divide-y max-h-56 overflow-y-auto">
            {exitHistory.map((h, idx) => (
              <div key={idx} className="flex items-center gap-3 px-4 py-2 text-xs">
                <span className="text-muted-foreground font-mono w-14 shrink-0">{h.time}</span>
                <span className="font-mono font-medium flex-1 truncate">{h.trackingNumber}</span>
                {h.isDuplicate
                  ? <span className="text-amber-600 font-medium shrink-0">⚠ Doublon</span>
                  : h.success
                  ? <span className="text-green-600 font-medium shrink-0">✓</span>
                  : <span className="text-red-600 font-medium shrink-0">✕</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
