"use client";
import { useState, useTransition } from "react";
import { Copy, RefreshCw, Wifi, Download } from "lucide-react";
import {
  saveDigylogSettings, testDigylogConnection,
  registerDigylogWebhook, syncDigylogReferenceData,
} from "@/lib/delivery/shipment-actions";

interface Props {
  settings: Record<string, unknown>;
  appUrl:   string;
  hasToken: boolean;
}

export function DigylogSettingsForm({ settings, appUrl, hasToken }: Props) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const webhookUrl = `${appUrl}/api/webhooks/digylog`;

  const [form, setForm] = useState({
    default_network_id:       Number(settings.default_network_id ?? 1),
    default_store_name:       String(settings.default_store_name ?? ""),
    default_port:             Number(settings.default_port ?? 1) as 1 | 2,
    default_mode:             Number(settings.default_mode ?? 1) as 1 | 2,
    default_status_on_create: Number(settings.default_status_on_create ?? 1) as 0 | 1,
    webhook_secret:           String(settings.webhook_secret ?? ""),
  });

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: val }));
    setMsg(null);
  }

  function run(fn: () => Promise<{ ok?: boolean; success?: boolean; message?: string; error?: string } | undefined>) {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res?.ok || res?.success) {
          setMsg({ type:"ok", text: res.message ?? "✓ Succès" });
        } else {
          setMsg({ type:"err", text: res?.error ?? res?.message ?? "Erreur" });
        }
      } catch (e) {
        setMsg({ type:"err", text: String(e) });
      }
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      await saveDigylogSettings(form);
      return { success: true, message: "✓ Paramètres sauvegardés" };
    });
  }

  const INP = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const LBL = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5";
  const BTN = "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold border border-border bg-secondary hover:bg-secondary/70 transition-colors disabled:opacity-50";

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${
          msg.type === "ok" ? "bg-green-600 text-white" : "bg-red-100 text-red-800 border border-red-200"
        }`}>
          {msg.text}
        </div>
      )}

      {/* Test connection + sync buttons */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Connexion & Synchronisation</h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={isPending || !hasToken}
            onClick={() => run(() => testDigylogConnection())}
            className={BTN}>
            <Wifi className="h-3.5 w-3.5" />
            Tester connexion
          </button>
          <button type="button" disabled={isPending || !hasToken}
            onClick={() => run(async () => {
              const r = await syncDigylogReferenceData();
              return { success: r.success, message: `✓ Synced: ${r.networks} réseaux, ${r.stores} stores, ${r.cities} villes` };
            })}
            className={BTN}>
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
            Sync réseaux/stores/villes
          </button>
          <button type="button" disabled={isPending || !hasToken}
            onClick={() => run(() => registerDigylogWebhook())}
            className={BTN}>
            <Download className="h-3.5 w-3.5" />
            Enregistrer webhook chez Digylog
          </button>
        </div>
        {!hasToken && (
          <p className="text-xs text-muted-foreground">
            Ajoutez <code className="bg-secondary px-1 rounded">DIGYLOG_TOKEN</code> dans Vercel pour activer.
          </p>
        )}
      </div>

      {/* Default config */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Configuration par défaut</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL}>ID Réseau Digylog</label>
            <input type="number" value={form.default_network_id}
              onChange={(e) => set("default_network_id", Number(e.target.value))}
              className={INP} placeholder="1" />
            <p className="text-xs text-muted-foreground mt-1">
              GET /networks pour connaître vos IDs
            </p>
          </div>
          <div>
            <label className={LBL}>Nom de la boutique</label>
            <input type="text" value={form.default_store_name}
              onChange={(e) => set("default_store_name", e.target.value)}
              className={INP} placeholder="Hichoux Store" />
            <p className="text-xs text-muted-foreground mt-1">
              Exactement comme dans GET /stores
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Port (frais livraison)</label>
            <select value={form.default_port}
              onChange={(e) => set("default_port", Number(e.target.value) as 1|2)}
              className={INP}>
              <option value={1}>1 — Par le client</option>
              <option value={2}>2 — Par le vendeur</option>
            </select>
          </div>
          <div>
            <label className={LBL}>Mode envoi</label>
            <select value={form.default_status_on_create}
              onChange={(e) => set("default_status_on_create", Number(e.target.value) as 0|1)}
              className={INP}>
              <option value={1}>1 — Ajouter &amp; envoyer immédiatement</option>
              <option value={0}>0 — Ajouter sans envoyer</option>
            </select>
          </div>
        </div>

        <div>
          <label className={LBL}>Webhook Secret (optionnel)</label>
          <input type="password" value={form.webhook_secret}
            onChange={(e) => set("webhook_secret", e.target.value)}
            className={INP} placeholder="Pour vérifier l'authenticité des webhooks" />
          <p className="text-xs text-muted-foreground mt-1">
            Ajoutez aussi <code className="bg-secondary px-1 rounded">DIGYLOG_WEBHOOK_SECRET</code> dans Vercel.
          </p>
        </div>
      </div>

      {/* Webhook URL display */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">URL Webhook</h3>
        <p className="text-xs text-muted-foreground">
          Donnez cette URL à Digylog (via PUT /webhook ou support Digylog) pour recevoir les mises à jour en temps réel.
        </p>
        <div className="flex items-center gap-2 bg-secondary/40 rounded-lg px-3 py-2.5">
          <code className="text-xs font-mono flex-1 truncate">{webhookUrl}</code>
          <button type="button"
            onClick={() => navigator.clipboard?.writeText(webhookUrl)}
            className="text-muted-foreground hover:text-foreground">
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Ou cliquez &laquo; Enregistrer webhook &raquo; pour l&apos;enregistrer automatiquement via l&apos;API Digylog.
        </p>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={isPending}
          className="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
          {isPending ? "Sauvegarde…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
