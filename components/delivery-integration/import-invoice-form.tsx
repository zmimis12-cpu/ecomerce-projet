"use client";
/**
 * Import Digylog invoice (BL, BR, BLFC, BRFC, Facture de paiement) via CSV paste or file upload.
 * Parses the CSV and calls importDigylogInvoice server action.
 */
import { useState, useTransition } from "react";
import { Upload, X, CheckCircle, AlertTriangle } from "lucide-react";
import { importDigylogInvoice } from "@/lib/delivery/reconciliation-actions";
import { parseDigylogCsv } from "@/lib/delivery/reconciliation-utils";

type DocType = "BL" | "BR" | "BLFC" | "BRFC" | "FACTURE";

export function ImportInvoiceForm({ onSuccess }: { onSuccess?: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [csvText, setCsvText]         = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate]     = useState(new Date().toISOString().slice(0, 10));
  const [docType, setDocType]             = useState<DocType>("FACTURE");
  const [msg, setMsg]                     = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview]             = useState<number>(0);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Handle Excel files
    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const XLSX = await import("xlsx");
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
          setCsvText(csv);
          const rows = parseDigylogCsv(csv);
          setPreview(rows.length);
        } catch {
          setMsg({ ok: false, text: "Erreur lecture Excel. Essayez CSV." });
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    // Handle CSV
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      const rows = parseDigylogCsv(text);
      setPreview(rows.length);
    };
    reader.readAsText(file, "UTF-8");
  }

  function handleCsvChange(text: string) {
    setCsvText(text);
    const rows = parseDigylogCsv(text);
    setPreview(rows.length);
  }

  function handleImport() {
    if (!csvText.trim()) { setMsg({ ok: false, text: "Collez ou uploadez un fichier CSV." }); return; }
    if (!invoiceNumber.trim()) { setMsg({ ok: false, text: "Numéro de facture requis." }); return; }

    const rows = parseDigylogCsv(csvText);
    if (!rows.length) { setMsg({ ok: false, text: "Aucune ligne détectée. Vérifiez le format CSV." }); return; }

    setMsg(null);
    startTransition(async () => {
      const res = await importDigylogInvoice({
        invoiceNumber,
        invoiceDate,
        documentType: docType,
        rows,
      });
      if (res.success) {
        setMsg({ ok: true, text: `✓ ${res.imported} lignes importées — Facture ${invoiceNumber}` });
        setCsvText("");
        setPreview(0);
        onSuccess?.();
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setMsg({ ok: false, text: res.error ?? "Erreur import." });
      }
    });
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <h3 className="font-semibold text-sm">Importer une facture Digylog</h3>

      {/* Doc type + Invoice number + Date */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1">Type de document</label>
          <select value={docType} onChange={(e) => setDocType(e.target.value as DocType)}
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="FACTURE">Facture de paiement</option>
            <option value="BL">BL (Bon de Livraison)</option>
            <option value="BR">BR (Bon de Ramassage)</option>
            <option value="BLFC">BLFC</option>
            <option value="BRFC">BRFC</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1">N° Facture / BL</label>
          <input type="text" value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="ex: 863225 ou FAC-2026-001"
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1">Date</label>
          <input type="date" value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>

      {/* File upload */}
      <div>
        <label className="text-xs text-muted-foreground font-medium block mb-1">
          Fichier CSV (export Digylog)
        </label>
        <label className="flex items-center gap-2 cursor-pointer rounded-lg border-2 border-dashed px-4 py-3 hover:bg-secondary/20 transition-colors text-sm text-muted-foreground">
          <Upload className="h-4 w-4 shrink-0" />
          <span>Cliquez pour uploader un fichier CSV</span>
          <input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
        </label>
      </div>

      {/* Or paste CSV */}
      <div>
        <label className="text-xs text-muted-foreground font-medium block mb-1">
          Ou collez le contenu CSV directement
        </label>
        <textarea
          value={csvText}
          onChange={(e) => handleCsvChange(e.target.value)}
          placeholder={"tracking;statut;cod;frais;retour;net;ville\nS07EC98BC;livré;260;20;0;240;Casablanca"}
          rows={6}
          className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
        {preview > 0 && (
          <p className="text-xs text-emerald-600 mt-1 font-medium">
            ✓ {preview} ligne(s) détectée(s) prêtes à importer
          </p>
        )}
      </div>

      {/* Format hint */}
      <div className="rounded-lg bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
        <strong>Colonnes CSV attendues (ordre flexible) :</strong>
        {" "}tracking · statut · cod · frais · retour · net · ville · bl · commande
        <br />Séparateur : <code>;</code> ou <code>,</code>
      </div>

      {/* Message */}
      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
          msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
        }`}>
          {msg.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      {/* Import button */}
      <button type="button" onClick={handleImport} disabled={isPending || !csvText.trim()}
        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
        <Upload className="h-4 w-4" />
        {isPending ? "Import en cours…" : `Importer ${preview > 0 ? `(${preview} lignes)` : ""}`}
      </button>
    </div>
  );
}
