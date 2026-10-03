"use client";
import { useState, useTransition } from "react";
import { Link2, RefreshCw, Trash2 } from "lucide-react";
import { saveTikTokAppAction, getTikTokConnectUrl, updateTikTokAccount, removeTikTokAccount, recheckTikTok } from "@/lib/ads/tiktok-actions";

type Acc = { key: string; label: string; advertiserId: string; currency?: string | null; isActive: boolean; pixelCode?: string | null; taxPct?: number | null; status?: string; lastError?: string | null };
const IN = "h-9 rounded-md border bg-background px-3 text-sm";

export function TikTokConnect({ hasApp, appId, accounts, redirectUrl, flash }: {
  hasApp: boolean; appId: string | null; accounts: Acc[]; redirectUrl: string; flash?: { ok: boolean; msg: string } | null;
}) {
  const [id, setId] = useState(appId ?? ""); const [secret, setSecret] = useState("");
  const [msg, setMsg] = useState(flash?.msg ?? ""); const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      {flash && <p className={`text-sm ${flash.ok ? "text-emerald-700" : "text-red-600"}`}>{flash.ok ? "✅" : "❌"} {flash.msg}</p>}
      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <div className="text-sm font-medium">1. App TikTok (business-api.tiktok.com → My Apps)</div>
        <p className="text-xs text-muted-foreground">Redirect URL à mettre dans l&apos;app : <code>{redirectUrl}</code></p>
        <div className="flex flex-wrap gap-2">
          <input className={IN} placeholder="App ID" value={id} onChange={(e) => setId(e.target.value)} />
          <input className={IN + " w-72"} placeholder={hasApp ? "Secret (déjà enregistré — laisser vide)" : "Secret"} value={secret} onChange={(e) => setSecret(e.target.value)} />
          <button disabled={pending || !secret} className="h-9 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"
            onClick={() => start(async () => { const r = await saveTikTokAppAction(id, secret); setMsg(r.success ? r.info ?? "" : r.error ?? ""); if (r.success) setSecret(""); })}>Enregistrer</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending || !hasApp} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-black px-4 text-sm font-medium text-white disabled:opacity-40"
          onClick={() => start(async () => { const r = await getTikTokConnectUrl(); if (r.success && r.url) window.location.href = r.url; else setMsg(r.error ?? ""); })}>
          <Link2 className="h-4 w-4" /> 2. Connecter TikTok
        </button>
        <button disabled={pending} className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted"
          onClick={() => start(async () => { const r = await recheckTikTok(); setMsg(r.info ?? ""); })}><RefreshCw className="h-4 w-4" /> Vérifier</button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
      <div className="divide-y rounded-lg border">
        {accounts.length === 0 && <p className="p-3 text-sm text-muted-foreground">Aucun compte TikTok connecté.</p>}
        {accounts.map((a) => (
          <div key={a.key} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div>
              <div className="font-medium">{a.label}</div>
              <div className="text-xs text-muted-foreground">Devise {a.currency ?? "?"} · Pixel {a.pixelCode ?? "—"} · {a.status === "error" ? <span className="text-red-600">❌ {a.lastError}</span> : <span className="text-emerald-700">✅ Connecté</span>}</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs">TVA
                <input className="h-8 w-14 rounded border px-1" type="number" min={0} max={50} defaultValue={a.taxPct ?? 0}
                  onBlur={(e) => start(async () => { await updateTikTokAccount(a.key, { taxPct: Number(e.target.value) }); })} /> %</label>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={a.isActive} disabled={pending}
                onChange={(e) => start(async () => { await updateTikTokAccount(a.key, { isActive: e.target.checked }); })} /> Actif</label>
              <button className="rounded-md border px-2 py-1 text-xs text-red-600" disabled={pending}
                onClick={() => { if (confirm("Retirer ce compte TikTok du système ?")) start(async () => { await removeTikTokAccount(a.key); }); }}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
