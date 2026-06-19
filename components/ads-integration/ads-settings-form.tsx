"use client";

import { useState, useTransition } from "react";
import { saveAdPlatformSettings, testMetaConnection, syncMetaAdSpend, type AdPlatformSettings } from "@/lib/ads/actions";

interface Props {
  platform: "meta" | "google" | "tiktok";
  settings: AdPlatformSettings | null;
}

const PLATFORM_LABEL = { meta: "Meta Ads", google: "Google Ads", tiktok: "TikTok Ads" };

export function AdsSettingsForm({ platform, settings }: Props) {
  const [accessToken, setAccessToken] = useState(settings?.access_token ?? "");
  const [accountId, setAccountId]     = useState(settings?.account_id ?? "");
  const [pending, startTransition]    = useTransition();
  const [message, setMessage]         = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const [dateFrom, setDateFrom] = useState(() => new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10));
  const [dateTo, setDateTo]     = useState(() => new Date().toISOString().slice(0, 10));

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const res = await saveAdPlatformSettings(platform, { access_token: accessToken, account_id: accountId });
      setMessage(res.ok
        ? { type: "ok", text: "Paramètres enregistrés." }
        : { type: "error", text: res.error ?? "Échec de l'enregistrement." });
    });
  }

  function handleTest() {
    setMessage(null);
    startTransition(async () => {
      const res = await testMetaConnection();
      setMessage(res.ok
        ? { type: "ok", text: `Connexion réussie — compte: ${res.accountName}` }
        : { type: "error", text: res.error ?? "Échec de connexion." });
    });
  }

  function handleSync() {
    setMessage(null);
    startTransition(async () => {
      const res = await syncMetaAdSpend(dateFrom, dateTo);
      if (!res.ok) {
        setMessage({ type: "error", text: res.error ?? "Échec de synchronisation." });
        return;
      }
      const unmatched = res.unmatchedCampaigns ?? [];
      const unmatchedNote = unmatched.length > 0
        ? ` ${unmatched.length} campagne(s) sans SKU reconnu (vérifiez le nommage).`
        : "";
      setMessage({
        type: "ok",
        text: `${res.matchedProducts} produit(s) mis à jour — ${res.totalSpendMatched.toFixed(0)} MAD au total.${unmatchedNote}`,
      });
    });
  }

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4 max-w-xl">
      <h2 className="font-semibold text-sm">{PLATFORM_LABEL[platform]}</h2>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Access Token</label>
        <input
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder="Token système (System User) recommandé — n'expire pas"
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Ad Account ID</label>
        <input
          type="text"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          placeholder="act_1234567890123 (visible dans Ads Manager)"
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={pending}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50">
          Enregistrer
        </button>
        <button onClick={handleTest} disabled={pending || !settings}
          className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">
          Tester la connexion
        </button>
      </div>

      <div className="border-t pt-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">Synchroniser le coût publicitaire</p>
        <div className="flex gap-2 items-end">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Du</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Au</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm" />
          </div>
          <button onClick={handleSync} disabled={pending || !settings}
            className="rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">
            Synchroniser
          </button>
        </div>
      </div>

      {message && (
        <p className={`text-sm rounded-md p-2.5 ${message.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}

      {settings?.last_sync_at && (
        <p className="text-xs text-muted-foreground">
          Dernière synchronisation: {new Date(settings.last_sync_at).toLocaleString("fr-MA")}
          {settings.last_sync_status === "error" && settings.last_sync_error && (
            <span className="text-red-600"> — Erreur: {settings.last_sync_error}</span>
          )}
        </p>
      )}
    </div>
  );
}
