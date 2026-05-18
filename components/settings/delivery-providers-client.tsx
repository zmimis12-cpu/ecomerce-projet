"use client";
// ─── Sync result badges ───────────────────────────────────────────────────────
function SyncResultBadges({ result }: { result: FullSyncResult }) {
  const items = [
    { key: "statuses" as const, label: "Statuts" },
    { key: "bl"       as const, label: "BL" },
    { key: "invoices" as const, label: "Factures" },
    { key: "refunds"  as const, label: "Remb." },
    { key: "br"       as const, label: "BR" },
  ];
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {items.map(({ key, label }) => {
        const r = result[key];
        return (
          <span key={key} title={r.message}
            className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold cursor-help",
              !r.available ? "bg-gray-100 text-gray-400" :
              r.success    ? "bg-green-100 text-green-700" :
                             "bg-amber-100 text-amber-600"
            )}>
            {!r.available ? "—" : r.success ? "✓" : "!"}{" "}{label}
            {r.available && r.synced > 0 && ` ×${r.synced}`}
          </span>
        );
      })}
      {result.reconciled && (
        <span className="inline-flex rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
          ✓ Réconcilié
        </span>
      )}
    </div>
  );
}

import { useState, useTransition } from "react";
import {
  createDeliveryStore, updateDeliveryStore, testStoreConnection,
} from "@/lib/delivery/store-actions";
import { syncProviderDocuments } from "@/lib/delivery/providers/document-sync";
import type { FullSyncResult } from "@/lib/delivery/providers/document-sync-types";
import type { DeliveryStoreRow } from "@/lib/delivery/store-actions";
import { Plus, X, Check, Loader2, Wifi, WifiOff, RefreshCw, ChevronRight, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Company = { id: string; slug: string; name: string };

// ─── Operational store card ───────────────────────────────────────────────────
function StoreCard({
  store,
  onEdit,
}: {
  store: DeliveryStoreRow;
  onEdit: () => void;
}) {
  const [syncing, startSync]   = useTransition();
  const [syncMsg, setSyncMsg]  = useState<string | null>(null);
  const [syncRes, setSyncRes]  = useState<FullSyncResult | null>(null);
  const [testing, startTest] = useTransition();
  const [connStatus, setConnStatus] = useState<"idle" | "ok" | "error">("idle");

  const company = store.delivery_companies;
  const hasSheet = !!store.google_sheet_id;
  const hasToken = !!(store as DeliveryStoreRow & { api_token?: string }).api_token;

  function handleTest() {
    setConnStatus("idle");
    startTest(async () => {
      const r = await testStoreConnection(store.id);
      setConnStatus(r.success ? "ok" : "error");
      setTimeout(() => setConnStatus("idle"), 4000);
    });
  }

  return (
    <div className={cn(
      "rounded-2xl border bg-card overflow-hidden transition-all",
      !store.is_active && "opacity-60"
    )}>
      {/* Main row */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* Status dot */}
        <div className={cn(
          "h-2.5 w-2.5 rounded-full shrink-0 mt-0.5",
          store.is_active ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" : "bg-gray-300"
        )} />

        {/* Store info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">{store.name}</p>
            {store.is_default && (
              <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-bold">
                Défaut
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">{company?.name ?? "—"}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{store.delivery_fee_mad ?? 25} MAD</span>
            <span className="text-xs text-muted-foreground">·</span>
            {hasSheet ? (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <Check className="h-3 w-3" /> Sheet
              </span>
            ) : (
              <span className="text-xs text-muted-foreground/50">Sheet —</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Connection test */}
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            title="Tester la connexion"
            className={cn(
              "h-8 w-8 rounded-lg border flex items-center justify-center transition-all",
              connStatus === "ok"    && "border-green-300 bg-green-50 text-green-600",
              connStatus === "error" && "border-red-300 bg-red-50 text-red-600",
              connStatus === "idle"  && "hover:bg-secondary text-muted-foreground"
            )}
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : connStatus === "ok" ? (
              <Wifi className="h-3.5 w-3.5" />
            ) : connStatus === "error" ? (
              <WifiOff className="h-3.5 w-3.5" />
            ) : (
              <Wifi className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Edit */}
          <button
            type="button"
            onClick={onEdit}
            className="h-8 px-3 rounded-lg border text-xs font-medium hover:bg-secondary transition-colors"
          >
            Modifier
          </button>
        </div>
      </div>

      {/* Sync bar (always visible) */}
      <div className="border-t bg-secondary/10 px-5 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {syncMsg ? (
            <span className="text-xs text-muted-foreground animate-pulse">{syncMsg}</span>
          ) : syncRes ? (
            <SyncResultBadges result={syncRes} />
          ) : (
            <span className="text-xs text-muted-foreground">
              {(store.metadata as Record<string,unknown>)?.last_sync_at
                ? `Sync: ${new Date(String((store.metadata as Record<string,unknown>).last_sync_at)).toLocaleTimeString("fr-MA")}`
                : "Prêt à synchroniser"}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setSyncMsg("Synchronisation en cours…");
            setSyncRes(null);
            syncProviderDocuments(store.id).then((r) => {
              setSyncRes(r);
              setSyncMsg(null);
              setTimeout(() => setSyncRes(null), 30000);
            }).catch((e) => {
              setSyncMsg(`✕ ${String(e)}`);
              setTimeout(() => setSyncMsg(null), 8000);
            });
          }}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
          Sync maintenant
        </button>
      </div>
    </div>
  );
}

// ─── Multi-step wizard ────────────────────────────────────────────────────────
type WizardStep = "info" | "provider" | "credentials" | "sheet";

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "info",        label: "Infos" },
  { id: "provider",    label: "Transporteur" },
  { id: "credentials", label: "Accès" },
  { id: "sheet",       label: "Sheet" },
];

function WizardModal({
  store,
  companies,
  onClose,
  onSaved,
}: {
  store: DeliveryStoreRow | null;
  companies: Company[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isCreate = !store;
  const defaultCompany = companies.find((c) => c.slug === "digylog") ?? companies[0];

  const [step, setStep]           = useState<WizardStep>(isCreate ? "info" : "info");
  const [saving, startSave]       = useTransition();
  const [error, setError]         = useState<string | null>(null);

  const [form, setForm] = useState({
    companyId:       store?.delivery_companies?.id ?? defaultCompany?.id ?? "",
    name:            store?.name ?? "",
    clientName:      String(store?.metadata?.client_name ?? ""),
    deliveryFeeMad:  store?.delivery_fee_mad ?? 25,
    apiToken:        "",
    apiBaseUrl:      store?.api_base_url ?? "",
    googleSheetId:   store?.google_sheet_id ?? "",
    googleSheetName: store?.google_sheet_name ?? "",
    isActive:        store?.is_active ?? true,
    isDefault:       store?.is_default ?? false,
  });

  const selectedCompany = companies.find((c) => c.id === form.companyId);
  const stepIdx = STEPS.findIndex((s) => s.id === step);

  function set(key: string, val: unknown) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function nextStep() {
    const next = STEPS[stepIdx + 1];
    if (next) setStep(next.id);
  }

  function prevStep() {
    const prev = STEPS[stepIdx - 1];
    if (prev) setStep(prev.id);
  }

  function handleSave() {
    if (!form.name.trim()) { setError("Nom requis."); return; }
    setError(null);
    startSave(async () => {
      const payload = {
        companyId:       form.companyId,
        name:            form.name.trim(),
        slug:            form.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
        apiToken:        form.apiToken || undefined,
        apiBaseUrl:      form.apiBaseUrl || undefined,
        googleSheetId:   form.googleSheetId || undefined,
        googleSheetName: form.googleSheetName || undefined,
        deliveryFeeMad:  Number(form.deliveryFeeMad) || 25,
        isActive:        form.isActive,
        isDefault:       form.isDefault,
        clientName:      form.clientName || undefined,
        fulfillmentFee:  0,
      };
      const res = isCreate
        ? await createDeliveryStore(payload)
        : await updateDeliveryStore(store!.id, payload);
      if (res.success) { onSaved(); onClose(); }
      else setError(res.error ?? "Erreur");
    });
  }

  // ── Step content ─────────────────────────────────────────────────────────────
  const stepContent: Record<WizardStep, React.ReactNode> = {
    info: (
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium block mb-1.5">Nom du store</label>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="ex: Hajtekzone, Afrizone, Mon Store…"
            autoFocus
            className="w-full h-10 rounded-xl border bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1.5">Le nom public de ce compte livraison.</p>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1.5">Frais de livraison (MAD)</label>
          <div className="relative">
            <input
              type="number"
              value={form.deliveryFeeMad}
              onChange={(e) => set("deliveryFeeMad", parseFloat(e.target.value) || 0)}
              className="w-full h-10 rounded-xl border bg-background px-4 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">MAD</span>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Toggle checked={form.isActive} onChange={(v) => set("isActive", v)} label="Store actif" />
          <Toggle checked={form.isDefault} onChange={(v) => set("isDefault", v)} label="Par défaut" />
        </div>
      </div>
    ),

    provider: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground mb-2">Quel transporteur utilise ce store ?</p>
        {companies.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => set("companyId", c.id)}
            className={cn(
              "w-full flex items-center justify-between rounded-xl border px-4 py-3.5 text-sm transition-all",
              form.companyId === c.id
                ? "border-primary bg-primary/5 font-semibold"
                : "hover:bg-secondary/50 text-muted-foreground"
            )}
          >
            <span>{c.name}</span>
            {form.companyId === c.id && <Check className="h-4 w-4 text-primary" />}
          </button>
        ))}
        {companies.length === 0 && (
          <div className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
            Aucun transporteur configuré.
          </div>
        )}
      </div>
    ),

    credentials: (
      <div className="space-y-4">
        {selectedCompany?.slug === "digylog" && (
          <>
            <div>
              <label className="text-sm font-medium block mb-1.5">Token API</label>
              <input
                type="password"
                value={form.apiToken}
                onChange={(e) => set("apiToken", e.target.value)}
                placeholder={store ? "Laisser vide pour conserver l&apos;actuel" : "Coller le token ici"}
                className="w-full h-10 rounded-xl border bg-background px-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Disponible dans votre dashboard Digylog → API.
              </p>
            </div>
            <details className="group">
              <summary className="text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors list-none flex items-center gap-1">
                <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
                Paramètres avancés
              </summary>
              <div className="mt-3 pl-4 border-l space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">URL API</label>
                  <input
                    value={form.apiBaseUrl}
                    onChange={(e) => set("apiBaseUrl", e.target.value)}
                    placeholder="https://api.digylog.com/api/v2/seller"
                    className="w-full h-9 rounded-lg border bg-background px-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Webhook URL (à configurer chez Digylog)</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-9 rounded-lg border bg-secondary/20 px-3 flex items-center text-xs font-mono text-muted-foreground truncate">
                      {typeof window !== "undefined" ? window.location.origin : "https://votre-app.vercel.app"}/api/webhooks/delivery/digylog
                    </div>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/delivery/digylog`)}
                      className="h-9 px-3 rounded-lg border text-xs hover:bg-secondary transition-colors shrink-0"
                    >
                      Copier
                    </button>
                  </div>
                </div>
              </div>
            </details>
          </>
        )}

        {selectedCompany?.slug === "ozone" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Intégration Ozone — Bientôt disponible</p>
              <p className="text-xs text-amber-700 mt-1">
                L&apos;adaptateur Ozone Express sera activé prochainement.
                Vous pouvez créer le store maintenant.
              </p>
            </div>
          </div>
        )}

        {!selectedCompany && (
          <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
            Retournez à l&apos;étape précédente pour choisir un transporteur.
          </div>
        )}
      </div>
    ),

    sheet: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Connectez un Google Sheet pour la synchronisation automatique des commandes.
        </p>
        <div>
          <label className="text-sm font-medium block mb-1.5">ID du Spreadsheet</label>
          <input
            value={form.googleSheetId}
            onChange={(e) => set("googleSheetId", e.target.value)}
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            className="w-full h-10 rounded-xl border bg-background px-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            L&apos;ID se trouve dans l&apos;URL du spreadsheet Google.
          </p>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1.5">Nom de l&apos;onglet</label>
          <input
            value={form.googleSheetName}
            onChange={(e) => set("googleSheetName", e.target.value)}
            placeholder="Feuille 1"
            className="w-full h-10 rounded-xl border bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {!form.googleSheetId && (
          <p className="text-xs text-muted-foreground">
            Vous pouvez passer cette étape et configurer le sheet plus tard.
          </p>
        )}
      </div>
    ),
  };

  const isLastStep = stepIdx === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div>
            <p className="font-semibold">{isCreate ? "Nouveau store" : `Modifier — ${store!.name}`}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{STEPS[stepIdx].label}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-secondary transition-colors -mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1.5 px-6 pb-5">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => !isCreate || i < stepIdx + 1 ? setStep(s.id) : null}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-200",
                  i === stepIdx   ? "w-6 bg-primary" :
                  i < stepIdx     ? "w-3 bg-primary/40" :
                                    "w-3 bg-secondary"
                )}
              />
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 pb-5 min-h-[220px]">
          {stepContent[step]}
          {error && (
            <p className="text-sm text-red-600 mt-3">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t">
          <button
            type="button"
            onClick={stepIdx === 0 ? onClose : prevStep}
            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-secondary transition-colors"
          >
            {stepIdx === 0 ? "Annuler" : "Retour"}
          </button>
          {isLastStep ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Enregistrement…" : isCreate ? "Créer le store" : "Enregistrer"}
            </button>
          ) : (
            <button
              type="button"
              onClick={nextStep}
              className="flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-5 py-2 text-sm font-bold hover:opacity-90 transition-opacity"
            >
              Suivant <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Toggle component ─────────────────────────────────────────────────────────
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          "h-5 w-9 rounded-full transition-colors flex items-center px-0.5",
          checked ? "bg-primary" : "bg-secondary"
        )}
      >
        <div className={cn("h-4 w-4 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-4" : "translate-x-0")} />
      </button>
      <span className="text-sm text-muted-foreground">{label}</span>
    </label>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
export function DeliveryProvidersClient({
  stores: initialStores,
  companies,
}: {
  stores: DeliveryStoreRow[];
  companies: Company[];
}) {
  const [modal, setModal] = useState<DeliveryStoreRow | "create" | null>(null);

  function refresh() { window.location.reload(); }

  return (
    <div className="space-y-3">
      {/* Store list */}
      {initialStores.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-16 flex flex-col items-center gap-4 text-center">
          <p className="text-sm font-medium">Aucun store configuré</p>
          <p className="text-xs text-muted-foreground">Créez votre premier compte de livraison.</p>
          <button type="button" onClick={() => setModal("create")}
            className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" /> Créer un store
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">{initialStores.length} store{initialStores.length !== 1 ? "s" : ""}</p>
            <button type="button" onClick={() => setModal("create")}
              className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity">
              <Plus className="h-3.5 w-3.5" /> Ajouter
            </button>
          </div>
          {initialStores.map((s) => (
            <StoreCard key={s.id} store={s} onEdit={() => setModal(s)} />
          ))}
        </>
      )}

      {/* Wizard modal */}
      {modal !== null && (
        <WizardModal
          store={modal === "create" ? null : modal}
          companies={companies}
          onClose={() => setModal(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
