"use client";
import { useState, useTransition } from "react";
import { Copy, RefreshCw, Wifi, Download, Eye, EyeOff } from "lucide-react";
import {
  saveDigylogSettings, testDigylogConnection,
  registerDigylogWebhook, syncDigylogReferenceData,
  sendTestOrderToDigylog,
} from "@/lib/delivery/shipment-actions";

interface Props {
  settings:    Record<string, unknown>;
  appUrl:      string;
  hasToken:    boolean;
  tokenSource: "env" | "db" | "none";
}

export function DigylogSettingsForm({ settings, appUrl, hasToken, tokenSource }: Props) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg]      = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);

  const webhookUrl = `${appUrl}/api/webhooks/digylog`;

  const [form, setForm] = useState({
    token:                    String(settings.token ?? ""),
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

  type ActionResult = { ok?: boolean; success?: boolean; message?: string; error?: string } | undefined;

  function run(fn: () => Promise<ActionResult>) {
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

  const INP  = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const LBL  = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5";
  const BTN  = "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold border border-border bg-secondary hover:bg-secondary/70 transition-colors disabled:opacity-50";

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${
          msg.type === "ok"
            ? "bg-green-600 text-white"
            : "bg-red-100 text-red-800 border border-red-200"
        }`}>
          {msg.text}
        </div>
      )}

      {/* ── TOKEN ── */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Token API Digylog</h3>

        {tokenSource === "env" && (
          <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            Le token vient de la variable Vercel <code>DIGYLOG_TOKEN</code> et prend priorité sur ce champ.
            Pour utiliser ce champ à la place, supprimez la variable Vercel.
          </p>
        )}

        <div className="space-y-1.5">
          <label className={LBL}>
            Token Digylog
            {tokenSource === "env" && <span className="ml-2 text-blue-600 normal-case font-normal">(inactif — Vercel a priorité)</span>}
            {tokenSource === "db"  && <span className="ml-2 text-green-600 normal-case font-normal">(actif)</span>}
            {tokenSource === "none"&& <span className="ml-2 text-red-600 normal-case font-normal">(requis)</span>}
          </label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={form.token}
              onChange={(e) => set("token", e.target.value)}
              placeholder="Collez votre token Digylog ici"
              className={`${INP} pr-10`}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Trouvez votre token dans votre espace Digylog → API → Seller API.
            Stocké chiffré en base de données.
          </p>
        </div>

        {/* Test connection — uses DB token even before save */}
        <button type="button" disabled={isPending || (!form.token && !hasToken)}
          onClick={() => run(() => testDigylogConnection())}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
          <Wifi className="h-4 w-4" />
          {isPending ? "Test en cours…" : "Tester la connexion"}
        </button>
      </div>

      {/* ── CONFIG ── */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Configuration par défaut</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL}>ID Réseau Digylog</label>
            <input type="number" value={form.default_network_id}
              onChange={(e) => set("default_network_id", Number(e.target.value))}
              className={INP} placeholder="1" />
            <p className="text-xs text-muted-foreground mt-1">Obtenu via GET /networks</p>
          </div>
          <div>
            <label className={LBL}>Nom boutique (store)</label>
            <input type="text" value={form.default_store_name}
              onChange={(e) => set("default_store_name", e.target.value)}
              className={INP} placeholder="Hichoux Store" />
            <p className="text-xs text-muted-foreground mt-1">Exactement comme dans GET /stores</p>
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
              <option value={1}>Ajouter &amp; envoyer immédiatement</option>
              <option value={0}>Ajouter sans envoyer (manuel)</option>
            </select>
          </div>
        </div>

        <div>
          <label className={LBL}>Webhook Secret (optionnel)</label>
          <input type="password" value={form.webhook_secret}
            onChange={(e) => set("webhook_secret", e.target.value)}
            className={INP} placeholder="Secret pour vérifier les webhooks entrants" />
        </div>

        {/* Sync buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" disabled={isPending || !hasToken}
            onClick={() => run(async () => {
              const r = await syncDigylogReferenceData();
              return { success: r.success, message: `✓ ${r.networks} réseaux · ${r.stores} stores · ${r.cities} villes` };
            })}
            className={BTN}>
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
            Sync réseaux / stores / villes
          </button>
          <button type="button" disabled={isPending || !hasToken}
            onClick={() => run(() => registerDigylogWebhook())}
            className={BTN}>
            <Download className="h-3.5 w-3.5" />
            Enregistrer webhook chez Digylog
          </button>
          <button type="button" disabled={isPending || (!form.token && !hasToken)}
            onClick={() => {
              setTestResult(null);
              setMsg(null);
              startTransition(async () => {
                const r = await sendTestOrderToDigylog({
                  network_id: form.default_network_id,
                  store_name: form.default_store_name,
                  port:       form.default_port,
                });
                setTestResult(r as unknown as Record<string, unknown>);
                setMsg({ type: r.ok ? "ok" : "err", text: r.message });
              });
            }}
            className={BTN + " border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"}>
            <Wifi className="h-3.5 w-3.5" />
            Envoyer commande test Digylog
          </button>
        </div>
      </div>

      {/* ── TEST RESULT ── */}
      {testResult && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold">Résultat commande test</h3>
          {(testResult.tracking as string | undefined) && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 font-mono font-semibold">
              ✓ Tracking: {testResult.tracking as string}
            </div>
          )}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Payload envoyé</p>
            <pre className="text-[10px] bg-secondary/40 rounded-lg p-3 overflow-x-auto max-h-48">
              {JSON.stringify(testResult.payload, null, 2)}
            </pre>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Réponse Digylog</p>
            <pre className="text-[10px] bg-secondary/40 rounded-lg p-3 overflow-x-auto max-h-48">
              {JSON.stringify(testResult.response, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* ── WEBHOOK URL ── */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">URL Webhook</h3>
        <p className="text-xs text-muted-foreground">
          Donnez cette URL à Digylog pour recevoir les mises à jour de statut en temps réel.
        </p>
        <div className="flex items-center gap-2 bg-secondary/40 rounded-lg px-3 py-2.5">
          <code className="text-xs font-mono flex-1 truncate">{webhookUrl}</code>
          <button type="button" onClick={() => navigator.clipboard?.writeText(webhookUrl)}
            className="text-muted-foreground hover:text-foreground shrink-0">
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── SAVE ── */}
      <div className="flex justify-end">
        <button type="submit" disabled={isPending}
          className="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          {isPending ? "Sauvegarde…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
