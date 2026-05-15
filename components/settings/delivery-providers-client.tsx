"use client";
import { useState, useTransition } from "react";
import {
  createDeliveryStore, updateDeliveryStore, testStoreConnection,
} from "@/lib/delivery/store-actions";
import type { DeliveryStoreRow } from "@/lib/delivery/store-actions";
import {
  Plus, ChevronDown, ChevronUp, CheckCircle2, XCircle,
  Zap, Settings, Wifi, WifiOff, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Company = { id: string; slug: string; name: string; is_active: boolean };

const PROVIDER_LABELS: Record<string, string> = {
  digylog: "Digylog",
  ozone:   "Ozone Express",
};

// ─── Store card ───────────────────────────────────────────────────────────────
function StoreCard({ store, onRefresh }: { store: DeliveryStoreRow; onRefresh: () => void }) {
  const [open, setOpen]         = useState(false);
  const [testing, startTest]    = useTransition();
  const [saving, startSave]     = useTransition();
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [newToken, setNewToken] = useState("");
  const [form, setForm]         = useState({
    name:            store.name,
    googleSheetId:   store.google_sheet_id ?? "",
    googleSheetName: store.google_sheet_name ?? "",
    deliveryFeeMad:  store.delivery_fee_mad ?? 25,
    isActive:        store.is_active,
    isDefault:       store.is_default,
    apiBaseUrl:      store.api_base_url ?? "",
    clientName:      (store.metadata?.client_name as string) ?? "",
    clientPhone:     (store.metadata?.client_phone as string) ?? "",
    fulfillmentFee:  (store.metadata?.fulfillment_fee as number) ?? 0,
  });

  const company = store.delivery_companies;

  function handleTest() {
    setTestResult(null);
    startTest(async () => {
      const res = await testStoreConnection(store.id);
      setTestResult(res);
    });
  }

  function handleSave() {
    startSave(async () => {
      await updateDeliveryStore(store.id, {
        ...form,
        apiToken: newToken || undefined,
      });
      setNewToken("");
      onRefresh();
    });
  }

  return (
    <div className={cn(
      "rounded-xl border bg-card overflow-hidden transition-all",
      !store.is_active && "opacity-60"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-secondary/20 transition-colors"
        onClick={() => setOpen((v) => !v)}>
        <div className="flex items-center gap-3">
          <div className={cn("h-2.5 w-2.5 rounded-full shrink-0",
            store.is_active ? "bg-green-500" : "bg-gray-300"
          )} />
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm">{store.name}</p>
              {store.is_default && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-bold">
                  <Star className="h-2.5 w-2.5" /> Défaut
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {company ? PROVIDER_LABELS[company.slug] ?? company.name : "—"}
              {store.delivery_fee_mad && ` · ${store.delivery_fee_mad} MAD/livraison`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {store.google_sheet_id && (
            <span className="text-[10px] bg-green-100 text-green-700 rounded px-2 py-0.5 font-medium">
              Sheet ✓
            </span>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Detail panel */}
      {open && (
        <div className="border-t px-5 py-5 space-y-5 bg-secondary/5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Basic info */}
            <Field label="Nom du store">
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input-base" />
            </Field>

            <Field label="Client / Compte">
              <input value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                placeholder="ex: Afrizone SARL" className="input-base" />
            </Field>

            <Field label="Téléphone client">
              <input value={form.clientPhone} onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))}
                placeholder="06XXXXXXXX" className="input-base" />
            </Field>

            <Field label="Frais livraison (MAD)">
              <input type="number" value={form.deliveryFeeMad}
                onChange={(e) => setForm((f) => ({ ...f, deliveryFeeMad: parseFloat(e.target.value) || 0 }))}
                className="input-base" />
            </Field>

            <Field label="Frais fulfillment (MAD)">
              <input type="number" value={form.fulfillmentFee}
                onChange={(e) => setForm((f) => ({ ...f, fulfillmentFee: parseFloat(e.target.value) || 0 }))}
                className="input-base" />
            </Field>

          </div>

          {/* API Token */}
          <div className="rounded-lg border bg-background p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" /> Token API
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border bg-secondary/30 px-3 py-2 text-xs font-mono text-muted-foreground">
                {store.api_base_url
                  ? `${store.api_base_url.slice(0, 30)}…`
                  : "URL par défaut (env)"}
              </div>
            </div>
            <div className="flex gap-2">
              <input value={newToken} onChange={(e) => setNewToken(e.target.value)}
                type="password" placeholder="Nouveau token (laisser vide pour garder l'actuel)"
                className="flex-1 input-base font-mono text-xs" />
            </div>
            <input value={form.apiBaseUrl} onChange={(e) => setForm((f) => ({ ...f, apiBaseUrl: e.target.value }))}
              placeholder="Base URL API (optionnel)" className="input-base text-xs font-mono" />
          </div>

          {/* Google Sheet */}
          <div className="rounded-lg border bg-background p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Settings className="h-3.5 w-3.5" /> Google Sheet
            </p>
            <Field label="Sheet ID">
              <input value={form.googleSheetId}
                onChange={(e) => setForm((f) => ({ ...f, googleSheetId: e.target.value }))}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                className="input-base font-mono text-xs" />
            </Field>
            <Field label="Nom de l'onglet">
              <input value={form.googleSheetName}
                onChange={(e) => setForm((f) => ({ ...f, googleSheetName: e.target.value }))}
                placeholder="Feuille 1" className="input-base" />
            </Field>
          </div>

          {/* Webhook info (readonly) */}
          <div className="rounded-lg border bg-background p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Webhook URL</p>
            <div className="rounded-lg bg-secondary/30 px-3 py-2 text-xs font-mono text-muted-foreground break-all">
              {`${process.env.NEXT_PUBLIC_APP_URL ?? "https://votre-app.vercel.app"}/api/webhooks/delivery/${company?.slug ?? "digylog"}`}
            </div>
            <p className="text-xs text-muted-foreground">
              Configurez cette URL dans le dashboard de votre transporteur.
            </p>
          </div>

          {/* Status toggles */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300" />
              <span className="text-sm">Actif</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isDefault}
                onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300" />
              <span className="text-sm">Store par défaut</span>
            </label>
          </div>

          {/* Test result */}
          {testResult && (
            <div className={cn("flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm",
              testResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            )}>
              {testResult.success
                ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                : <XCircle className="h-4 w-4 shrink-0" />}
              {testResult.message}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={handleTest} disabled={testing}
              className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50">
              {testing ? <WifiOff className="h-4 w-4 animate-pulse" /> : <Wifi className="h-4 w-4" />}
              {testing ? "Test…" : "Tester connexion"}
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add store form ───────────────────────────────────────────────────────────
function AddStoreForm({ companies, onDone }: { companies: Company[]; onDone: () => void }) {
  const [isPending, start] = useTransition();
  const [form, setForm] = useState({
    companyId: companies[0]?.id ?? "",
    name: "", slug: "", apiToken: "",
    googleSheetId: "", googleSheetName: "",
    deliveryFeeMad: 25, isActive: true, isDefault: false,
    clientName: "", clientPhone: "", fulfillmentFee: 0,
  });
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (!form.name || !form.companyId) { setError("Nom et société requis."); return; }
    start(async () => {
      const res = await createDeliveryStore(form);
      if (res.success) { onDone(); }
      else setError(res.error ?? "Erreur");
    });
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <p className="font-semibold text-sm">Nouveau store / compte</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Société de livraison">
          <select value={form.companyId}
            onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))}
            className="input-base">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Nom du store *">
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="ex: Afrizone" className="input-base" />
        </Field>
        <Field label="Client">
          <input value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
            placeholder="Afrizone SARL" className="input-base" />
        </Field>
        <Field label="Frais livraison (MAD)">
          <input type="number" value={form.deliveryFeeMad}
            onChange={(e) => setForm((f) => ({ ...f, deliveryFeeMad: parseFloat(e.target.value) || 0 }))}
            className="input-base" />
        </Field>
        <Field label="Token API">
          <input type="password" value={form.apiToken}
            onChange={(e) => setForm((f) => ({ ...f, apiToken: e.target.value }))}
            placeholder="Token API transporteur" className="input-base font-mono text-xs" />
        </Field>
        <Field label="Google Sheet ID">
          <input value={form.googleSheetId}
            onChange={(e) => setForm((f) => ({ ...f, googleSheetId: e.target.value }))}
            placeholder="ID du spreadsheet" className="input-base font-mono text-xs" />
        </Field>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
          Actif
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={form.isDefault}
            onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} />
          Store par défaut
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onDone}
          className="rounded-lg border px-4 py-2 text-sm hover:bg-secondary transition-colors">
          Annuler
        </button>
        <button type="button" onClick={handleSubmit} disabled={isPending}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity">
          {isPending ? "Création…" : "Créer le store"}
        </button>
      </div>
    </div>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function DeliveryProvidersClient({
  stores: initialStores,
  companies,
}: {
  stores: DeliveryStoreRow[];
  companies: Company[];
}) {
  const [stores, setStores] = useState(initialStores);
  const [showAdd, setShowAdd] = useState(false);

  function refresh() {
    // Server revalidates — user can refresh manually
    window.location.reload();
  }

  const byCompany = companies.map((c) => ({
    company: c,
    stores:  stores.filter((s) => s.delivery_companies?.id === c.id),
  }));

  return (
    <div className="space-y-6">

      {/* Add store form */}
      {showAdd
        ? <AddStoreForm companies={companies} onDone={() => { setShowAdd(false); refresh(); }} />
        : (
          <button type="button" onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/30 px-5 py-4 text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors w-full">
            <Plus className="h-4 w-4" /> Ajouter un store / compte
          </button>
        )
      }

      {/* Companies + stores */}
      {byCompany.map(({ company, stores: cStores }) => (
        <div key={company.id} className="space-y-3">
          <div className="flex items-center gap-2">
            <div className={cn("h-2 w-2 rounded-full", company.is_active ? "bg-green-500" : "bg-gray-300")} />
            <p className="font-semibold">{company.name}</p>
            <span className="text-xs text-muted-foreground font-mono">({company.slug})</span>
            <span className="text-xs text-muted-foreground">— {cStores.length} store(s)</span>
          </div>
          <div className="space-y-2 pl-4">
            {cStores.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">Aucun store configuré pour ce transporteur.</p>
            )}
            {cStores.map((s) => (
              <StoreCard key={s.id} store={s} onRefresh={refresh} />
            ))}
          </div>
        </div>
      ))}

      {companies.length === 0 && (
        <div className="rounded-xl border bg-card px-5 py-8 text-center space-y-2">
          <p className="text-sm font-medium">Aucune société de livraison</p>
          <p className="text-xs text-muted-foreground">Exécutez la migration SQL pour initialiser Digylog.</p>
        </div>
      )}

      {/* Global CSS for inputs */}
      <style>{`
        .input-base {
          width: 100%;
          height: 36px;
          padding: 0 12px;
          border-radius: 8px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          font-size: 14px;
          outline: none;
        }
        .input-base:focus {
          ring: 2px solid hsl(var(--ring));
          border-color: hsl(var(--ring));
        }
      `}</style>
    </div>
  );
}
