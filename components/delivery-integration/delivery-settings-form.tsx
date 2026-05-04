"use client";
import { useState, useTransition } from "react";
import { saveDeliverySettings } from "@/lib/delivery/shipment-actions";
import { Copy } from "lucide-react";

interface Props {
  companies: Record<string, unknown>[];
  appUrl: string;
}

export function DeliverySettingsForm({ companies, appUrl }: Props) {
  const first = companies[0] ?? {};
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    id:                String(first.id ?? ""),
    name:              String(first.name ?? "Digylog"),
    slug:              String(first.slug ?? "digylog"),
    api_base_url:      String(first.api_base_url ?? "https://api.digylog.com"),
    api_key_encrypted: String(first.api_key_encrypted ?? ""),
    webhook_secret:    String(first.webhook_secret ?? ""),
    is_active:         Boolean(first.is_active ?? true),
  });

  const webhookUrl = `${appUrl}/api/webhooks/delivery/${form.slug}`;

  function set(key: string, val: string | boolean) {
    setForm((f) => ({ ...f, [key]: val }));
    setSaved(false);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await saveDeliverySettings(form);
      setSaved(true);
    });
  }

  const inp = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {saved && (
        <div className="rounded-lg bg-green-600 text-white px-4 py-3 text-sm font-medium">
          ✓ Paramètres sauvegardés
        </div>
      )}

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Configuration Transporteur</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase">Nom</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)}
              placeholder="Digylog" className={inp} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase">Slug</label>
            <input value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())}
              placeholder="digylog" className={inp} />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase">URL API</label>
          <input value={form.api_base_url} onChange={(e) => set("api_base_url", e.target.value)}
            placeholder="https://api.digylog.com" className={inp} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase">Clé API</label>
          <input type="password" value={form.api_key_encrypted}
            onChange={(e) => set("api_key_encrypted", e.target.value)}
            placeholder="sk-…" className={inp} />
          <p className="text-xs text-muted-foreground">
            Ou définissez <code className="bg-secondary px-1 rounded">DELIVERY_API_KEY_DIGYLOG</code> dans Vercel.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase">Webhook Secret</label>
          <input type="password" value={form.webhook_secret}
            onChange={(e) => set("webhook_secret", e.target.value)}
            placeholder="secret pour vérifier la signature" className={inp} />
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => set("is_active", !form.is_active)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.is_active ? "bg-green-500" : "bg-slate-300"}`}>
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${form.is_active ? "translate-x-[18px]" : "translate-x-1"}`} />
          </button>
          <span className="text-sm font-medium">{form.is_active ? "Actif" : "Inactif"}</span>
        </div>
      </div>

      {/* Webhook URL */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">URL Webhook</h3>
        <p className="text-xs text-muted-foreground">
          Donnez cette URL à votre transporteur pour recevoir les mises à jour automatiques.
        </p>
        <div className="flex items-center gap-2 bg-secondary/40 rounded-lg px-3 py-2.5">
          <code className="text-xs font-mono flex-1 truncate">{webhookUrl}</code>
          <button type="button"
            onClick={() => navigator.clipboard?.writeText(webhookUrl)}
            className="text-muted-foreground hover:text-foreground shrink-0">
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
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
