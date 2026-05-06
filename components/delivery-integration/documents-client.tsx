"use client";
import { useState, useTransition } from "react";
import { FileDown, Loader2, CheckCircle2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBlPdfByBlId } from "@/lib/delivery/document-actions";

type BLDoc = {
  id: string; batch_number: string; bl_id: number;
  store_name: string | null; total_orders: number;
  status: string; payment_status: string | null;
  sent_at: string | null; created_at: string;
  labels_downloaded_at: string | null;
};

function downloadBlob(b64: string, name: string) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

function BLRow({ doc }: { doc: BLDoc }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function handleDownload() {
    setMsg(null);
    startTransition(async () => {
      const r = await getBlPdfByBlId(doc.bl_id);
      if (r.ok && r.blobBase64) {
        downloadBlob(r.blobBase64, `BL-${doc.bl_id}.pdf`);
        setMsg({ ok: true, text: "✓ Téléchargé" });
      } else {
        setMsg({ ok: false, text: r.error ?? "Erreur" });
      }
    });
  }

  const date = new Date(doc.created_at).toLocaleDateString("fr-MA", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <tr className="hover:bg-secondary/20 transition-colors">
      {/* BL ID */}
      <td className="px-5 py-4">
        <p className="font-mono font-bold text-sm text-violet-700">#{doc.bl_id}</p>
        <p className="text-[10px] text-muted-foreground font-mono">{doc.batch_number}</p>
      </td>

      {/* Date */}
      <td className="px-5 py-4 text-sm">{date}</td>

      {/* Store */}
      <td className="px-5 py-4 text-sm font-medium">{doc.store_name ?? "—"}</td>

      {/* Orders */}
      <td className="px-5 py-4 text-sm font-bold text-center">{doc.total_orders}</td>

      {/* Payment */}
      <td className="px-5 py-4">
        <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
          doc.payment_status === "paid"
            ? "bg-green-50 text-green-700 border-green-200"
            : "bg-red-50 text-red-600 border-red-200"
        )}>
          {doc.payment_status === "paid" ? "Payé" : "Non payé"}
        </span>
      </td>

      {/* Download */}
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDownload}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <FileDown className="h-3.5 w-3.5" />}
            {isPending ? "…" : "BL PDF"}
          </button>
          {msg && (
            <span className={cn("text-xs font-medium", msg.ok ? "text-green-700" : "text-red-600")}>
              {msg.text}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

export function DocumentsClient({ docs }: { docs: BLDoc[] }) {
  const [search, setSearch] = useState("");

  const q = search.toLowerCase();
  const filtered = docs.filter((d) =>
    !q ||
    String(d.bl_id).includes(q) ||
    (d.store_name ?? "").toLowerCase().includes(q) ||
    d.batch_number.toLowerCase().includes(q)
  );

  // Group by date
  const byDate = new Map<string, BLDoc[]>();
  for (const doc of filtered) {
    const day = new Date(doc.created_at).toLocaleDateString("fr-MA", {
      day: "numeric", month: "long", year: "numeric",
    });
    if (!byDate.has(day)) byDate.set(day, []);
    byDate.get(day)!.push(doc);
  }

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Chercher BL ID, store…"
          className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {docs.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed bg-card flex flex-col items-center justify-center py-16 gap-3">
          <FileDown className="h-10 w-10 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground font-medium">Aucun BL disponible</p>
          <p className="text-xs text-muted-foreground">
            Les BL apparaissent automatiquement après le Sheet Sync → Digylog.
          </p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Total BLs</p>
              <p className="text-2xl font-bold">{docs.length}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Commandes</p>
              <p className="text-2xl font-bold">{docs.reduce((s, d) => s + d.total_orders, 0)}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Non payés</p>
              <p className="text-2xl font-bold text-red-600">
                {docs.filter((d) => d.payment_status !== "paid").length}
              </p>
            </div>
          </div>

          {/* Table grouped by date */}
          {[...byDate.entries()].map(([day, dayDocs]) => (
            <div key={day} className="rounded-xl border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b bg-secondary/20 flex items-center justify-between">
                <h3 className="text-sm font-bold">{day}</h3>
                <span className="text-xs text-muted-foreground">
                  {dayDocs.length} BL — {dayDocs.reduce((s, d) => s + d.total_orders, 0)} commandes
                </span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-secondary/10">
                    {["BL ID","Date","Store","Commandes","Paiement","Télécharger"].map((h) => (
                      <th key={h} className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {dayDocs.map((doc) => <BLRow key={doc.id} doc={doc} />)}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
