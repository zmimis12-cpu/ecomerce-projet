"use client";
/**
 * Ultra-fast scanner client.
 *
 * OUTGOING: async queue — input never freezes, fire-and-forget backend
 * RETURN:   scan all → validate BR → build queue → process conditions at end
 */
import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import {
  scanOutgoing,
  scanReturn_addToQueue,
  getPendingReturns,
  processReturnCondition,
  importDigylogBR,
  getActiveBRs,
} from "@/lib/scanner/fast-actions";
import type { FastScanResult, ReturnScanResult, PendingReturn } from "@/lib/scanner/fast-actions";
import { RETURN_CONDITIONS, RETURN_CONDITION_LABELS, RETURN_CONDITION_COLORS } from "@/types/scanner";
import type { ReturnCondition } from "@/types/scanner";
import { playSound } from "./scanner-sounds";
import { cn } from "@/lib/utils";
import {
  ScanLine, Barcode, RotateCcw, CheckCircle2, AlertTriangle,
  XCircle, ChevronRight, Package, Upload, List, Minus, Plus,
} from "lucide-react";

type Mode = "exit" | "return";
type ScanRow = { tracking: string; msg: string; code: string; time: string };

export function ScannerClient() {
  const [mode, setMode]              = useState<Mode>("exit");
  const inputRef                     = useRef<HTMLInputElement>(null);
  const [input, setInput]            = useState("");
  const [rows, setRows]              = useState<ScanRow[]>([]);   // unified history
  const [returnCount, setReturnCount]= useState(0);              // BR-validated returns
  const [showReturnQueue, setShowReturnQueue] = useState(false);

  // Return processing
  const [pendingReturns, setPendingReturns] = useState<PendingReturn[]>([]);
  const [activeReturn, setActiveReturn]    = useState<PendingReturn | null>(null);
  const [condition, setCondition]          = useState<ReturnCondition>("good");
  const [procNotes, setProcNotes]          = useState("");
  const [partialQtys, setPartialQtys]      = useState<Record<string, number>>({});
  const [isProcPending, startProcTransition] = useTransition();

  // BR import
  const [showBRImport, setShowBRImport]  = useState(false);
  const [brNumber, setBrNumber]          = useState("");
  const [brText, setBrText]              = useState("");
  const [activeBRs, setActiveBRs]        = useState<{ id: string; br_number: string; count: number; imported_at: string }[]>([]);
  const [isBRPending, startBRTransition] = useTransition();

  // Always focused
  useEffect(() => { inputRef.current?.focus(); }, [mode]);
  useEffect(() => { loadActiveBRs(); }, []);

  async function loadActiveBRs() {
    const brs = await getActiveBRs();
    setActiveBRs(brs);
  }

  async function loadPendingReturns() {
    const list = await getPendingReturns();
    setPendingReturns(list);
    if (list.length > 0 && !activeReturn) setActiveReturn(list[0]);
  }

  function switchMode(m: Mode) {
    if (m === mode) return;
    setMode(m);
    setInput("");
    setRows([]);
    if (m === "return") loadActiveBRs();
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function addRow(r: ScanRow) {
    setRows((prev) => [r, ...prev.slice(0, 99)]);
  }

  // ── OUTGOING — ultra fast ─────────────────────────────────────────────────
  const handleExitScan = useCallback(async () => {
    const snap = input.trim().toUpperCase();
    if (!snap) return;
    setInput("");                             // instant clear
    inputRef.current?.focus();               // instant refocus

    // Optimistic row
    const time = new Date().toLocaleTimeString("fr-MA");
    addRow({ tracking: snap, msg: "⏳ En cours…", code: "pending", time });

    const res: FastScanResult = await scanOutgoing(snap);

    if (res.code === "duplicate") playSound("duplicate");
    else if (res.ok)              playSound("success");
    else                          playSound("error");

    // Update the optimistic row
    setRows((prev) => prev.map((r) =>
      r.tracking === snap && r.code === "pending"
        ? { ...r, msg: res.msg, code: res.code }
        : r
    ));
  }, [input]);

  // ── RETURN — validate BR + queue ─────────────────────────────────────────
  const handleReturnScan = useCallback(async () => {
    const snap = input.trim().toUpperCase();
    if (!snap) return;
    setInput("");
    inputRef.current?.focus();

    const time = new Date().toLocaleTimeString("fr-MA");
    addRow({ tracking: snap, msg: "⏳ Vérification BR…", code: "pending", time });

    const res: ReturnScanResult = await scanReturn_addToQueue(snap);

    if (res.code === "duplicate")  playSound("duplicate");
    else if (res.code === "queued") { playSound("success"); setReturnCount((c) => c + 1); }
    else                            playSound("error");

    setRows((prev) => prev.map((r) =>
      r.tracking === snap && r.code === "pending"
        ? { ...r, msg: res.msg, code: res.code }
        : r
    ));
  }, [input]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    if (mode === "exit") handleExitScan();
    else handleReturnScan();
  }

  // ── Process return condition ──────────────────────────────────────────────
  async function handleProcessReturn() {
    if (!activeReturn) return;
    startProcTransition(async () => {
      const res = await processReturnCondition(activeReturn.id, condition, procNotes, partialQtys);
      if (res.ok) {
        playSound("success");
        const remaining = pendingReturns.filter((r) => r.id !== activeReturn.id);
        setPendingReturns(remaining);
        setActiveReturn(remaining[0] ?? null);
        setPartialQtys({});
        setProcNotes("");
        setReturnCount((c) => Math.max(0, c - 1));
      } else {
        playSound("error");
      }
    });
  }

  // ── BR Import ─────────────────────────────────────────────────────────────
  function handleImportBR() {
    const trackings = brText.split(/[\n,;]/).map((t) => t.trim().toUpperCase()).filter(Boolean);
    if (!brNumber || !trackings.length) return;
    startBRTransition(async () => {
      const res = await importDigylogBR({ brNumber, trackingNumbers: trackings });
      if (res.ok) {
        playSound("success");
        setBrNumber(""); setBrText("");
        setShowBRImport(false);
        loadActiveBRs();
      }
    });
  }

  function adjustQty(productId: string, delta: number, max: number) {
    setPartialQtys((prev) => ({ ...prev, [productId]: Math.max(0, Math.min(max, (prev[productId] ?? max) + delta)) }));
  }

  function openReturnQueue() {
    loadPendingReturns();
    setShowReturnQueue(true);
  }

  // ── Row color ─────────────────────────────────────────────────────────────
  function rowColor(code: string) {
    if (code === "success" || code === "queued") return "text-green-700";
    if (code === "duplicate")                    return "text-amber-600";
    if (code === "pending")                      return "text-muted-foreground";
    return "text-red-600";
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Scanner</h1>
          <p className="text-sm text-muted-foreground">Scan entrepôt ultra-rapide.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowBRImport(true)}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-secondary transition-colors">
            <Upload className="h-3.5 w-3.5" /> Importer BR
          </button>
          {mode === "return" && returnCount > 0 && (
            <button type="button" onClick={openReturnQueue}
              className="flex items-center gap-1.5 rounded-lg bg-amber-600 text-white px-3 py-2 text-xs font-bold hover:bg-amber-700 transition-colors">
              <List className="h-3.5 w-3.5" /> Traiter retours ({returnCount})
            </button>
          )}
        </div>
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
              : <><RotateCcw className="h-4 w-4" /> Retour {returnCount > 0 && <span className="ml-1 rounded-full bg-white/25 px-1.5 text-xs">{returnCount}</span>}</>}
          </button>
        ))}
      </div>

      {/* Active BRs */}
      {mode === "return" && activeBRs.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {activeBRs.map((br) => (
            <span key={br.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-1 text-xs font-semibold">
              ✓ BR {br.br_number} — {br.count} trackings
            </span>
          ))}
        </div>
      )}

      {/* ── BIG SCAN INPUT ── */}
      <div className={cn("rounded-xl border-2 bg-card p-4", mode === "exit" ? "border-indigo-200" : "border-amber-200")}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={mode === "exit" ? "Scan sortie…" : "Scan retour…"}
          autoComplete="off"
          autoFocus
          className="flex w-full rounded-lg border-2 bg-background px-4 py-5 text-2xl font-mono tracking-widest placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors"
        />
        <p className="text-xs text-muted-foreground mt-2 text-center">
          {mode === "exit" ? "Appuyez Enter ou scannez pour valider la sortie" : "Scannez tous les retours — validation BR automatique"}
        </p>
      </div>

      {/* Scan counter */}
      {rows.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground px-1">
          <span className="font-semibold">{rows.filter((r) => r.code === "success" || r.code === "queued").length} OK</span>
          <span>{rows.filter((r) => r.code === "duplicate").length} doublons</span>
          <span>{rows.filter((r) => r.code === "not_found" || r.code === "not_in_br" || r.code === "blocked").length} erreurs</span>
          <span className="ml-auto">{rows.length} total</span>
        </div>
      )}

      {/* Scan history */}
      {rows.length > 0 && (
        <div className="rounded-xl border bg-card divide-y max-h-72 overflow-y-auto">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2 text-xs">
              <span className="text-muted-foreground font-mono w-14 shrink-0">{r.time}</span>
              <span className="font-mono font-bold shrink-0 w-28 truncate">{r.tracking}</span>
              <span className={cn("flex-1 truncate", rowColor(r.code))}>{r.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── RETURN PROCESSING SIDEBAR / MODAL ── */}
      {showReturnQueue && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowReturnQueue(false)} />
          <div className="relative ml-auto w-full max-w-md bg-background h-full flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-card">
              <div>
                <p className="font-semibold">Traitement retours</p>
                <p className="text-xs text-muted-foreground">{pendingReturns.length} en attente</p>
              </div>
              <button type="button" onClick={() => setShowReturnQueue(false)}
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary">Fermer</button>
            </div>

            {pendingReturns.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
                <p className="font-medium">Tous les retours traités !</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* List of pending */}
                <div className="flex gap-2 flex-wrap">
                  {pendingReturns.map((pr) => (
                    <button key={pr.id} type="button"
                      onClick={() => { setActiveReturn(pr); setPartialQtys({}); }}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-mono font-medium transition-colors",
                        activeReturn?.id === pr.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                      )}>
                      {pr.tracking}
                    </button>
                  ))}
                </div>

                {/* Active return detail */}
                {activeReturn && (
                  <div className="space-y-4">
                    <div className="rounded-xl border bg-card p-4">
                      <p className="font-semibold">{activeReturn.orderNumber}</p>
                      <p className="text-sm text-muted-foreground">{activeReturn.customerName}</p>
                      {activeReturn.brNumber && (
                        <span className="inline-flex mt-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs font-semibold">
                          BR {activeReturn.brNumber}
                        </span>
                      )}
                    </div>

                    {/* Products */}
                    {activeReturn.items.map((item) => (
                      <div key={item.product_id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                        {item.image_url
                          ? <img src={item.image_url} alt={item.product_name} className="h-12 w-12 rounded object-cover border shrink-0" />
                          : <div className="h-12 w-12 rounded bg-secondary flex items-center justify-center shrink-0"><Package className="h-6 w-6 text-muted-foreground" /></div>}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.product_name}</p>
                          <p className="text-xs text-muted-foreground">Expédié: {item.quantity}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button type="button" onClick={() => adjustQty(item.product_id, -1, item.quantity)}
                            className="h-7 w-7 rounded border flex items-center justify-center hover:bg-secondary"><Minus className="h-3 w-3" /></button>
                          <span className="w-7 text-center font-bold text-sm">{partialQtys[item.product_id] ?? item.quantity}</span>
                          <button type="button" onClick={() => adjustQty(item.product_id, 1, item.quantity)}
                            className="h-7 w-7 rounded border flex items-center justify-center hover:bg-secondary"><Plus className="h-3 w-3" /></button>
                        </div>
                      </div>
                    ))}

                    {/* Condition */}
                    <div className="grid grid-cols-2 gap-2">
                      {RETURN_CONDITIONS.map((c) => {
                        const col = RETURN_CONDITION_COLORS[c];
                        return (
                          <button key={c} type="button" onClick={() => setCondition(c)}
                            className={cn(
                              "rounded-lg px-3 py-2.5 text-sm font-medium border-2 transition-all",
                              condition === c ? `${col.bg} ${col.text} border-current` : "bg-background text-muted-foreground border-border hover:border-primary/40"
                            )}>
                            {RETURN_CONDITION_LABELS[c]}
                          </button>
                        );
                      })}
                    </div>

                    <textarea value={procNotes} onChange={(e) => setProcNotes(e.target.value)}
                      placeholder="Notes…" rows={2}
                      className="flex w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />

                    <button type="button" onClick={handleProcessReturn} disabled={isProcPending}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-600 text-white py-4 text-base font-bold hover:bg-amber-700 disabled:opacity-50 transition-colors">
                      <ChevronRight className="h-5 w-5" />
                      {isProcPending ? "Traitement…" : "Valider retour → suivant"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── BR IMPORT MODAL ── */}
      {showBRImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowBRImport(false)} />
          <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="font-semibold text-lg">Importer BR Digylog</h2>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">N° BR</label>
              <input type="text" value={brNumber} onChange={(e) => setBrNumber(e.target.value)}
                placeholder="ex: BR-2026-001"
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Trackings (un par ligne, ou séparés par virgule/;)
              </label>
              <textarea value={brText} onChange={(e) => setBrText(e.target.value)}
                placeholder={"S07EC98BC\nS1FF214BC\nS2322DBFC"} rows={8}
                className="w-full rounded-lg border px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              {brText && <p className="text-xs text-emerald-600 mt-1">
                {brText.split(/[\n,;]/).map((t) => t.trim()).filter(Boolean).length} trackings détectés
              </p>}
            </div>

            {/* Active BRs */}
            {activeBRs.length > 0 && (
              <div className="rounded-lg bg-secondary/30 px-3 py-2 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">BRs actifs :</p>
                {activeBRs.map((br) => (
                  <p key={br.id} className="text-xs text-muted-foreground">• BR {br.br_number} — {br.count} trackings</p>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={() => setShowBRImport(false)}
                className="flex-1 rounded-xl border py-3 text-sm font-medium hover:bg-secondary transition-colors">
                Annuler
              </button>
              <button type="button" onClick={handleImportBR} disabled={isBRPending || !brNumber || !brText}
                className="flex-1 rounded-xl bg-primary text-primary-foreground py-3 text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity">
                {isBRPending ? "Import…" : "Importer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
