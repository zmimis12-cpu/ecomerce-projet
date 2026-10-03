"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rocket, Upload, Trash2, Play, Power, Wand2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getProductEconomics, createLaunch, getUploadUrl, addLaunchItem, deleteLaunchItem, runLaunch, activateLaunchAction, deleteLaunch,
} from "@/lib/ads/launcher-actions";
import type { Economics } from "@/lib/ads/launcher";

const INPUT = "h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30";
const BTN = "inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50";
const pct = (x: number) => `${Math.round(x * 100)} %`;

/* ─────────────── 1. Nouvelle campagne + économie du produit ─────────────── */
export function NewLaunchForm({ products }: { products: { id: string; name: string }[] }) {
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [eco, setEco] = useState<Economics | null>(null);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState(20);
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(65);
  const [maxDelivered, setMaxDelivered] = useState<number | "">("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  function pick(id: string) {
    setProductId(id); setEco(null); setMsg("");
    if (!id) return;
    const p = products.find((x) => x.id === id);
    start(async () => {
      const r = await getProductEconomics(id);
      if (r.success && r.data) {
        setEco(r.data.eco);
        setBudget(r.data.eco.suggestedBudgetUsd);
        setName(`${p?.name ?? "Produit"} — Test ${new Date().toLocaleDateString("fr-FR")}`);
      } else setMsg(r.error ?? "Erreur");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className={INPUT} value={productId} onChange={(e) => pick(e.target.value)}>
          <option value="">1. Choisis le produit…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {pending && <span className="text-xs text-muted-foreground">Calcul sur tes vraies données…</span>}
      </div>

      {eco && (
        <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-4 rounded-md bg-white p-2 text-xs">
            🎁 Offre utilisée (celle présélectionnée sur ta landing page) : <b>{eco.offer.label}</b> à <b>{eco.offer.price} MAD</b>
            {eco.offer.qty > 1 && <> — {eco.offer.qty} pièces</>}. Pour changer d&apos;offre : Landing Pages → Offres.
          </div>
          <div><div className="text-xs text-muted-foreground">Marge par livraison</div>
            <div className="font-semibold">{eco.marginPerDelivered} MAD</div>
            <div className="text-[10px] text-muted-foreground">{eco.price} − {eco.goodsCost} achat ({eco.offer.qty} pc) − {eco.deliveryFee} livraison</div></div>
          <div><div className="text-xs text-muted-foreground">Confirmation × livraison</div>
            <div className="font-semibold">{pct(eco.confirmRate)} × {pct(eco.deliveryRate)} = {pct(eco.ordersToDelivered)}</div>
            <div className="text-[10px] text-muted-foreground">{eco.history >= 10 ? `sur ${eco.history} commandes réelles` : "valeurs par défaut (peu d'historique)"}</div></div>
          <div><div className="text-xs text-muted-foreground">Coût / commande max (rentable)</div>
            <div className="font-semibold text-red-700">{eco.breakEvenCpoMad} MAD</div>
            <div className="text-[10px] text-muted-foreground">Objectif conseillé : <b>{eco.targetCpoMad} MAD</b></div></div>
          <div><div className="text-xs text-muted-foreground">Budget de test conseillé</div>
            <div className="font-semibold text-emerald-700">{eco.suggestedBudgetUsd} $ / jour</div>
            <div className="text-[10px] text-muted-foreground">≈ 3 commandes/jour à l&apos;objectif</div></div>
        </div>
      )}

      {eco && (
        <div className="flex flex-wrap items-center gap-2">
          <input className={INPUT + " w-72"} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la campagne" />
          <label className="flex items-center gap-1 text-sm">Budget
            <input className={INPUT + " w-20"} type="number" min={1} value={budget} onChange={(e) => setBudget(Number(e.target.value))} /> $/jour</label>
          <label className="flex items-center gap-1 text-sm">Âge
            <input className={INPUT + " w-16"} type="number" min={18} max={65} value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} />–
            <input className={INPUT + " w-16"} type="number" min={18} max={65} value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} /></label>
          <label className="flex items-center gap-1 text-sm">Pub max / livraison
            <input className={INPUT + " w-20"} type="number" min={0} placeholder="libre" value={maxDelivered}
              onChange={(e) => setMaxDelivered(e.target.value === "" ? "" : Number(e.target.value))} /> MAD</label>
          {maxDelivered !== "" && eco && (
            <span className={`text-xs ${Number(maxDelivered) * eco.ordersToDelivered < 25 ? "text-red-600" : "text-muted-foreground"}`}>
              = max {Math.round(Number(maxDelivered) * eco.ordersToDelivered)} MAD par commande
              (≈ ${(Number(maxDelivered) * eco.ordersToDelivered / eco.fxRate).toFixed(2)} par lead, plafond Meta « Cost Cap »)
              {Number(maxDelivered) * eco.ordersToDelivered < 25 && " — très bas : Meta risque de ne presque pas diffuser"}
            </span>
          )}
          <button className={BTN} disabled={pending} onClick={() => start(async () => {
            const r = await createLaunch({ name, productId, budgetUsd: budget, ageMin, ageMax, maxCostPerDeliveredMad: maxDelivered === "" ? null : Number(maxDelivered) });
            if (r.success && r.data) router.push(`/admin/ads/launch/${r.data.id}`); else setMsg(r.error ?? "Erreur");
          })}><Rocket className="h-4 w-4" /> Continuer : ajouter les vidéos / images</button>
        </div>
      )}
      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </div>
  );
}

/* ─────────────── 2. Ajout d'une pub (vidéo / image + textes) ─────────────── */
export function ItemEditor({ launchId, creatives, texts, adsets = [] }: {
  launchId: string;
  adsets?: { id: string; name: string }[];
  creatives: { id: string; code: string; title: string }[];
  texts: { headline: string; primary: string }[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [creativeId, setCreativeId] = useState("");
  const [headline, setHeadline] = useState(texts[0]?.headline ?? "");
  const [primary, setPrimary] = useState(texts[0]?.primary ?? "");
  const [cta, setCta] = useState("ORDER_NOW");
  const [adsetRef, setAdsetRef] = useState(adsets[0]?.id ?? "");
  const [description, setDescription] = useState("الدفع عند الاستلام — توصيل مجاني");
  const [adName, setAdName] = useState("");
  const [progress, setProgress] = useState("");
  const [pending, start] = useTransition();

  const add = () => start(async () => {
    if (!file) { setProgress("Choisis un fichier vidéo ou image."); return; }
    const type = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
    if (!type) { setProgress("Format non supporté (vidéo MP4/MOV ou image JPG/PNG)."); return; }
    setProgress(`Envoi du fichier (${Math.round(file.size / 1e6)} Mo)…`);
    const u = await getUploadUrl(file.name);
    if (!u.success || !u.data) { setProgress(u.error ?? "Erreur d'envoi"); return; }
    const { error } = await createClient().storage.from("ad-media").uploadToSignedUrl(u.data.path, u.data.token, file, { contentType: file.type });
    if (error) { setProgress(`Envoi échoué : ${error.message}`); return; }
    const r = await addLaunchItem(launchId, { creativeId: creativeId || null, mediaType: type, mediaPath: u.data.path, primaryText: primary, headline, cta, adsetRef: adsetRef || null, description, adName });
    setProgress(r.success ? "✅ Pub ajoutée." : r.error ?? "Erreur");
    if (r.success) { setFile(null); setCreativeId(""); }
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted">
          <Upload className="h-4 w-4" /> {file ? file.name.slice(0, 30) : "Vidéo ou image…"}
          <input type="file" accept="video/*,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <select className={INPUT} value={creativeId} onChange={(e) => setCreativeId(e.target.value)}>
          <option value="">Vidéo d&apos;éditeur (code) : aucune</option>
          {creatives.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
        </select>
        <select className={INPUT} value={cta} onChange={(e) => setCta(e.target.value)}>
          <option value="ORDER_NOW">Bouton : Commander</option>
          <option value="SHOP_NOW">Bouton : Acheter</option>
          <option value="BUY_NOW">Bouton : Acheter maintenant</option>
          <option value="LEARN_MORE">Bouton : En savoir plus</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Wand2 className="h-3.5 w-3.5" /> Textes conseillés :</span>
        {texts.map((t, i) => (
          <button key={i} type="button" className="rounded border px-2 py-1 text-xs hover:bg-muted"
            onClick={() => { setHeadline(t.headline); setPrimary(t.primary); }}>Modèle {i + 1}</button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {adsets.length > 0 && (
          <select className={INPUT} value={adsetRef} onChange={(e) => setAdsetRef(e.target.value)}>
            {adsets.map((a) => <option key={a.id} value={a.id}>Ensemble : {a.name}</option>)}
          </select>
        )}
        <input className={INPUT} value={adName} onChange={(e) => setAdName(e.target.value)} placeholder="Nom de la pub (auto si vide)" />
      </div>
      <input dir="auto" className={INPUT + " w-full"} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Titre" />
      <input dir="auto" className={INPUT + " w-full"} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
      <textarea dir="auto" className="min-h-[110px] w-full rounded-md border bg-background p-3 text-sm" value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="Texte principal" />
      <div className="flex items-center gap-3">
        <button className={BTN} disabled={pending} onClick={add}><Upload className="h-4 w-4" /> Ajouter cette pub</button>
        {progress && <span className="text-sm text-muted-foreground">{progress}</span>}
      </div>
    </div>
  );
}

export function DeleteItemButton({ launchId, itemId }: { launchId: string; itemId: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} className="rounded-md border px-2 py-1 text-xs text-red-600 hover:bg-red-50"
      onClick={() => start(async () => { const r = await deleteLaunchItem(launchId, itemId); if (!r.success) alert(r.error); })}>
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

/* ─────────────── 3. Créer dans Meta / Activer ─────────────── */
export function LaunchControls({ launchId, status, itemsCount, createdCount }: {
  launchId: string; status: string; itemsCount: number; createdCount: number;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "active" && (
        <button className={BTN} disabled={pending || itemsCount === 0} onClick={() => start(async () => {
          setMsg("Création dans Meta… (les vidéos peuvent prendre quelques minutes)");
          const r = await runLaunch(launchId);
          setMsg(r.success ? (r.data?.status === "waiting_media" ? "⏳ Meta traite encore les vidéos : clique « Continuer » dans 2-3 minutes (ou attends, c'est repris automatiquement)." : "✅ Créée dans Meta, EN PAUSE. Vérifie puis active.") : `❌ ${r.error}`);
          router.refresh();
        })}>
          <Play className="h-4 w-4" /> {createdCount ? "Continuer / créer les pubs restantes" : "Créer dans Meta (en pause)"}
        </button>
      )}
      {createdCount > 0 && status !== "active" && (
        <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white disabled:opacity-50"
          disabled={pending} onClick={() => {
            if (!confirm("Activer la campagne ? Elle va commencer à dépenser ton budget.")) return;
            start(async () => { const r = await activateLaunchAction(launchId); setMsg(r.success ? "🚀 Campagne ACTIVE." : `❌ ${r.error}`); router.refresh(); });
          }}>
          <Power className="h-4 w-4" /> Activer la campagne
        </button>
      )}
      {status === "draft" && (
        <button className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm text-red-600" disabled={pending}
          onClick={() => { if (confirm("Supprimer ce brouillon ?")) start(async () => { const r = await deleteLaunch(launchId); if (r.success) router.push("/admin/ads/launch"); else setMsg(r.error ?? ""); }); }}>
          <Trash2 className="h-4 w-4" /> Supprimer le brouillon
        </button>
      )}
      {msg && <span className="text-sm">{msg}</span>}
    </div>
  );
}
