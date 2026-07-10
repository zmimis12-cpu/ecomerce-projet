"use client";
import { useState, useTransition } from "react";
import { Upload, X, CheckCircle } from "lucide-react";
import { importDigylogDocument } from "@/lib/delivery/digylog/document-service";
import { parseDocumentCsv } from "@/lib/delivery/digylog/document-utils";
import type { DigylogDocType } from "@/lib/delivery/digylog/document-service";

const DOC_TYPES: { value: DigylogDocType; label: string }[] = [
  { value: "BL",              label: "BL — Bon de Livraison" },
  { value: "BR",              label: "BR — Bon de Retour" },
  { value: "RAMASSAGE",       label: "Bon de Ramassage" },
  { value: "BLFC",            label: "BLFC" },
  { value: "BRFC",            label: "BRFC" },
  { value: "PAYMENT_INVOICE", label: "Facture de paiement" },
  { value: "REFUND",          label: "Remboursement" },
  { value: "OTHER",           label: "Autre" },
];

export function ImportDocumentForm({ onSuccess }: { onSuccess?: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [docType, setDocType]    = useState<DigylogDocType>("BL");
  const [docNumber, setDocNumber]= useState("");
  const [docDate, setDocDate]    = useState(new Date().toISOString().slice(0, 10));
  const [csvText, setCsvText]    = useState("");
  const [notes, setNotes]        = useState("");
  const [preview, setPreview]    = useState(0);
  const [msg, setMsg]            = useState<{ ok: boolean; text: string } | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      setPreview(parseDocumentCsv(text).length);
    };
    reader.readAsText(file, "UTF-8");
  }

  function handleCsvChange(text: string) {
    setCsvText(text);
    setPreview(parseDocumentCsv(text).length);
  }

  function handleImport() {
    if (!csvText.trim()) { setMsg({ ok: false, text: "Collez ou uploadez un CSV." }); return; }
    if (!docNumber.trim()) { setMsg({ ok: false, text: "Numéro de document requis." }); return; }
    const lines = parseDocumentCsv(csvText);
    if (!lines.length) { setMsg({ ok: false, text: "Aucune ligne détectée — vérifiez le format." }); return; }

    setMsg(null);
    startTransition(async () => {
      const res = await importDigylogDocument({
        documentType:   docType,
        documentNumber: docNumber,
        documentDate:   docDate || undefined,
        lines,
        notes:          notes || undefined,
      });
      if (res.success) {
        setMsg({ ok: true, text: `✓ ${res.imported} lignes importées — ${res.matched} matchées` });
        setCsvText(""); setPreview(0);
        onSuccess?.();
        setTimeout(() => window.location.reload(), 800);
      } else {
        setMsg({ ok: false, text: res.error ?? "Erreur import." });
      }
    });
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <h3 className="font-semibold text-sm">Importer un document Digylog</h3>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1">Type</label>
          <select value={docType} onChange={(e) => setDocType(e.target.value as DigylogDocType)}
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1">Numéro</label>
          <input type="text" value={docNumber} onChange={(e) => setDocNumber(e.target.value)}
            placeholder="ex: 863225 ou BR-001"
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1">Date</label>
          <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)}
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Optionnel…"
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer rounded-lg border-2 border-dashed px-4 py-3 hover:bg-secondary/20 transition-colors text-sm text-muted-foreground">
        <Upload className="h-4 w-4 shrink-0" />
        <span>Uploader un fichier CSV</span>
        <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
      </label>

      <div>
        <label className="text-xs text-muted-foreground font-medium block mb-1">Ou coller le contenu CSV</label>
        <textarea value={csvText} onChange={(e) => handleCsvChange(e.target.value)}
          placeholder={"tracking;cod;frais;retour;net;ville;statut\nS07EC98BC;260;20;0;240;Casablanca;livré"}
          rows={5}
          className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
        {preview > 0 && <p className="text-xs text-emerald-600 mt-1 font-medium">✓ {preview} ligne(s) détectée(s)</p>}
      </div>

      <div className="rounded-lg bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
        <strong>Colonnes CSV (ordre flexible) :</strong>{" "}
        tracking · cod · frais · retour · net · ville · statut
        <br />Séparateur : <code>;</code> ou <code>,</code>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {msg.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      <button type="button" onClick={handleImport} disabled={isPending || !csvText.trim()}
        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
        <Upload className="h-4 w-4" />
        {isPending ? "Import…" : `Importer${preview > 0 ? ` (${preview} lignes)` : ""}`}
      </button>
    </div>
  );
}
