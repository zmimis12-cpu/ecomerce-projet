"use client";
import { useState, useTransition } from "react";
import { Plus, RefreshCw, Trash2, Star } from "lucide-react";
import { addMetaAccount, updateMetaAccount, removeMetaAccount, recheckMetaAccounts } from "@/lib/ads/meta-accounts-actions";

type Acc = {
  key: string; label: string; adAccountId: string | null; isActive: boolean; isPrimary: boolean; autoPrimary?: boolean;
  pixelId?: string | null; pageId?: string | null; status?: string; lastError?: string | null; checkedAt?: string | null;
};
const IN = "h-9 rounded-md border bg-background px-3 text-sm";

export function MetaAccountsManager({ accounts }: { accounts: Acc[] }) {
  const [label, setLabel] = useState(""); const [token, setToken] = useState("");
  const [adAcc, setAdAcc] = useState(""); const [pixel, setPixel] = useState(""); const [primary, setPrimary] = useState(true);
  const [msg, setMsg] = useState(""); const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <div className="divide-y rounded-lg border">
        {accounts.length === 0 && <p className="p-4 text-sm text-muted-foreground">Aucun compte.</p>}
        {accounts.map((a) => (
          <div key={a.key} className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
            <div className="space-y-0.5">
              <div className="font-medium">
                {a.label} {a.isPrimary && <span className="ms-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">PRINCIPAL</span>}
                {a.autoPrimary && !a.isPrimary && <span className="ms-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">deviendra principal dès qu&apos;il sera prêt</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                Compte pub : {a.adAccountId ?? "—"} · Pixel : {a.pixelId ?? "—"} · Page : {a.pageId ?? "—"}
              </div>
              <div className="text-xs">
                {a.status === "ok" ? <span className="text-emerald-700">✅ Connecté</span>
                  : a.status === "error" ? <span className="text-red-600">❌ {a.lastError}</span>
                  : <span className="text-amber-700">⏳ {a.lastError ?? "En attente"}</span>}
                {a.checkedAt && <span className="text-muted-foreground"> · vérifié {new Date(a.checkedAt).toLocaleString("fr-FR")}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={a.isActive} disabled={pending}
                onChange={(e) => start(async () => { await updateMetaAccount(a.key, { isActive: e.target.checked }); })} /> Actif</label>
              {!a.isPrimary && (
                <button disabled={pending} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                  onClick={() => start(async () => { await updateMetaAccount(a.key, { isPrimary: true }); })}><Star className="h-3.5 w-3.5" /> Principal</button>
              )}
              <button disabled={pending} className="rounded-md border px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                onClick={() => { if (confirm(`Retirer ${a.label} du système ? (rien n'est supprimé chez Meta)`)) start(async () => { await removeMetaAccount(a.key); }); }}>
                <Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
      <button disabled={pending} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        onClick={() => start(async () => { const r = await recheckMetaAccounts(); setMsg(r.info ?? ""); })}>
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> Vérifier les accès maintenant
      </button>

      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <div className="text-sm font-medium">Ajouter un compte Meta</div>
        <div className="flex flex-wrap gap-2">
          <input className={IN} placeholder="Nom (ex : Dealsodt)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input className={IN + " w-80"} placeholder="Token utilisateur système" value={token} onChange={(e) => setToken(e.target.value)} />
          <input className={IN} placeholder="ID compte pub (optionnel)" value={adAcc} onChange={(e) => setAdAcc(e.target.value)} />
          <input className={IN} placeholder="ID pixel (optionnel)" value={pixel} onChange={(e) => setPixel(e.target.value)} />
        </div>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} />
          En faire le compte principal dès qu&apos;il est prêt (Lanceur, audience Acheteurs)</label>
        <button disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          onClick={() => start(async () => {
            const r = await addMetaAccount({ label, token, adAccountId: adAcc, pixelId: pixel, makePrimary: primary });
            setMsg(r.success ? r.info ?? "OK" : r.error ?? "Erreur"); if (r.success) { setToken(""); setLabel(""); setAdAcc(""); setPixel(""); }
          })}><Plus className="h-4 w-4" /> Ajouter</button>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
