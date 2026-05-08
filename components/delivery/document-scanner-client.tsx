"use client";
import { useState, useRef, useCallback } from "react";
import { scanDocumentLine } from "@/lib/delivery/digylog/document-service";
import { cn } from "@/lib/utils";
import { ScanLine, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

type ScanRow = { tracking: string; status: "scanned" | "unexpected" | "duplicate" | "error"; msg: string; time: string };

export function DocumentScannerClient({ documentId }: { documentId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput]   = useState("");
  const [rows, setRows]     = useState<ScanRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleScan = useCallback(async () => {
    const snap = input.trim().toUpperCase();
    if (!snap || isProcessing) return;
    setInput("");
    inputRef.current?.focus();

    // Optimistic row
    const time = new Date().toLocaleTimeString("fr-MA");
    setRows((prev) => [{ tracking: snap, status: "scanned", msg: "⏳…", time }, ...prev]);

    setIsProcessing(true);
    const res = await scanDocumentLine(documentId, snap);
    setIsProcessing(false);

    setRows((prev) => prev.map((r) =>
      r.tracking === snap && r.msg === "⏳…"
        ? { ...r, status: res.status, msg: res.msg }
        : r
    ));
  }, [input, documentId, isProcessing]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleScan();
  }

  const rowColor = (s: ScanRow["status"]) =>
    s === "scanned"    ? "text-green-700" :
    s === "duplicate"  ? "text-amber-600" :
    "text-red-600";

  const rowIcon = (s: ScanRow["status"]) =>
    s === "scanned"   ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" /> :
    s === "duplicate" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" /> :
                        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input ref={inputRef} type="text" value={input}
          onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="Scannez un tracking…" autoFocus autoComplete="off"
          className="flex-1 rounded-lg border-2 bg-background px-4 py-3 text-lg font-mono tracking-widest focus:outline-none focus:border-amber-500 transition-colors" />
        <button type="button" onClick={handleScan} disabled={!input.trim()}
          className="flex items-center gap-2 rounded-lg bg-amber-600 text-white px-4 py-2 font-medium hover:bg-amber-700 disabled:opacity-40 transition-colors">
          <ScanLine className="h-4 w-4" />
          Valider
        </button>
      </div>

      {rows.length > 0 && (
        <div className="rounded-lg border bg-white divide-y max-h-48 overflow-y-auto">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs">
              <span className="text-muted-foreground font-mono w-14 shrink-0">{r.time}</span>
              {rowIcon(r.status)}
              <span className={cn("font-mono font-bold shrink-0 w-28", rowColor(r.status))}>{r.tracking}</span>
              <span className={cn("flex-1 truncate", rowColor(r.status))}>{r.msg}</span>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex gap-4 text-xs text-muted-foreground px-1">
          <span className="text-green-600 font-semibold">{rows.filter((r) => r.status === "scanned").length} scannés</span>
          <span className="text-red-600">{rows.filter((r) => r.status === "unexpected").length} inattendus</span>
          <span className="text-amber-600">{rows.filter((r) => r.status === "duplicate").length} doublons</span>
        </div>
      )}
    </div>
  );
}
