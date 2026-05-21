"use client";
import { useState, useTransition } from "react";
import { createDeliveryStore, updateDeliveryStore, testStoreConnection, syncStore } from "@/lib/delivery/store-actions";
import type { DeliveryStoreRow, StoreFormData } from "@/lib/delivery/store-actions-types";
import { Plus, X, Check, Loader2, Wifi, WifiOff, RefreshCw, ChevronRight, AlertCircle, Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Company = { id: string; slug: string; name: string; is_active: boolean };

// ─── Status line component ───────────────────────────────────────────────────
function StatusLine({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className={cn("text-[10px] font-bold mt-0.5 shrink-0", ok ? "text-green-600" : "text-red-500")}>
        {ok ? "✓" : "✕"}
      </span>
      <div>
        <span className="text-xs font-medium">{label}</span>
        <span className={cn("text-xs ml-1.5", ok ? "text-muted-foreground" : "text-red-600")}>
          {detail}
        </span>
      </div>
    </div>
  );
}

// ─── Store card ───────────────────────────────────────────────────────────────
function StoreCard({ store, onEdit }: { store: DeliveryStoreRow; onEdit: () => void }) {
  const [testing, startTest]   = useTransition();
  const [syncing, startSync]   = useTransition();
  const [testRes, setTestRes]  = useState<{
    provider: { ok: boolean; message: string };
    sheet:    { ok: boolean; message: string };
    token:    { present: boolean; source: string };
  } | null>(null);
  const [syncMsg, setSyncMsg]  = useState<string | null>(null);
  const [syncErr, setSyncErr]  = useState(false);

  const company    = store.delivery_companies;
  const hasSheet   = !!store.google_sheet_id;
  const lastSync   = (store.metadata?.last_sync_at as string | undefined);
  const lastSyncTime = lastSync
    ? new Date(lastSync).toLocaleTimeString("fr-MA", { hour: "2-digit", minute: "2-digit" })
    : null;

  function handleTest() {
    setTestRes(null);
    startTest(async () => {
      const r = await testStoreConnection(store.id);
      setTestRes({ provider: r.provider, sheet: r.sheet, token: r.token });
      setTimeout(() => setTestRes(null), 12000);
    });
  }

  function handleSync() {
    setSyncMsg("Synchronisation en cours…");
    setSyncErr(false);
    startSync(async () => {
      const r = await syncStore(store.id);
      setSyncErr(!r.ok);
      setSyncMsg(r.message);
      setTimeout(() => { setSyncMsg(null); setSyncErr(false); }, 8000);
    });
  }

  return (
    <div className={cn("rounded-2xl border bg-card overflow-hidden", !store.is_active && "opacity-60")}>
      {/* Main row */}
      <div className="flex items-center gap-4 px-5 py-4">
        <div className={cn("h-2.5 w-2.5 rounded-full shrink-0",
          store.is_active ? "bg-green-500" : "bg-gray-300"
        )} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">{store.name}</p>
            {store.is_default && (
              <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-bold flex items-center gap-1">
                <Star className="h-2.5 w-2.5" /> Défaut
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
            <span>{company?.name ?? "—"}</span>
            <span>·</span>
            <span>{store.delivery_fee_mad ?? 25} MAD</span>
            <span>·</span>
            {hasSheet
              ? <span className="text-green-600 flex items-center gap-1"><Check className="h-3 w-3" />Sheet</span>
              : <span className="text-muted-foreground/50">Sheet —</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={handleTest} disabled={testing}
            title="Tester la connexion API"
            className="h-8 px-2.5 rounded-lg border flex items-center gap-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50">
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
            {testing ? "Test…" : "Tester"}
          </button>
          <button type="button" onClick={onEdit}
            className="h-8 px-3 rounded-lg border text-xs font-medium hover:bg-secondary transition-colors">
            Modifier
          </button>
        </div>
      </div>

      {/* Connection status — shown after test */}
      {testRes && (
        <div className="border-t px-5 py-3 space-y-1.5 bg-secondary/5">
          <StatusLine
            ok={testRes.provider.ok}
            label={`Provider API`}
            detail={testRes.provider.message}
          />
          <StatusLine
            ok={testRes.sheet.ok}
            label="Google Sheet"
            detail={testRes.sheet.message}
          />
          <p className="text-[10px] text-muted-foreground">
            Token: {testRes.token.source === "store" ? "✓ configuré dans ce store"
              : testRes.token.source === "env" ? "⚠ depuis variable d'environnement (.env)"
              : "✕ manquant"}
          </p>
        </div>
      )}

      {/* Sync bar */}
      <div className="border-t bg-secondary/10 px-5 py-2.5 flex items-center justify-between gap-3">
        <span className={cn("text-xs", syncErr ? "text-red-600" : "text-muted-foreground")}>
          {syncMsg ?? (lastSyncTime ? `Sync: ${lastSyncTime}` : "Prêt à synchroniser")}
        </span>
        <button type="button" onClick={handleSync} disabled={syncing}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50">
          <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
          {syncing ? "Sync…" : "Sync maintenant"}
        </button>
      </div>
    </div>
  );
}

// ─── 4-step wizard modal ──────────────────────────────────────────────────────
type Step = "info" | "provider" | "credentials" | "sheet";
const STEPS: { id: Step; label: string }[] = [
  { id: "info",        label: "Infos" },
  { id: "provider",    label: "Transporteur" },
  { id: "credentials", label: "Accès" },
  { id: "sheet",       label: "Sheet" },
];

function WizardModal({ store, companies, onClose }: {
  store: DeliveryStoreRow | null;
  companies: Company[];
  onClose: () => void;
}) {
  const isCreate = !store;
  const defaultCo = companies.find(c => c.slug === "digylog") ?? companies[0];
  const [step, setStep]     = useState<Step>("info");
  const [saving, startSave] = useTransition();
  const [error, setError]   = useState<string | null>(null);
  const [form, setForm]     = useState<StoreFormData>({
    companyId:       store?.delivery_companies?.id ?? defaultCo?.id ?? "",
    name:            store?.name ?? "",
    slug:            store?.slug ?? "",
    apiBaseUrl:      store?.api_base_url ?? "",
    googleSheetId:   store?.google_sheet_id ?? "",
    googleSheetName: store?.google_sheet_name ?? "",
    deliveryFeeMad:  store?.delivery_fee_mad ?? 25,
    isActive:        store?.is_active ?? true,
    isDefault:       store?.is_default ?? false,
    clientName:      String(store?.metadata?.client_name ?? ""),
    fulfillmentFee:  Number(store?.metadata?.fulfillment_fee ?? 0),
  });

  const idx = STEPS.findIndex(s => s.id === step);
  const selectedCo = companies.find(c => c.id === form.companyId);
  const isLast = idx === STEPS.length - 1;

  function set<K extends keyof StoreFormData>(key: K, val: StoreFormData[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function handleSave() {
    if (!form.name.trim()) { setError("Nom requis."); return; }
    if (!form.companyId)   { setError("Transporteur requis."); return; }
    setError(null);
    startSave(async () => {
      const res = isCreate
        ? await createDeliveryStore(form)
        : await updateDeliveryStore(store!.id, form);
      if (res.success) {
        onClose();
        window.location.reload();
      } else {
        setError(res.error ?? "Erreur lors de l'enregistrement.");
      }
    });
  }

  const stepContent: Record<Step, React.ReactNode> = {
    info: (
      <div className="space-y-4">
        <Field label="Nom du store *">
          <input value={form.name} onChange={e => set("name", e.target.value)}
            placeholder="ex: Hajtekzone, Afrizone…" className="field-input" autoFocus />
        </Field>
        <Field label="Frais livraison (MAD)">
          <input type="number" value={form.deliveryFeeMad ?? 25}
            onChange={e => set("deliveryFeeMad", parseFloat(e.target.value) || 0)}
            className="field-input" />
        </Field>
        <div className="flex gap-4">
          <Toggle label="Actif"      checked={form.isActive}  onChange={v => set("isActive", v)} />
          <Toggle label="Par défaut" checked={form.isDefault} onChange={v => set("isDefault", v)} />
        </div>
      </div>
    ),
    provider: (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground mb-3">Quel transporteur ?</p>
        {companies.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Aucune société. Exécutez la migration SQL.
          </p>
        )}
        {companies.map(c => (
          <button key={c.id} type="button" onClick={() => set("companyId", c.id)}
            className={cn("w-full flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition-all",
              form.companyId === c.id ? "border-primary bg-primary/5 font-semibold" : "hover:bg-secondary/50 text-muted-foreground"
            )}>
            {c.name}
            {form.companyId === c.id && <Check className="h-4 w-4 text-primary" />}
          </button>
        ))}
      </div>
    ),
    credentials: (
      <div className="space-y-4">
        {selectedCo?.slug === "digylog" ? (
          <>
            <Field label="Token API">
              <input type="password" value={form.apiToken ?? ""} onChange={e => set("apiToken", e.target.value)}
                placeholder={store ? "Laisser vide pour conserver l'actuel" : "Coller le token ici"}
                className="field-input font-mono text-xs" />
            </Field>
            <details className="group">
              <summary className="text-xs text-muted-foreground cursor-pointer list-none flex items-center gap-1">
                <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
                Paramètres avancés
              </summary>
              <div className="mt-3 pl-4 border-l space-y-3">
                <Field label="URL API">
                  <input value={form.apiBaseUrl ?? ""} onChange={e => set("apiBaseUrl", e.target.value)}
                    placeholder="https://seller.digylog.com/api" className="field-input text-xs font-mono" />
                </Field>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Webhook URL</p>
                  <div className="rounded-lg bg-secondary/30 px-3 py-2 text-xs font-mono break-all text-muted-foreground">
                    {typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/delivery/digylog
                  </div>
                </div>
              </div>
            </details>
          </>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">
              Intégration {selectedCo?.name ?? "provider"} à venir.
            </p>
          </div>
        )}
      </div>
    ),
    sheet: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Connectez un Google Sheet pour la synchronisation automatique.
        </p>
        <Field label="ID du Spreadsheet">
          <input value={form.googleSheetId ?? ""} onChange={e => set("googleSheetId", e.target.value)}
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            className="field-input font-mono text-xs" />
        </Field>
        <Field label="Nom de l'onglet">
          <input value={form.googleSheetName ?? ""} onChange={e => set("googleSheetName", e.target.value)}
            placeholder="Feuille 1" className="field-input" />
        </Field>
      </div>
    ),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-2">
          <div>
            <p className="font-semibold">{isCreate ? "Nouveau store" : `Modifier — ${store!.name}`}</p>
            <p className="text-xs text-muted-foreground">{STEPS[idx].label}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Steps */}
        <div className="flex gap-1.5 px-6 pb-4">
          {STEPS.map((s, i) => (
            <div key={s.id} className={cn("h-1.5 rounded-full transition-all",
              i === idx ? "flex-[2] bg-primary" : i < idx ? "flex-1 bg-primary/40" : "flex-1 bg-secondary"
            )} />
          ))}
        </div>
        {/* Content */}
        <div className="px-6 pb-4 min-h-[200px]">
          {stepContent[step]}
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        </div>
        {/* Footer */}
        <div className="flex justify-between gap-3 px-6 py-4 border-t">
          <button type="button" onClick={idx === 0 ? onClose : () => setStep(STEPS[idx - 1].id)}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-secondary transition-colors">
            {idx === 0 ? "Annuler" : "Retour"}
          </button>
          {isLast ? (
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Enregistrement…" : isCreate ? "Créer" : "Enregistrer"}
            </button>
          ) : (
            <button type="button" onClick={() => setStep(STEPS[idx + 1].id)}
              className="flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-5 py-2 text-sm font-bold hover:opacity-90">
              Suivant <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <style>{`.field-input{width:100%;height:36px;padding:0 12px;border-radius:8px;border:1px solid hsl(var(--border));background:hsl(var(--background));font-size:14px;outline:none}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <button type="button" onClick={() => onChange(!checked)}
        className={cn("h-5 w-9 rounded-full transition-colors flex items-center px-0.5", checked ? "bg-primary" : "bg-secondary")}>
        <div className={cn("h-4 w-4 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-4" : "translate-x-0")} />
      </button>
      <span className="text-sm text-muted-foreground">{label}</span>
    </label>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function DeliveryProvidersClient({ stores, companies }: {
  stores: DeliveryStoreRow[];
  companies: Company[];
}) {
  const [modal, setModal] = useState<DeliveryStoreRow | "create" | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{stores.length} store(s)</p>
        <button type="button" onClick={() => setModal("create")}
          className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </button>
      </div>

      {stores.length === 0 && (
        <div className="rounded-2xl border border-dashed py-14 text-center">
          <p className="text-sm font-medium">Aucun store</p>
          <p className="text-xs text-muted-foreground mt-1">Créez votre premier compte livraison.</p>
        </div>
      )}

      {stores.map(s => (
        <StoreCard key={s.id} store={s} onEdit={() => setModal(s)} />
      ))}

      {modal !== null && (
        <WizardModal
          store={modal === "create" ? null : modal}
          companies={companies}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
