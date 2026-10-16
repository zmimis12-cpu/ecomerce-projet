"use client";
/** Paramètres → Livraison → Speedaf */
import { useState, useTransition } from "react";
import { saveSpeedafConfig, testSpeedafConnection, subscribeSpeedafWebhook, runSpeedafSyncNow } from "@/lib/delivery/speedaf/actions";
import type { SpeedafConfig } from "@/lib/delivery/speedaf/types";
import { cn } from "@/lib/utils";

export function SpeedafSettings({ initial, hasSecret, webhookUrl }: { initial: SpeedafConfig; hasSecret: boolean; webhookUrl: string }) {
  const [cfg, setCfg] = useState<SpeedafConfig>({ ...initial, secretKey: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof SpeedafConfig>(k: K, v: SpeedafConfig[K]) => { setCfg((c) => ({ ...c, [k]: v })); setMsg(null); };
  const field = "h-10 w-full rounded-lg border bg-background px-3 text-sm";
  const run = (fn: () => Promise<{ ok?: boolean; success?: boolean; message?: string; error?: string }>) =>
    start(async () => { const r = await fn(); setMsg({ ok: !!(r.ok ?? r.success), text: r.message ?? r.error ?? (r.success ? "✅ Enregistré" : "Erreur") }); });

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Speedaf</h2>
          <p className="text-xs text-muted-foreground">Envoi des colis, étiquettes et suivi automatique via l&apos;API Speedaf (Open API v1.3).</p>
        </div>
        <Toggle on={cfg.enabled} onChange={(v) => set("enabled", v)} label={cfg.enabled ? "Activé" : "Désactivé"} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <L t="Environnement">
          <select className={field} value={cfg.env} onChange={(e) => set("env", e.target.value as SpeedafConfig["env"])}>
            <option value="uat">Test (UAT)</option>
            <option value="prod">Production</option>
          </select>
        </L>
        <L t="appCode (fourni par Speedaf)"><input className={field} value={cfg.appCode} onChange={(e) => set("appCode", e.target.value)} /></L>
        <L t="customerCode (fourni par Speedaf)"><input className={field} value={cfg.customerCode} onChange={(e) => set("customerCode", e.target.value)} /></L>
        <L t="platformSource (fourni par Speedaf)"><input className={field} value={cfg.platformSource} onChange={(e) => set("platformSource", e.target.value)} /></L>
        <L t={`secretKey webhook ${hasSecret ? "(déjà enregistré — laisser vide pour garder)" : "(facultatif)"}`}>
          <input type="password" className={field} value={cfg.secretKey} placeholder={hasSecret ? "••••••••" : ""} onChange={(e) => set("secretKey", e.target.value)} />
        </L>
      </div>

      <h3 className="pt-1 text-sm font-semibold">Expéditeur (ramassage)</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <L t="Nom"><input className={field} value={cfg.senderName} onChange={(e) => set("senderName", e.target.value)} /></L>
        <L t="Téléphone"><input className={field} value={cfg.senderMobile} placeholder="06…" onChange={(e) => set("senderMobile", e.target.value)} /></L>
        <L t="Adresse"><input className={field} value={cfg.senderAddress} onChange={(e) => set("senderAddress", e.target.value)} /></L>
        <L t="Région (Speedaf)"><input className={field} value={cfg.senderProvince} placeholder="Casablanca - Settat" onChange={(e) => set("senderProvince", e.target.value)} /></L>
        <L t="Ville"><input className={field} value={cfg.senderCity} onChange={(e) => set("senderCity", e.target.value)} /></L>
        <L t="Quartier"><input className={field} value={cfg.senderDistrict} onChange={(e) => set("senderDistrict", e.target.value)} /></L>
      </div>

      <h3 className="pt-1 text-sm font-semibold">Colis</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <L t="Format d'étiquette">
          <select className={field} value={cfg.labelType} onChange={(e) => set("labelType", Number(e.target.value) as SpeedafConfig["labelType"])}>
            <option value={5}>10×15 avec logo</option>
            <option value={2}>10×18 sans logo</option>
            <option value={46}>10×10 Maroc</option>
          </select>
        </L>
        <L t="Poids par article (kg)"><input type="number" step="0.1" className={field} value={cfg.defaultWeightKg} onChange={(e) => set("defaultWeightKg", Number(e.target.value))} /></L>
        <div className="flex items-end pb-1"><Toggle on={cfg.isAllowOpen === 1} onChange={(v) => set("isAllowOpen", v ? 1 : 0)} label="Le client peut ouvrir le colis" /></div>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <button disabled={pending} onClick={() => run(() => saveSpeedafConfig(cfg))}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {pending ? "…" : "Enregistrer"}
        </button>
        <button disabled={pending} onClick={() => run(testSpeedafConnection)} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50">Tester la connexion</button>
        <button disabled={pending} onClick={() => run(subscribeSpeedafWebhook)} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50">Activer le suivi temps réel (webhook)</button>
        <button disabled={pending} onClick={() => run(async () => { const r = await runSpeedafSyncNow(); return { ok: r.ok, message: r.ok ? `Synchro : ${("checked" in r ? r.checked : 0) ?? 0} colis vérifiés` : String((r as { error?: string }).error) }; })}
          className="rounded-lg border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50">Synchroniser les statuts</button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Webhook : <code>{webhookUrl}</code>{initial.webhookSubscribedAt ? ` · activé le ${new Date(initial.webhookSubscribedAt).toLocaleString("fr-FR")}` : ""} ·
        Sans webhook, les statuts sont mis à jour automatiquement toutes les 15 min.
      </p>
      {msg && <p className={cn("rounded-md px-3 py-2 text-sm", msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")}>{msg.text}</p>}
    </div>
  );
}

function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="block space-y-1 text-sm"><span className="text-xs font-medium text-muted-foreground">{t}</span>{children}</label>;
}
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-2 text-sm">
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-green-500" : "bg-muted-foreground/30")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
      </span>
      {label}
    </button>
  );
}
