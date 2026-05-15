"use client";
/**
 * Delivery Stores UX — clean SaaS style
 * Store cards → click → modal edit
 * Provider-specific fields appear dynamically
 */
import { useState, useTransition } from "react";
import {
  createDeliveryStore, updateDeliveryStore, testStoreConnection,
} from "@/lib/delivery/store-actions";
import type { DeliveryStoreRow } from "@/lib/delivery/store-actions";
import {
  Plus, X, Check, Loader2, Zap, ChevronRight,
  Wifi, WifiOff, Star, ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Company = { id: string; slug: string; name: string; is_active: boolean };

const PROVIDER_ICONS: Record<string, string> = {
  digylog: "🚚",
  ozone:   "⚡",
};

// ─── Store card ───────────────────────────────────────────────────────────────
function StoreCard({ store, onClick }: { store: DeliveryStoreRow; onClick: () => void }) {
  const company = store.delivery_companies;
  const icon    = PROVIDER_ICONS[company?.slug ?? ""] ?? "📦";
  const hasSheet = !!store.google_sheet_id;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full text-left rounded-2xl border bg-card p-5 transition-all duration-150",
        "hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5",
        !store.is_active && "opacity-50"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3.5">
          <div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center text-xl shrink-0">
            {icon}
          </div>
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
              {company?.name ?? "—"}
              {store.delivery_fee_mad ? ` · ${store.delivery_fee_mad} MAD/livraison` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasSheet && (
            <span className="text-[10px] bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-semibold flex items-center gap-1">
              <Check className="h-2.5 w-2.5" /> Sheet
            </span>
          )}
          <span className={cn(
            "text-[10px] rounded-full px-2 py-0.5 font-semibold",
            store.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
          )}>
            {store.is_active ? "Actif" : "Inactif"}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
      </div>
    </button>
  );
}

// ─── Provider-specific field sets ─────────────────────────────────────────────
function ProviderFields({
  providerSlug,
  form,
  setForm,
}: {
  providerSlug: string;
  form: Record<string, string | boolean | number>;
  setForm: (updater: (prev: Record<string, string | boolean | number>) => Record<string, string | boolean | number>) => void;
}) {
  if (!providerSlug || providerSlug === "none") {
    return (
      <div className="rounded-xl border border-dashed bg-secondary/20 px-4 py-6 text-center text-sm text-muted-foreground">
        Sélectionnez un transporteur pour voir les champs de configuration.
      </div>
    );
  }

  const field = (key: string, label: string, type = "text", placeholder = "") => (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      <input
        type={type}
        value={String(form[key] ?? "")}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );

  if (providerSlug === "digylog") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-1.5 w-1.5 rounded-full bg-primary" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Configuration Digylog</p>
        </div>
        {field("apiToken", "Token API", "password", "Collez votre token ici")}
        {field("apiBaseUrl", "URL API (optionnel)", "text", "https://api.digylog.com/api/v2/seller")}
        <div className="rounded-lg border bg-secondary/20 px-3 py-2.5">
          <p className="text-xs font-medium text-muted-foreground mb-0.5">Webhook URL</p>
          <p className="text-xs font-mono text-muted-foreground break-all">
            {`${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/delivery/digylog`}
          </p>
        </div>
      </div>
    );
  }

  if (providerSlug === "ozone") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-1.5 w-1.5 rounded-full bg-primary" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Configuration Ozone</p>
        </div>
        {field("apiToken", "Token API Ozone", "password", "Token Ozone Express")}
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5">
          <p className="text-xs text-amber-700">⚠ Intégration Ozone à venir — token sera activé lors du déploiement.</p>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Store edit / create modal ────────────────────────────────────────────────
function StoreModal({
  store,
  companies,
  onClose,
  onSaved,
}: {
  store: DeliveryStoreRow | null; // null = create mode
  companies: Company[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isCreate = !store;
  const [isPending, start] = useTransition();
  const [testPending, startTest] = useTransition();
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const defaultCompany = companies.find((c) => c.slug === "digylog") ?? companies[0];

  const [form, setForm] = useState<Record<string, string | boolean | number>>({
    companyId:       store ? (store.delivery_companies?.id ?? defaultCompany?.id ?? "") : (defaultCompany?.id ?? ""),
    name:            store?.name ?? "",
    clientName:      (store?.metadata?.client_name as string) ?? "",
    clientPhone:     (store?.metadata?.client_phone as string) ?? "",
    apiToken:        "",
    apiBaseUrl:      store?.api_base_url ?? "",
    googleSheetId:   store?.google_sheet_id ?? "",
    googleSheetName: store?.google_sheet_name ?? "",
    deliveryFeeMad:  store?.delivery_fee_mad ?? 25,
    isActive:        store?.is_active ?? true,
    isDefault:       store?.is_default ?? false,
  });

  const selectedCompany = companies.find((c) => c.id === String(form.companyId));

  function handleSave() {
    if (!String(form.name).trim()) { setError("Nom du store requis."); return; }
    if (!String(form.companyId)) { setError("Transporteur requis."); return; }
    setError(null);

    start(async () => {
      const payload = {
        companyId:       String(form.companyId),
        name:            String(form.name).trim(),
        slug:            String(form.name).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
        apiToken:        String(form.apiToken || ""),
        apiBaseUrl:      String(form.apiBaseUrl || ""),
        googleSheetId:   String(form.googleSheetId || ""),
        googleSheetName: String(form.googleSheetName || ""),
        deliveryFeeMad:  Number(form.deliveryFeeMad) || 25,
        isActive:        Boolean(form.isActive),
        isDefault:       Boolean(form.isDefault),
        clientName:      String(form.clientName || ""),
        clientPhone:     String(form.clientPhone || ""),
        fulfillmentFee:  0,
      };

      const res = isCreate
        ? await createDeliveryStore(payload)
        : await updateDeliveryStore(store!.id, payload);

      if (res.success) { onSaved(); onClose(); }
      else setError(res.error ?? "Erreur");
    });
  }

  function handleTest() {
    if (!store) return;
    setTestResult(null);
    startTest(async () => {
      const res = await testStoreConnection(store.id);
      setTestResult(res);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/5 flex items-center justify-center text-lg">
              {PROVIDER_ICONS[selectedCompany?.slug ?? ""] ?? "📦"}
            </div>
            <div>
              <p className="font-semibold text-sm">{isCreate ? "Nouveau Store" : store!.name}</p>
              <p className="text-xs text-muted-foreground">{isCreate ? "Configurer un nouveau compte livraison" : "Modifier la configuration"}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border p-1.5 hover:bg-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nom du store *</label>
              <input
                value={String(form.name)} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="ex: Hajtekzone, Afrizone…"
                className="w-full h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Client / Nom</label>
              <input
                value={String(form.clientName)} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                placeholder="Nom société client"
                className="w-full h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Frais livraison (MAD)</label>
              <input
                type="number" value={Number(form.deliveryFeeMad)}
                onChange={(e) => setForm((f) => ({ ...f, deliveryFeeMad: parseFloat(e.target.value) || 0 }))}
                className="w-full h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Provider selector */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Transporteur *</label>
            <div className="grid grid-cols-2 gap-2">
              {companies.map((c) => (
                <button
                  key={c.id} type="button"
                  onClick={() => setForm((f) => ({ ...f, companyId: c.id }))}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium transition-all",
                    String(form.companyId) === c.id
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border hover:bg-secondary/50 text-muted-foreground"
                  )}
                >
                  <span className="text-lg">{PROVIDER_ICONS[c.slug] ?? "📦"}</span>
                  {c.name}
                  {String(form.companyId) === c.id && <Check className="h-3.5 w-3.5 text-primary ml-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* Provider-specific fields */}
          <ProviderFields
            providerSlug={selectedCompany?.slug ?? ""}
            form={form}
            setForm={setForm as never}
          />

          {/* Google Sheet */}
          <div className="rounded-xl border bg-secondary/10 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Google Sheet</p>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Sheet ID</label>
              <input
                value={String(form.googleSheetId)}
                onChange={(e) => setForm((f) => ({ ...f, googleSheetId: e.target.value }))}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                className="w-full h-9 rounded-lg border bg-background px-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Onglet (feuille)</label>
              <input
                value={String(form.googleSheetName)}
                onChange={(e) => setForm((f) => ({ ...f, googleSheetName: e.target.value }))}
                placeholder="Feuille 1"
                className="w-full h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-6">
            {[
              { key: "isActive",  label: "Store actif" },
              { key: "isDefault", label: "Store par défaut" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setForm((f) => ({ ...f, [key]: !f[key] }))}
                  className={cn(
                    "h-5 w-9 rounded-full transition-colors cursor-pointer flex items-center px-0.5",
                    Boolean(form[key]) ? "bg-primary" : "bg-secondary"
                  )}
                >
                  <div className={cn(
                    "h-4 w-4 rounded-full bg-white shadow transition-transform",
                    Boolean(form[key]) ? "translate-x-4" : "translate-x-0"
                  )} />
                </div>
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>

          {/* Test connection */}
          {!isCreate && (
            <div className="space-y-2">
              <button type="button" onClick={handleTest} disabled={testPending}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                {testPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Wifi className="h-4 w-4" />}
                {testPending ? "Test en cours…" : "Tester la connexion"}
              </button>
              {testResult && (
                <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
                  testResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                )}>
                  {testResult.success ? <Wifi className="h-3.5 w-3.5 shrink-0" /> : <WifiOff className="h-3.5 w-3.5 shrink-0" />}
                  {testResult.message}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t bg-secondary/5">
          <button type="button" onClick={onClose}
            className="rounded-xl border px-5 py-2.5 text-sm font-medium hover:bg-secondary transition-colors">
            Annuler
          </button>
          <button type="button" onClick={handleSave} disabled={isPending}
            className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isPending ? "Enregistrement…" : isCreate ? "Créer le store" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="h-16 w-16 rounded-2xl bg-primary/5 flex items-center justify-center">
        <ShoppingBag className="h-7 w-7 text-primary/50" />
      </div>
      <div className="text-center">
        <p className="font-semibold">Aucun store configuré</p>
        <p className="text-sm text-muted-foreground mt-1">Ajoutez votre premier compte de livraison.</p>
      </div>
      <button type="button" onClick={onCreate}
        className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity">
        <Plus className="h-4 w-4" /> Ajouter un store
      </button>
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
  const [stores]                  = useState(initialStores);
  const [modalStore, setModal]    = useState<DeliveryStoreRow | "create" | null>(null);

  function refresh() { window.location.reload(); }

  const byCompany = companies.map((c) => ({
    company: c,
    stores:  stores.filter((s) => s.delivery_companies?.id === c.id),
  })).filter((g) => g.stores.length > 0);

  const allStores = stores;

  return (
    <div className="space-y-4">

      {/* Header bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {allStores.length} store{allStores.length !== 1 ? "s" : ""} configuré{allStores.length !== 1 ? "s" : ""}
        </p>
        <button type="button" onClick={() => setModal("create")}
          className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity">
          <Plus className="h-4 w-4" /> Ajouter un store
        </button>
      </div>

      {/* Store list */}
      {allStores.length === 0 ? (
        <EmptyState onCreate={() => setModal("create")} />
      ) : (
        <div className="space-y-2">
          {allStores.map((s) => (
            <StoreCard key={s.id} store={s} onClick={() => setModal(s)} />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalStore !== null && (
        <StoreModal
          store={modalStore === "create" ? null : modalStore}
          companies={companies}
          onClose={() => setModal(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
