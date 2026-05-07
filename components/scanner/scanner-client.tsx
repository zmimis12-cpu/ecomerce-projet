"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import { scanExit, scanReturn, fetchOrderForReturn } from "@/lib/scanner/actions";
import { RETURN_CONDITIONS, RETURN_CONDITION_LABELS, RETURN_CONDITION_COLORS } from "@/types/scanner";
import type { ReturnCondition, ScanResult, ScanOrderItem } from "@/types/scanner";
import { playSound } from "./scanner-sounds";
import { cn } from "@/lib/utils";
import { ScanLine, Barcode, RotateCcw, CheckCircle2, AlertTriangle, XCircle, Package, Minus, Plus } from "lucide-react";

type Mode = "exit" | "return";

export function ScannerClient() {
  const [mode, setMode]               = useState<Mode>("exit");
  const inputRef                      = useRef<HTMLInputElement>(null);
  const [tracking, setTracking]       = useState("");
  const [condition, setCondition]     = useState<ReturnCondition>("good");
  const [notes, setNotes]             = useState("");
  const [isPending, startTransition]  = useTransition();
  const [result, setResult]           = useState<ScanResult | null>(null);
  const [history, setHistory]         = useState<(ScanResult & { time: string; mode: Mode })[]>([]);

  // Return mode: fetched order data before confirmation
  const [orderPreview, setOrderPreview] = useState<{
    order: { id: string; order_number: string; customer_name: string; status: string };
    items: ScanOrderItem[];
    trackingSnap: string;
  } | null>(null);
  const [partialQtys, setPartialQtys] = useState<Record<string, number>>({});
  const [isFetching, setIsFetching]   = useState(false);

  useEffect(() => { setResult(null); setTracking(""); setOrderPreview(null); setPartialQtys({}); setTimeout(() => inputRef.current?.focus(), 0); }, [mode]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  function switchMode(newMode: Mode) { if (newMode !== mode) setMode(newMode); }

  // ── EXIT MODE: scan directly ──────────────────────────────────────────────
  function handleExitScan() {
    if (!tracking.trim() || isPending) return;
    const snap = tracking;
    startTransition(async () => {
      const res = await scanExit(snap);
      if (res.isDuplicate) playSound("duplicate");
      else if (res.success) playSound("success");
      else playSound("error");
      setResult(res);
      setHistory((h) => [{ ...res, time: new Date().toLocaleTimeString("fr-MA"), mode }, ...h.slice(0, 29)]);
      setTracking("");
      setTimeout(() => inputRef.current?.focus(), 50);
    });
  }

  // ── RETURN MODE: fetch first, then show products ──────────────────────────
  function handleReturnFetch() {
    if (!tracking.trim() || isFetching) return;
    const snap = tracking;
    setIsFetching(true);
    startTransition(async () => {
      const res = await fetchOrderForReturn(snap);
      setIsFetching(false);
      if (!res.found || res.alreadyReturned) {
        const fakeResult: ScanResult = {
          success: res.alreadyReturned, isDuplicate: res.alreadyReturned,
          orderId: res.order?.id ?? null, orderNumber: res.order?.order_number ?? null,
          customerName: res.order?.customer_name ?? null, trackingNumber: snap, message: res.message,
        };
        if (res.alreadyReturned) playSound("duplicate"); else playSound("error");
        setResult(fakeResult);
        setTracking("");
        setTimeout(() => inputRef.current?.focus(), 50);
        return;
      }
      // Show product preview
      setOrderPreview({ order: res.order!, items: res.items ?? [], trackingSnap: snap });
      const initQtys: Record<string, number> = {};
      for (const item of res.items ?? []) initQtys[item.product_id] = item.quantity;
      setPartialQtys(initQtys);
      setTracking("");
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    if (mode === "exit") handleExitScan();
    else if (!orderPreview) handleReturnFetch();
  }

  function adjustPartialQty(productId: string, delta: number, max: number) {
    setPartialQtys((prev) => ({ ...prev, [productId]: Math.max(0, Math.min(max, (prev[productId] ?? max) + delta)) }));
  }

  // ── Confirm return after preview ──────────────────────────────────────────
  function handleConfirmReturn() {
    if (!orderPreview || isPending) return;
    startTransition(async () => {
      const res = await scanReturn(orderPreview.trackingSnap, condition, notes, partialQtys);
      if (res.isDuplicate) playSound("duplicate");
      else if (res.success) playSound("success");
      else playSound("error");
      setResult(res);
      setHistory((h) => [{ ...res, time: new Date().toLocaleTimeString("fr-MA"), mode }, ...h.slice(0, 29)]);
      setOrderPreview(null);
      setPartialQtys({});
      setNotes("");
      setTimeout(() => inputRef.current?.focus(), 50);
    });
  }

  function cancelPreview() { setOrderPreview(null); setPartialQtys({}); setTimeout(() => inputRef.current?.focus(), 50); }

  const feedbackColor =
    !result ? "" :
    result.isDuplicate ? "border-amber-400 bg-amber-50" :
    result.success ? "border-green-400 bg-green-50" :
    "border-red-400 bg-red-50";
  const feedbackIcon =
    !result ? null :
    result.isDuplicate ? <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" /> :
    result.success ? <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" /> :
    <XCircle className="h-6 w-6 text-red-600 shrink-0" />;

  return (
    <div className="max-w-xl mx-auto space-y-5">
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
            {m === "exit" ? <><Barcode className="h-4 w-4" /> Sortie</> : <><RotateCcw className="h-4 w-4" /> Retour</>}
          </button>
        ))}
      </div>

      {/* Mode label */}
      <div className={cn("flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold",
        mode === "exit" ? "bg-indigo-50 text-indigo-800" : "bg-amber-50 text-amber-800")}>
        {mode === "exit"
          ? <><Barcode className="h-4 w-4" /> Mode Sortie — Scan expédition</>
          : <><RotateCcw className="h-4 w-4" /> Mode Retour — Scan réception</>}
      </div>

      {/* ── RETURN PRODUCT PREVIEW ── */}
      {orderPreview && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50/50 p-5 space-y-4">
          <div>
            <p className="font-bold text-base">{orderPreview.order.order_number}</p>
            <p className="text-sm text-muted-foreground">{orderPreview.order.customer_name}</p>
          </div>

          {/* Products */}
          <div className="space-y-3">
            {orderPreview.items.map((item) => (
              <div key={item.product_id} className="flex items-center gap-3 rounded-lg bg-white border p-3">
                {item.image_url
                  ? <img src={item.image_url} alt={item.product_name} className="h-12 w-12 rounded object-cover border shrink-0" />
                  : <div className="h-12 w-12 rounded bg-secondary flex items-center justify-center shrink-0"><Package className="h-6 w-6 text-muted-foreground" /></div>}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.product_name}</p>
                  <p className="text-xs text-muted-foreground">{item.product_sku}</p>
                  <p className="text-xs text-muted-foreground">Expédié: {item.quantity}</p>
                </div>
                {/* Partial qty selector */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={() => adjustPartialQty(item.product_id, -1, item.quantity)}
                    className="h-7 w-7 rounded-md border bg-white flex items-center justify-center hover:bg-secondary transition-colors">
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-8 text-center font-bold text-sm">{partialQtys[item.product_id] ?? item.quantity}</span>
                  <button type="button" onClick={() => adjustPartialQty(item.product_id, 1, item.quantity)}
                    className="h-7 w-7 rounded-md border bg-white flex items-center justify-center hover:bg-secondary transition-colors">
                    <Plus className="h-3 w-3" />
                  </button>
                  <span className="text-xs text-muted-foreground">/ {item.quantity}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Condition */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Condition *</p>
            <div className="grid grid-cols-2 gap-2">
              {RETURN_CONDITIONS.map((c) => {
                const col = RETURN_CONDITION_COLORS[c];
                return (
                  <button key={c} type="button" onClick={() => setCondition(c)}
                    className={cn("rounded-lg px-3 py-2.5 text-sm font-medium border-2 transition-all",
                      condition === c ? `${col.bg} ${col.text} border-current` : "bg-white text-muted-foreground border-border hover:border-primary/40")}>
                    {RETURN_CONDITION_LABELS[c]}
                  </button>
                );
              })}
            </div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optionnel)…" rows={2}
              className="flex w-full rounded-md border border-input bg-white px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>

          {/* Confirm / Cancel */}
          <div className="flex gap-2">
            <button type="button" onClick={cancelPreview}
              className="flex-1 rounded-xl border py-3 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">
              Annuler
            </button>
            <button type="button" onClick={handleConfirmReturn} disabled={isPending}
              className="flex-1 bg-amber-600 text-white rounded-xl py-3 text-sm font-bold hover:bg-amber-700 disabled:opacity-50 transition-colors">
              {isPending ? "Traitement…" : "Confirmer retour"}
            </button>
          </div>
        </div>
      )}

      {/* ── SCAN INPUT (hidden when preview shown) ── */}
      {!orderPreview && (
        <div className="rounded-xl border-2 border-primary/30 bg-card p-5 space-y-4">
          <input ref={inputRef} type="text" value={tracking}
            onChange={(e) => setTracking(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Scannez ou tapez le numéro de suivi…"
            disabled={isPending || isFetching} autoComplete="off"
            className="flex w-full rounded-lg border-2 bg-background px-4 py-4 text-xl font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary disabled:opacity-50 transition-colors" />

          <button type="button"
            onClick={mode === "exit" ? handleExitScan : handleReturnFetch}
            disabled={isPending || isFetching || !tracking.trim()}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-xl py-4 text-base font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
              mode === "exit" ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-amber-600 text-white hover:bg-amber-700"
            )}>
            <ScanLine className="h-5 w-5" />
            {isPending || isFetching ? "Traitement…" : mode === "exit" ? "Enregistrer sortie" : "Vérifier commande"}
          </button>
        </div>
      )}

      {/* Feedback */}
      {result && (
        <div className={cn("flex items-start gap-3 rounded-xl border-2 px-5 py-4", feedbackColor)}>
          {feedbackIcon}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base">{result.message}</p>
            {result.orderId && (
              <p className="text-sm text-muted-foreground mt-0.5">{result.orderNumber} — {result.customerName}</p>
            )}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Historique ({history.length})</p>
          <div className="rounded-xl border bg-card divide-y max-h-56 overflow-y-auto">
            {history.map((h, idx) => (
              <div key={idx} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                <span className="text-muted-foreground font-mono w-16 shrink-0">{h.time}</span>
                <span className={cn("text-xs rounded px-1.5 py-0.5 font-medium shrink-0",
                  h.mode === "exit" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700")}>
                  {h.mode === "exit" ? "Sortie" : "Retour"}
                </span>
                <span className="font-mono font-medium flex-1 truncate">{h.trackingNumber}</span>
                {h.isDuplicate ? <span className="text-amber-600 font-medium shrink-0">⚠ Doublon</span>
                  : h.success ? <span className="text-green-600 font-medium shrink-0">✓</span>
                  : <span className="text-red-600 font-medium shrink-0">✕</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
