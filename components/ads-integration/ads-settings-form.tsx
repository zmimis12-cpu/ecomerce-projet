"use client";

import { useState, useTransition } from "react";
import {
  saveAdPlatformSettings, testMetaConnection, syncMetaAdSpend,
  type AdPlatformSettings
} from "@/lib/ads/actions";

interface Props {
  platform: "meta" | "google" | "tiktok";
  settings: AdPlatformSettings | null;
}

const PLATFORM_CONFIG = {
  meta: {
    label: "Meta Ads",
    icon: "📘",
    color: "blue",
    tokenLabel: "Access Token",
    tokenPlaceholder: "Token System User (ne expire pas)",
    tokenHelp: "developers.facebook.com → System Users → Token avec permission ads_read",
    accountLabel: "Ad Account ID",
    accountPlaceholder: "act_1234567890123",
    accountHelp: "Ads Manager → Compte publicitaire → Paramètres → ID du compte",
  },
  google: {
    label: "Google Ads",
    icon: "🔴",
    color: "red",
    tokenLabel: "Developer Token + Access Token",
    tokenPlaceholder: "ya29.xxxxx (OAuth Access Token)",
    tokenHelp: "Google Ads API → OAuth 2.0 → Access Token avec scope adwords",
    accountLabel: "Customer ID",
    accountPlaceholder: "123-456-7890",
    accountHelp: "Google Ads → Paramètres → Numéro de client (format: XXX-XXX-XXXX)",
  },
  tiktok: {
    label: "TikTok Ads",
    icon: "⬛",
    color: "gray",
    tokenLabel: "Access Token",
    tokenPlaceholder: "xxxxxxxxxxxxxxxxxxxx",
    tokenHelp: "TikTok For Business → Apps → Access Token avec scope Ads Management",
    accountLabel: "Advertiser ID",
    accountPlaceholder: "1234567890123456789",
    accountHelp: "TikTok Ads Manager → Paramètres → Advertiser ID",
  },
} as const;

export function AdsSettingsForm({ platform, settings }: Props) {
  const config = PLATFORM_CONFIG[platform];
  const [accessToken, setAccessToken] = useState(settings?.access_token ?? "");
  const [accountId, setAccountId]     = useState(settings?.account_id ?? "");
  const [pending, startTransition]    = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [dateFrom, setDateFrom] = useState(() =>
    new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  function handleSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveAdPlatformSettings(platform, { access_token: accessToken, account_id: accountId });
      setMsg(res.ok ? { type: "ok", text: "Enregistré ✓" } : { type: "error", text: res.error ?? "Échec" });
    });
  }

  function handleTest() {
    setMsg(null);
    startTransition(async () => {
      // Only Meta test is implemented today — Google/TikTok show a placeholder
      if (platform !== "meta") {
        setMsg({ type: "ok", text: "Paramètres sauvegardés. Test de connexion disponible après intégration API." });
        return;
      }
      const res = await testMetaConnection();
      setMsg(res.ok
        ? { type: "ok", text: `Connexion réussie — ${res.accountName}` }
        : { type: "error", text: res.error ?? "Échec" });
    });
  }

  function handleSync() {
    setMsg(null);
    startTransition(async () => {
      if (platform !== "meta") {
        setMsg({ type: "ok", text: "Synchronisation Google/TikTok bientôt disponible." });
        return;
      }
      const res = await syncMetaAdSpend(dateFrom, dateTo);
      if (!res.ok) { setMsg({ type: "error", text: res.error ?? "Échec" }); return; }
      const unmatched = res.unmatchedCampaigns ?? [];
      setMsg({
        type: "ok",
        text: `${res.matchedProducts} produit(s) mis à jour — ${(res.totalSpendMatched ?? 0).toFixed(0)} MAD.${unmatched.length > 0 ? ` ${unmatched.length} campagne(s) sans SKU reconnu.` : ""}`,
      });
    });
  }

  const isConnected = !!(settings?.access_token && settings?.account_id);

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-xl">{config.icon}</span>
        <div>
          <h2 className="font-semibold text-sm">{config.label}</h2>
          {isConnected
            ? <span className="text-[10px] text-green-600 font-medium">● Connecté</span>
            : <span className="text-[10px] text-muted-foreground">● Non connecté</span>}
        </div>
      </div>

      {/* Token */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{config.tokenLabel}</label>
        <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)}
          placeholder={config.tokenPlaceholder}
          className="w-full rounded-md border px-3 py-2 text-sm" />
        <p className="text-[10px] text-muted-foreground">{config.tokenHelp}</p>
      </div>

      {/* Account ID */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{config.accountLabel}</label>
        <input type="text" value={accountId} onChange={(e) => setAccountId(e.target.value)}
          placeholder={config.accountPlaceholder}
          className="w-full rounded-md border px-3 py-2 text-sm" />
        <p className="text-[10px] text-muted-foreground">{config.accountHelp}</p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={handleSave} disabled={pending}
          className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium disabled:opacity-50">
          Enregistrer
        </button>
        <button onClick={handleTest} disabled={pending || !accessToken}
          className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50">
          Tester
        </button>
      </div>

      {/* Sync */}
      <div className="border-t pt-3 space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground">Synchroniser</p>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="space-y-0.5">
            <label className="text-[10px] text-muted-foreground">Du</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="rounded border px-2 py-1 text-xs" />
          </div>
          <div className="space-y-0.5">
            <label className="text-[10px] text-muted-foreground">Au</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="rounded border px-2 py-1 text-xs" />
          </div>
          <button onClick={handleSync} disabled={pending || !isConnected}
            className="rounded-md bg-blue-600 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            Sync
          </button>
        </div>
      </div>

      {/* Message */}
      {msg && (
        <p className={`text-xs rounded p-2 ${msg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </p>
      )}

      {/* Last sync */}
      {settings?.last_sync_at && (
        <p className="text-[10px] text-muted-foreground">
          Sync: {new Date(settings.last_sync_at).toLocaleString("fr-MA")}
          {settings.last_sync_status === "error" && (
            <span className="text-red-500"> — {settings.last_sync_error}</span>
          )}
        </p>
      )}
    </div>
  );
}
