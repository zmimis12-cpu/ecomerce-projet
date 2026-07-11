"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { addManualAdSpend, deleteManualAdSpend, type ManualAdSpendEntry } from "@/lib/ads/manual-actions";

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: "TikTok", google: "Google Ads", meta: "Meta", other: "Autre",
};

export function ManualAdSpendForm({ entries }: { entries: ManualAdSpendEntry[] }) {
  const [platform, setPlatform] = useState<"tiktok" | "google" | "other">("tiktok");
  const [amount, setAmount]     = useState("");
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote]         = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await addManualAdSpend({
        platform, amount_mad: parseFloat(amount) || 0, spend_date: date, note: note || undefined,
      });
      if (!res.success) { setError(res.error ?? "Erreur."); return; }
      setAmount(""); setNote("");
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteManualAdSpend(id);
      router.refresh();
    });
  }

  const total = entries.reduce((s, e) => s + e.amount_mad, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Dépenses pub — saisie manuelle</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Pour TikTok / Google Ads (pas d&apos;API connectée) — entre le montant total dépensé, comptabilisé dans &quot;Total Pub&quot; du dashboard.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Plateforme</label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)}
            className="flex h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="tiktok">TikTok</option>
            <option value="google">Google Ads</option>
            <option value="other">Autre</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Montant (MAD)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
            className="flex h-9 w-28 rounded-md border border-input bg-background px-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-2 text-sm" />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Note (optionnel)</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex: campagne juillet"
            className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
        </div>
        <button type="button" onClick={submit} disabled={isPending || !amount}
          className="flex items-center gap-1 h-9 rounded-md bg-black text-white px-3 text-sm font-medium disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </button>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}

      {entries.length > 0 && (
        <div className="border rounded-lg divide-y">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium bg-gray-100 rounded px-2 py-0.5">{PLATFORM_LABELS[e.platform] ?? e.platform}</span>
                <span className="text-muted-foreground">{e.spend_date}</span>
                {e.note && <span className="text-muted-foreground italic">{e.note}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold">{e.amount_mad.toFixed(2)} MAD</span>
                <button type="button" onClick={() => remove(e.id)} disabled={isPending}
                  className="text-red-500 hover:text-red-700 disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          <div className="flex justify-between px-3 py-2 text-sm font-semibold bg-gray-50">
            <span>Total</span><span>{total.toFixed(2)} MAD</span>
          </div>
        </div>
      )}
    </div>
  );
}
