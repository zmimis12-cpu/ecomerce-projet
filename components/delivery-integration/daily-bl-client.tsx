/* eslint-disable react/no-unescaped-entities */
"use client";
import { useState, useTransition } from "react";
import { FileDown, Loader2, RefreshCw, CheckCircle2, Clock, Search, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateOrDownloadDailyBl, markDailyBlPaid } from "@/lib/delivery/daily-bl-actions";

type DailyBlRow = {
  id: string; provider: string; store_name: string;
  business_date: string; bl_id: number | null;
  total_orders: number; total_trackings: number;
  total_cod: number; payment_status: string;
  generated_at: string | null; created_at: string;
};

interface Props {
  rows: DailyBlRow[];
  defaultStoreName: string;
}

function mad(n: number) {
  return n.toLocaleString("fr-MA", { minimumFractionDigits: 0 }) + " MAD";
}

function downloadBlob(b64: string, name: string) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

// ── Row component ──────────────────────────────────────────────────────────────
function DayRow({ row, storeName }: { row: DailyBlRow; storeName: string }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg]                = useState<{ ok: boolean; text: string } | null>(null);

  const hasBlId   = !!row.bl_id;
  const isGenerated = hasBlId && row.generated_at;

  function handleBl(force = false) {
    setMsg(null);
    startTransition(async () => {
      const r = await generateOrDownloadDailyBl({
        provider:        row.provider,
        storeName:       row.store_name || storeName,
        businessDate:    row.business_date,
        forceRegenerate: force,
      });

      if (r.ok && r.blobBase64) {
        const label = force ? "BL-regenere" : "BL";
        downloadBlob(r.blobBase64, `${label}-${row.business_date}-${r.blId}.pdf`);
        setMsg({ ok: true, text: `✓ BL #${r.blId} — ${r.totalTrackings} trackings` });
        setTimeout(() => window.location.reload(), 1200);
      } else if (r.blId && !r.ok) {
        setMsg({ ok: false, text: r.error ?? "Erreur download — BL généré, réessayez" });
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setMsg({ ok: false, text: r.error ?? "Erreur" });
      }
    });
  }

  function handlePaid() {
    if (row.id.startsWith("computed_")) return;
    startTransition(async () => {
      await markDailyBlPaid(row.id);
      window.location.reload();
    });
  }

  const dateLabel = new Date(row.business_date + "T12:00:00").toLocaleDateString("fr-MA", {
    weekday: "short", day: "numeric", month: "long", year: "numeric",
  });

  const isPaid = row.payment_status === "paid";

  return (
    <tr className={cn(
      "hover:bg-secondary/20 transition-colors",
      isGenerated && "bg-emerald-50/30",
    )}>
      {/* Date */}
      <td className="px-5 py-4">
        <p className="font-semibold text-sm">{dateLabel}</p>
        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{row.business_date}</p>
      </td>

      {/* Provider + Store */}
      <td className="px-5 py-4">
        <span className="inline-flex rounded-full bg-violet-100 text-violet-700 px-2.5 py-0.5 text-[10px] font-semibold capitalize">
          {row.provider}
        </span>
        <p className="text-xs font-medium mt-1">{row.store_name || storeName}</p>
      </td>

      {/* Orders */}
      <td className="px-5 py-4 text-center">
        <p className="text-lg font-bold">{row.total_orders}</p>
        <p className="text-[10px] text-muted-foreground">{row.total_trackings} trackings</p>
      </td>

      {/* COD */}
      <td className="px-5 py-4 font-mono font-semibold text-sm">
        {mad(row.total_cod)}
      </td>

      {/* BL Status */}
      <td className="px-5 py-4">
        {isGenerated ? (
          <div className="space-y-0.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold">
              <CheckCircle2 className="h-2.5 w-2.5" /> BL GÉNÉRÉ
            </span>
            <p className="text-[10px] font-mono text-violet-700 font-bold">#{row.bl_id}</p>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold">
            <Clock className="h-2.5 w-2.5" /> EN ATTENTE
          </span>
        )}
      </td>

      {/* Payment */}
      <td className="px-5 py-4">
        {isPaid ? (
          <span className="inline-flex rounded-full bg-green-100 text-green-700 border border-green-200 px-2.5 py-0.5 text-[10px] font-semibold">
            Payé
          </span>
        ) : (
          <button type="button" onClick={handlePaid} disabled={isPending || !isGenerated}
            className="inline-flex rounded-full bg-red-50 text-red-600 border border-red-200 px-2.5 py-0.5 text-[10px] font-semibold hover:bg-red-100 disabled:opacity-40 transition-colors">
            Non payé
          </button>
        )}
      </td>

      {/* Actions */}
      <td className="px-5 py-4">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Main: Generate or Download BL */}
          <button type="button" onClick={() => handleBl(false)} disabled={isPending}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50",
              isGenerated
                ? "border border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                : "bg-primary text-primary-foreground hover:opacity-90"
            )}>
            {isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <FileDown className="h-3.5 w-3.5" />}
            {isGenerated ? `BL #${row.bl_id}` : "Télécharger BL du jour"}
          </button>

          {/* Regenerate — only if BL already exists */}
          {isGenerated && (
            <button type="button" onClick={() => handleBl(true)} disabled={isPending}
              title="Regénérer le BL avec tous les trackings du jour"
              className="flex items-center gap-1 rounded-lg border px-2.5 py-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 transition-colors">
              <RefreshCw className="h-3 w-3" />
              Regénérer
            </button>
          )}

          {/* Message */}
          {msg && (
            <span className={cn("text-[10px] font-medium", msg.ok ? "text-green-700" : "text-red-600")}>
              {msg.text}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function DailyBlClient({ rows, defaultStoreName }: Props) {
  const [search, setSearch] = useState("");

  const q = search.toLowerCase();
  const filtered = rows.filter((r) =>
    !q ||
    r.business_date.includes(q) ||
    (r.store_name ?? "").toLowerCase().includes(q) ||
    String(r.bl_id ?? "").includes(q)
  );

  const unpaidCount    = rows.filter((r) => r.bl_id && r.payment_status !== "paid").length;
  const pendingBlCount = rows.filter((r) => !r.bl_id && r.total_orders > 0).length;

  return (
    <div className="space-y-4">
      {/* Alerts */}
      {pendingBlCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>{pendingBlCount}</strong> jour(s) sans BL généré — cliquez Télécharger BL du jour pour chaque.
        </div>
      )}
      {unpaidCount > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <DollarSign className="inline h-4 w-4 mb-0.5" /> <strong>{unpaidCount}</strong> BL(s) non payé(s).
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Date, store, BL ID…"
          className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed bg-card py-16 text-center">
          <FileDown className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground font-medium">Aucune journée trouvée</p>
          <p className="text-xs text-muted-foreground mt-1">
            Les journées apparaissent automatiquement dès qu&apos;il y a des commandes expédiées.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-secondary/30">
                {["Date","Transporteur / Store","Commandes","Total COD","BL","Paiement","Actions"].map((h) => (
                  <th key={h} className="px-5 py-3.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((row) => (
                <DayRow key={row.id} row={row} storeName={defaultStoreName} />
              ))}
            </tbody>
          </table>
          <div className="border-t bg-secondary/10 px-5 py-3 text-xs text-muted-foreground flex justify-between">
            <span>{filtered.length} jour(s)</span>
            <span>Total: {filtered.reduce((s, r) => s + r.total_orders, 0)} commandes — {mad(filtered.reduce((s, r) => s + r.total_cod, 0))}</span>
          </div>
        </div>
      )}
    </div>
  );
}
