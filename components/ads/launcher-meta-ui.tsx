"use client";
/**
 * Éditeur de campagne "comme Meta Ads Manager" : Campagne → Ensembles → Pubs.
 */
import { useState, useTransition } from "react";
import { Copy, Trash2, Save, Plus } from "lucide-react";
import {
  updateLaunchCampaign, saveAdset, duplicateAdset, deleteAdset, updateLaunchItem, type AdsetInput,
} from "@/lib/ads/launcher-actions";

const IN = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30";
const LBL = "block space-y-1 text-xs font-medium text-muted-foreground";
const BTN = "inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50";

export const OBJECTIVES = [
  { v: "OUTCOME_LEADS", l: "Prospects (commandes via le formulaire) — conseillé COD" },
  { v: "OUTCOME_SALES", l: "Ventes" },
  { v: "OUTCOME_TRAFFIC", l: "Trafic" },
];
export const EVENTS = [
  { v: "LEAD", l: "Prospect (Lead) — chaque commande" },
  { v: "PURCHASE", l: "Achat (Purchase) — commandes livrées" },
  { v: "INITIATED_CHECKOUT", l: "Paiement initié" },
  { v: "LANDING_PAGE_VIEWS", l: "Vues de la page de destination" },
  { v: "LINK_CLICKS", l: "Clics sur le lien" },
];
const FB_POS = [["feed", "Fil d'actualité"], ["story", "Stories"], ["facebook_reels", "Reels"], ["video_feeds", "Vidéos"], ["marketplace", "Marketplace"], ["search", "Recherche"]];
const IG_POS = [["stream", "Fil"], ["story", "Stories"], ["reels", "Reels"], ["explore", "Explorer"]];

/* ─────────────── 📣 Campagne ─────────────── */
export function CampaignPanel({ launchId, locked, initial }: {
  launchId: string; locked: boolean;
  initial: { name: string; objective: string; budgetMode: "abo" | "cbo"; campaignBudgetUsd: number | null };
}) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState(""); const [pending, start] = useTransition();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={LBL}>Nom de la campagne
        <input className={IN} disabled={locked} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
      <label className={LBL}>Objectif
        <select className={IN} disabled={locked} value={v.objective} onChange={(e) => setV({ ...v, objective: e.target.value })}>
          {OBJECTIVES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select></label>
      <div className={LBL}>Budget
        <div className="flex flex-wrap gap-3 pt-1 text-sm font-normal text-foreground">
          <label className="flex items-center gap-1.5"><input type="radio" disabled={locked} checked={v.budgetMode === "abo"} onChange={() => setV({ ...v, budgetMode: "abo" })} /> Budget par ensemble de pubs</label>
          <label className="flex items-center gap-1.5"><input type="radio" disabled={locked} checked={v.budgetMode === "cbo"} onChange={() => setV({ ...v, budgetMode: "cbo" })} /> Budget de campagne Advantage+</label>
        </div></div>
      {v.budgetMode === "cbo" && (
        <label className={LBL}>Budget quotidien de la campagne ($)
          <input className={IN} type="number" min={1} disabled={locked} value={v.campaignBudgetUsd ?? ""} onChange={(e) => setV({ ...v, campaignBudgetUsd: Number(e.target.value) })} /></label>
      )}
      {!locked && (
        <div className="flex items-center gap-2 sm:col-span-2">
          <button className={BTN} disabled={pending} onClick={() => start(async () => {
            const r = await updateLaunchCampaign(launchId, v); setMsg(r.success ? "✅ Enregistré" : r.error ?? "Erreur");
          })}><Save className="h-4 w-4" /> Enregistrer la campagne</button>
          {msg && <span className="text-sm">{msg}</span>}
        </div>
      )}
    </div>
  );
}

/* ─────────────── 🎯 Ensemble de pubs ─────────────── */
export function AdsetPanel({ launchId, adset, cbo, locked, suggestedCapUsd }: {
  launchId: string; cbo: boolean; locked: boolean; suggestedCapUsd?: number;
  adset: (AdsetInput & { id: string }) | null;
}) {
  const empty: AdsetInput = {
    name: "Nouvel ensemble", dailyBudgetUsd: 15, optimizationEvent: "LEAD", bidStrategy: "LOWEST_COST_WITHOUT_CAP", costCapUsd: null,
    ageMin: 18, ageMax: 65, genders: "all", advantageAudience: true, placements: "auto", startTime: null, endTime: null,
  };
  const [v, setV] = useState<AdsetInput>(adset ?? empty);
  const [msg, setMsg] = useState(""); const [pending, start] = useTransition();
  const manual = v.placements !== "auto";
  const pl = manual ? (v.placements as { facebook: string[]; instagram: string[] }) : { facebook: [], instagram: [] };
  const toggle = (net: "facebook" | "instagram", pos: string) => {
    const cur = new Set(pl[net]); if (cur.has(pos)) cur.delete(pos); else cur.add(pos);
    setV({ ...v, placements: { ...pl, [net]: [...cur] } });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={LBL + " sm:col-span-2"}>Nom de l&apos;ensemble de pubs
          <input className={IN} disabled={locked} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
        <label className={LBL + " sm:col-span-2"}>Événement de conversion (optimisation)
          <select className={IN} disabled={locked} value={v.optimizationEvent} onChange={(e) => setV({ ...v, optimizationEvent: e.target.value })}>
            {EVENTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select></label>

        {!cbo && (
          <>
            <label className={LBL}>Budget quotidien ($)
              <input className={IN} type="number" min={1} disabled={locked} value={v.dailyBudgetUsd} onChange={(e) => setV({ ...v, dailyBudgetUsd: Number(e.target.value) })} /></label>
            <label className={LBL}>Stratégie d&apos;enchère
              <select className={IN} disabled={locked} value={v.bidStrategy} onChange={(e) => setV({ ...v, bidStrategy: e.target.value, costCapUsd: e.target.value === "COST_CAP" ? (v.costCapUsd ?? suggestedCapUsd ?? null) : null })}>
                <option value="LOWEST_COST_WITHOUT_CAP">Volume le plus élevé</option>
                <option value="COST_CAP">Objectif de coût par résultat (Cost Cap)</option>
              </select></label>
            {v.bidStrategy === "COST_CAP" && (
              <label className={LBL}>Coût par résultat max ($)
                <input className={IN} type="number" min={0.1} step="0.01" disabled={locked} value={v.costCapUsd ?? ""} onChange={(e) => setV({ ...v, costCapUsd: Number(e.target.value) })} />
                {suggestedCapUsd && <span className="text-[10px] font-normal">Conseillé (rentable) : ≈ ${suggestedCapUsd}</span>}
              </label>
            )}
          </>
        )}
        {cbo && <p className="text-xs text-muted-foreground sm:col-span-2">Budget géré au niveau de la campagne (Advantage+).</p>}

        <label className={LBL}>Date de début (optionnel)
          <input className={IN} type="datetime-local" disabled={locked} value={v.startTime?.slice(0, 16) ?? ""} onChange={(e) => setV({ ...v, startTime: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>
        <label className={LBL}>Date de fin (optionnel)
          <input className={IN} type="datetime-local" disabled={locked} value={v.endTime?.slice(0, 16) ?? ""} onChange={(e) => setV({ ...v, endTime: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>
      </div>

      <div className="rounded-lg border p-3">
        <div className="mb-2 text-xs font-semibold text-muted-foreground">AUDIENCE</div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className={LBL}>Lieu<div className="pt-2 text-sm font-normal text-foreground">🇲🇦 Maroc (tout le pays)</div></div>
          <label className={LBL}>Âge min
            <input className={IN} type="number" min={18} max={65} disabled={locked} value={v.ageMin} onChange={(e) => setV({ ...v, ageMin: Number(e.target.value) })} /></label>
          <label className={LBL}>Âge max
            <input className={IN} type="number" min={18} max={65} disabled={locked} value={v.ageMax} onChange={(e) => setV({ ...v, ageMax: Number(e.target.value) })} /></label>
          <label className={LBL}>Genre
            <select className={IN} disabled={locked} value={v.genders} onChange={(e) => setV({ ...v, genders: e.target.value })}>
              <option value="all">Tous</option><option value="male">Hommes</option><option value="female">Femmes</option>
            </select></label>
        </div>
        <label className="mt-2 flex items-center gap-1.5 text-sm"><input type="checkbox" disabled={locked} checked={v.advantageAudience} onChange={(e) => setV({ ...v, advantageAudience: e.target.checked })} />
          Audience Advantage+ (Meta élargit automatiquement — conseillé)</label>
      </div>

      <div className="rounded-lg border p-3">
        <div className="mb-2 text-xs font-semibold text-muted-foreground">PLACEMENTS</div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="radio" disabled={locked} checked={!manual} onChange={() => setV({ ...v, placements: "auto" })} /> Placements Advantage+ (automatiques — conseillé)</label>
          <label className="flex items-center gap-1.5"><input type="radio" disabled={locked} checked={manual} onChange={() => setV({ ...v, placements: { facebook: ["feed", "story", "facebook_reels"], instagram: ["stream", "story", "reels"] } })} /> Placements manuels</label>
        </div>
        {manual && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div><div className="text-xs font-medium">Facebook</div>
              {FB_POS.map(([k, l]) => <label key={k} className="me-3 inline-flex items-center gap-1 text-sm"><input type="checkbox" disabled={locked} checked={pl.facebook.includes(k)} onChange={() => toggle("facebook", k)} /> {l}</label>)}</div>
            <div><div className="text-xs font-medium">Instagram</div>
              {IG_POS.map(([k, l]) => <label key={k} className="me-3 inline-flex items-center gap-1 text-sm"><input type="checkbox" disabled={locked} checked={pl.instagram.includes(k)} onChange={() => toggle("instagram", k)} /> {l}</label>)}</div>
          </div>
        )}
      </div>

      {!locked && (
        <div className="flex flex-wrap items-center gap-2">
          <button className={BTN} disabled={pending} onClick={() => start(async () => {
            const r = await saveAdset(launchId, adset?.id ?? null, v); setMsg(r.success ? "✅ Enregistré" : r.error ?? "Erreur");
          })}>{adset ? <><Save className="h-4 w-4" /> Enregistrer l&apos;ensemble</> : <><Plus className="h-4 w-4" /> Créer l&apos;ensemble</>}</button>
          {adset && (
            <>
              <button className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted" disabled={pending}
                onClick={() => start(async () => { const r = await duplicateAdset(launchId, adset.id); setMsg(r.success ? "✅ Dupliqué (avec ses pubs)" : r.error ?? ""); })}>
                <Copy className="h-4 w-4" /> Dupliquer</button>
              <button className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm text-red-600 hover:bg-red-50" disabled={pending}
                onClick={() => { if (confirm("Supprimer cet ensemble et ses pubs ?")) start(async () => { const r = await deleteAdset(launchId, adset.id); setMsg(r.success ? "" : r.error ?? ""); }); }}>
                <Trash2 className="h-4 w-4" /> Supprimer</button>
            </>
          )}
          {msg && <span className="text-sm">{msg}</span>}
        </div>
      )}
    </div>
  );
}

/* ─────────────── 🖼️ Pub : modifier les textes ─────────────── */
export function AdTextsEditor({ launchId, item, adsets, locked }: {
  launchId: string; locked: boolean; adsets: { id: string; name: string }[];
  item: { id: string; ad_name: string | null; primary_text: string; headline: string; description: string | null;
    display_link: string | null; url_override: string | null; cta: string; adset_ref: string | null };
}) {
  const [v, setV] = useState({
    adName: item.ad_name ?? "", primaryText: item.primary_text, headline: item.headline, description: item.description ?? "",
    displayLink: item.display_link ?? "", urlOverride: item.url_override ?? "", cta: item.cta, adsetRef: item.adset_ref ?? adsets[0]?.id ?? "",
  });
  const [msg, setMsg] = useState(""); const [pending, start] = useTransition();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className={LBL}>Nom de la pub<input className={IN} disabled={locked} value={v.adName} placeholder="auto : code + titre" onChange={(e) => setV({ ...v, adName: e.target.value })} /></label>
      <label className={LBL}>Ensemble de pubs
        <select className={IN} disabled={locked} value={v.adsetRef} onChange={(e) => setV({ ...v, adsetRef: e.target.value })}>
          {adsets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></label>
      <label className={LBL + " sm:col-span-2"}>Texte principal
        <textarea dir="auto" disabled={locked} className="min-h-[90px] w-full rounded-md border bg-background p-2 text-sm" value={v.primaryText} onChange={(e) => setV({ ...v, primaryText: e.target.value })} /></label>
      <label className={LBL}>Titre<input dir="auto" className={IN} disabled={locked} value={v.headline} onChange={(e) => setV({ ...v, headline: e.target.value })} /></label>
      <label className={LBL}>Description<input dir="auto" className={IN} disabled={locked} value={v.description} placeholder="ex : الدفع عند الاستلام" onChange={(e) => setV({ ...v, description: e.target.value })} /></label>
      <label className={LBL}>Bouton (appel à l&apos;action)
        <select className={IN} disabled={locked} value={v.cta} onChange={(e) => setV({ ...v, cta: e.target.value })}>
          <option value="ORDER_NOW">Commander</option><option value="SHOP_NOW">Acheter</option><option value="BUY_NOW">Acheter maintenant</option>
          <option value="LEARN_MORE">En savoir plus</option><option value="GET_OFFER">Profiter de l&apos;offre</option><option value="CONTACT_US">Nous contacter</option>
        </select></label>
      <label className={LBL}>Lien affiché (optionnel)<input className={IN} disabled={locked} value={v.displayLink} placeholder="hajtek.ma" onChange={(e) => setV({ ...v, displayLink: e.target.value })} /></label>
      <label className={LBL + " sm:col-span-2"}>URL du site web (vide = landing page du produit + code vidéo automatique)
        <input className={IN} disabled={locked} value={v.urlOverride} placeholder="https://hajtek.ma/lp/…?cr=V00X" onChange={(e) => setV({ ...v, urlOverride: e.target.value })} /></label>
      {!locked && (
        <div className="flex items-center gap-2 sm:col-span-2">
          <button className={BTN} disabled={pending} onClick={() => start(async () => {
            const r = await updateLaunchItem(launchId, item.id, v); setMsg(r.success ? "✅ Enregistré" : r.error ?? "Erreur");
          })}><Save className="h-4 w-4" /> Enregistrer la pub</button>
          {msg && <span className="text-sm">{msg}</span>}
        </div>
      )}
    </div>
  );
}
