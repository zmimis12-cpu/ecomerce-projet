"use client";
import { useState, useTransition } from "react";
import { setSettings } from "@/lib/settings/settings-service";
import { cn } from "@/lib/utils";
import {
  Settings, Truck, BarChart3, ScanLine,
  Phone, FileSpreadsheet, Users, CheckCircle2, X
} from "lucide-react";
import { UsersTab } from "@/components/settings/users-tab";
import type { UserRow } from "@/lib/settings/users-constants";

interface SettingRow {
  key: string; value: unknown; category: string;
  label: string | null; description: string | null;
}

const TABS = [
  { id: "general",       label: "Général",        icon: Settings },
  { id: "delivery",      label: "Livraison",       icon: Truck },
  { id: "finance",       label: "Finance",         icon: BarChart3 },
  { id: "scanner",       label: "Scanner",         icon: ScanLine },
  { id: "call_center",   label: "Call Center",     icon: Phone },
  { id: "google_sheets", label: "Google Sheets",   icon: FileSpreadsheet },
  { id: "users",         label: "Utilisateurs",    icon: Users },
] as const;

type TabId = typeof TABS[number]["id"];

// Setting metadata — labels, types, descriptions
const SETTING_META: Record<string, { label: string; description?: string; type: "text" | "number" | "boolean" | "password" }> = {
  // General
  company_name:            { label: "Nom de la société",           type: "text" },
  timezone:                { label: "Fuseau horaire",               type: "text" },
  currency:                { label: "Devise",                       type: "text" },
  language:                { label: "Langue",                       type: "text" },
  // Delivery
  digylog_base_url:        { label: "Digylog Base URL",            type: "text" },
  delivery_fee_casa:       { label: "Frais livraison Casa (MAD)",  type: "number", description: "Frais réels facturés par Digylog pour Casablanca" },
  delivery_fee_other:      { label: "Frais autres villes (MAD)",   type: "number", description: "Frais réels pour les autres villes" },
  delivery_fee_client:     { label: "Frais client (MAD)",          type: "number", description: "Toujours 35 MAD — ne pas modifier" },
  return_fee_default:      { label: "Frais retour défaut (MAD)",   type: "number" },
  // Finance
  packaging_cost_default:  { label: "Coût emballage défaut (MAD)", type: "number" },
  call_center_cost_default:{ label: "Coût call center défaut (MAD)", type: "number" },
  overcharge_threshold:    { label: "Seuil surcharge détection (MAD)", type: "number" },
  // Scanner
  scanner_sounds_enabled:  { label: "Sons scanner",                type: "boolean" },
  scanner_fast_mode:       { label: "Mode ultra-rapide",           type: "boolean", description: "Clear input immédiatement après scan" },
  scanner_auto_process:    { label: "Traitement auto retours",     type: "boolean" },
  // Call Center
  cc_min_call_duration:    { label: "Durée min confirmation (sec)",type: "number", description: "Anti-fausses commandes — 20 sec minimum" },
  cc_commission_per_order: { label: "Commission / livraison (MAD)",type: "number" },
  cc_fake_rate_threshold:  { label: "Seuil taux fausses (%)",      type: "number" },
  // Google Sheets
  gsheet_auto_sync:        { label: "Sync automatique",            type: "boolean" },
  gsheet_sync_interval:    { label: "Intervalle sync (minutes)",   type: "number" },
};

export function SettingsClient({ settings, users = [] }: { settings: SettingRow[]; users?: UserRow[] }) {
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [values, setValues]       = useState<Record<string, unknown>>(() => {
    const map: Record<string, unknown> = {};
    for (const s of settings) map[s.key] = s.value;
    return map;
  });
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const tabSettings = settings.filter((s) => s.category === activeTab);

  function handleChange(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    const tabKeys = tabSettings.map((s) => s.key);
    const toSave  = Object.fromEntries(tabKeys.map((k) => [k, values[k]]));
    setMsg(null);
    startTransition(async () => {
      const res = await setSettings(toSave);
      setMsg(res.success
        ? { ok: true,  text: "✓ Paramètres sauvegardés." }
        : { ok: false, text: res.error ?? "Erreur." });
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-1">Configuration centralisée du système.</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar tabs */}
        <div className="w-48 shrink-0 space-y-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} type="button"
                onClick={() => { setActiveTab(tab.id); setMsg(null); }}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left",
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}>
                <Icon className="h-4 w-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Settings panel */}
        <div className="flex-1 rounded-xl border bg-card p-6 space-y-5">
          <div className="flex items-center justify-between border-b pb-4">
            <h2 className="font-semibold">{TABS.find((t) => t.id === activeTab)?.label}</h2>
            <div className="flex items-center gap-3">
              {msg && (
                <span className={cn("flex items-center gap-1.5 text-sm", msg.ok ? "text-green-600" : "text-red-600")}>
                  {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  {msg.text}
                </span>
              )}
              <button type="button" onClick={handleSave} disabled={isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
                {isPending ? "Sauvegarde…" : "Sauvegarder"}
              </button>
            </div>
          </div>

          {/* Users tab renders separately */}
          {activeTab === "users" && <UsersTab initialUsers={users} />}

          {activeTab !== "users" && tabSettings.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Aucun paramètre pour cette section.
            </p>
          )}

          {activeTab !== "users" && (
          <div className="space-y-4">
            {tabSettings.map((setting) => {
              const meta = SETTING_META[setting.key];
              const type = meta?.type ?? "text";
              const label = meta?.label ?? setting.label ?? setting.key;
              const description = meta?.description ?? setting.description;
              const val = values[setting.key];

              return (
                <div key={setting.key} className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <label className="text-sm font-medium block">{label}</label>
                    {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
                  </div>
                  <div className="w-64 shrink-0">
                    {type === "boolean" ? (
                      <button type="button"
                        onClick={() => handleChange(setting.key, !val)}
                        className={cn(
                          "relative h-6 w-11 rounded-full transition-colors focus:outline-none",
                          val ? "bg-primary" : "bg-secondary"
                        )}>
                        <span className={cn(
                          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                          val ? "translate-x-5" : "translate-x-0"
                        )} />
                      </button>
                    ) : type === "password" ? (
                      <input type="password" value={String(val ?? "")}
                        onChange={(e) => handleChange(setting.key, e.target.value)}
                        className="w-full h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    ) : type === "number" ? (
                      <input type="number" value={Number(val ?? 0)}
                        onChange={(e) => handleChange(setting.key, Number(e.target.value))}
                        className="w-full h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    ) : (
                      <input type="text" value={String(val ?? "")}
                        onChange={(e) => handleChange(setting.key, e.target.value)}
                        className="w-full h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
