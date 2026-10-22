"use client";
/**
 * Espace éditeur — produits autorisés, envoi des liens vidéo (Drive…), validation admin,
 * réglages de rémunération (commission / salaire / par produit) et confidentialité.
 */
import { useMemo, useState, useTransition } from "react";
import { Check, X, Trash2, ExternalLink, Copy, Send, RotateCcw, ImageOff, Search, FileText, Pencil } from "lucide-react";
import { saveEditorPortalCfg, submitVideoLinks, deleteVideoLink, reviewVideoLink, saveProductBrief } from "@/lib/creatives/portal-actions";
import { EMPTY_BRIEF, type EditorPortalCfg, type VideoDelivery, type DeliveryStatus, type ProductBrief } from "@/lib/creatives/portal-shared";
import { cn } from "@/lib/utils";
import { BriefMediaManager } from "@/components/creatives/brief-media";

type ProductCard = { id: string; name: string; image: string | null };
const INPUT = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30";

export const STATUS_UI: Record<DeliveryStatus, { label: string; cls: string }> = {
  pending:  { label: "⏳ En attente", cls: "bg-amber-100 text-amber-800" },
  accepted: { label: "✅ Validée",    cls: "bg-green-100 text-green-800" },
  rejected: { label: "❌ Refusée",    cls: "bg-red-100 text-red-700" },
};

export function ProductThumb({ p, size = "md" }: { p: ProductCard; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-12 w-12" : "aspect-square w-full";
  return p.image
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={p.image} alt={p.name} className={cn(cls, "rounded-lg border bg-white object-cover")} />
    : <div className={cn(cls, "flex items-center justify-center rounded-lg border bg-muted text-muted-foreground")}><ImageOff className="h-5 w-5" /></div>;
}

/* ───────────────────────── Éditeur : carte produit + envoi des liens ───────────────────────── */

export function EditorProductCard({
  product, links, canSubmit, canReview, editorNames, brief,
}: {
  product: ProductCard; links: VideoDelivery[]; canSubmit: boolean; canReview: boolean;
  editorNames?: Record<string, string>; brief?: ProductBrief;
}) {
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const accepted = links.filter((l) => l.status === "accepted").length;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex gap-3 border-b p-3">
        <div className="w-24 shrink-0"><ProductThumb p={product} /></div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight">{product.name}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {links.length} lien{links.length > 1 ? "s" : ""} envoyé{links.length > 1 ? "s" : ""} · {accepted} validé{accepted > 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {canReview
        ? <div className="border-b p-3"><BriefForm productId={product.id} initial={brief ?? EMPTY_BRIEF} compact /></div>
        : <BriefView brief={brief} />}

      {canSubmit && (
        <div className="space-y-2 border-b p-3">
          <textarea dir="ltr" rows={3} value={text} onChange={(e) => { setText(e.target.value); setMsg(null); }}
            placeholder={"Colle le(s) lien(s) Google Drive de ta vidéo\n(un lien par ligne)"}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
          <input className={INPUT} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (facultatif) — ex : version hook 2, format 9:16" />
          <div className="flex items-center gap-2">
            <button disabled={pending || !text.trim()}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
              onClick={() => start(async () => {
                const r = await submitVideoLinks({ productId: product.id, urls: text.split(/\s+/), note });
                setMsg(r.success ? { ok: true, t: "Envoyé ✓" } : { ok: false, t: r.error ?? "Erreur" });
                if (r.success) { setText(""); setNote(""); }
              })}>
              <Send className="h-4 w-4" /> {pending ? "Envoi…" : "Envoyer"}
            </button>
            {msg && <span className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{msg.t}</span>}
          </div>
        </div>
      )}

      <div className="flex-1 divide-y">
        {links.length === 0 && <p className="p-3 text-xs text-muted-foreground">Aucun lien pour ce produit.</p>}
        {links.map((l) => (
          <LinkRow key={l.id} l={l} canReview={canReview} canDelete={canReview || l.status !== "accepted"}
            editorName={editorNames?.[l.editorId]} />
        ))}
      </div>
    </div>
  );
}

export function LinkRow({ l, canReview, canDelete, editorName }: {
  l: VideoDelivery; canReview: boolean; canDelete: boolean; editorName?: string;
}) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const st = STATUS_UI[l.status];
  const act = (s: DeliveryStatus) => start(async () => {
    const note = s === "rejected" ? prompt("Raison du refus (visible par l'éditeur) :", l.adminNote) ?? "" : "";
    await reviewVideoLink(l.id, s, note);
  });
  return (
    <div className={cn("space-y-1 p-3 text-sm", pending && "opacity-50")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", st.cls)}>{st.label}</span>
        {editorName && <span className="text-xs font-medium">{editorName}</span>}
        <span className="text-[11px] text-muted-foreground">{new Date(l.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <a href={l.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-primary hover:underline" dir="ltr">{l.url}</a>
        <a href={l.url} target="_blank" rel="noreferrer" title="Ouvrir" className="rounded border p-1 hover:bg-muted"><ExternalLink className="h-3.5 w-3.5" /></a>
        <button title="Copier le lien" className="rounded border p-1 hover:bg-muted"
          onClick={() => { navigator.clipboard?.writeText(l.url); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        {canDelete && (
          <button title="Supprimer" disabled={pending} className="rounded border p-1 text-red-600 hover:bg-red-50"
            onClick={() => { if (confirm("Supprimer ce lien ?")) start(async () => { await deleteVideoLink(l.id); }); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {l.note && <div className="text-xs text-muted-foreground">📝 {l.note}</div>}
      {l.adminNote && <div className="text-xs text-red-700">Admin : {l.adminNote}</div>}
      {canReview && (
        <div className="flex gap-1.5 pt-1">
          {l.status !== "accepted" && (
            <button disabled={pending} onClick={() => act("accepted")}
              className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white"><Check className="h-3.5 w-3.5" /> Valider</button>
          )}
          {l.status !== "rejected" && (
            <button disabled={pending} onClick={() => act("rejected")}
              className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs text-red-700"><X className="h-3.5 w-3.5" /> Refuser</button>
          )}
          {l.status !== "pending" && (
            <button disabled={pending} onClick={() => act("pending")}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"><RotateCcw className="h-3.5 w-3.5" /> En attente</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Admin : réglages d'un éditeur ───────────────────────── */

export function EditorPortalForm({
  editorId, editorName, initial, products, commissionLabel,
}: {
  editorId: string; editorName: string; initial: EditorPortalCfg; products: ProductCard[]; commissionLabel: string;
}) {
  const [c, setC] = useState<EditorPortalCfg>(initial);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof EditorPortalCfg>(k: K, v: EditorPortalCfg[K]) => { setMsg(null); setC((x) => ({ ...x, [k]: v })); };
  const shown = useMemo(() => products.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())), [products, q]);
  const toggle = (id: string) => set("productIds", c.productIds.includes(id) ? c.productIds.filter((x) => x !== id) : [...c.productIds, id]);

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{editorName}</h3>
        <span className="text-xs text-muted-foreground">{c.productIds.length} produit(s) autorisé(s)</span>
      </div>

      {/* Produits autorisés */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Produits autorisés</span>
          <span className="text-xs text-muted-foreground">— l&apos;éditeur voit seulement le nom et la photo</span>
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
            <input className="h-8 w-48 rounded-md border bg-background pl-7 pr-2 text-xs" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="text-xs text-primary hover:underline" onClick={() => set("productIds", products.map((p) => p.id))}>Tout</button>
          <button className="text-xs text-primary hover:underline" onClick={() => set("productIds", [])}>Aucun</button>
        </div>
        <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((p) => {
            const on = c.productIds.includes(p.id);
            return (
              <button key={p.id} type="button" onClick={() => toggle(p.id)}
                className={cn("flex items-center gap-2 rounded-lg border p-1.5 text-left text-xs transition",
                  on ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted")}>
                <ProductThumb p={p} size="sm" />
                <span className="line-clamp-2 flex-1">{p.name}</span>
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded border", on && "border-primary bg-primary text-primary-foreground")}>
                  {on && <Check className="h-3.5 w-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Rémunération */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Mode de paiement</span>
          <select className={INPUT} value={c.payMode} onChange={(e) => set("payMode", e.target.value as EditorPortalCfg["payMode"])}>
            <option value="commission">Commission (commandes livrées)</option>
            <option value="salary">Salaire mensuel</option>
            <option value="per_product">Par produit / par vidéo</option>
          </select>
        </label>
        {c.payMode === "salary" && (<>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Salaire (MAD / mois)</span>
            <input type="number" min={0} className={INPUT} value={c.salary || ""} onChange={(e) => set("salary", Number(e.target.value))} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Début du salaire</span>
            <input type="date" className={INPUT} value={c.salaryStart} onChange={(e) => set("salaryStart", e.target.value)} />
          </label>
        </>)}
        {c.payMode === "per_product" && (<>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Montant (MAD)</span>
            <input type="number" min={0} className={INPUT} value={c.perAmount || ""} placeholder="ex : 120" onChange={(e) => set("perAmount", Number(e.target.value))} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Payé</span>
            <select className={INPUT} value={c.perUnit} onChange={(e) => set("perUnit", e.target.value as EditorPortalCfg["perUnit"])}>
              <option value="product">1 fois par produit (1re vidéo)</option>
              <option value="video">Par vidéo</option>
              <option value="pack">Par lot de N vidéos</option>
            </select>
          </label>
          {c.perUnit === "pack" && (
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Vidéos par lot</span>
              <input type="number" min={1} className={INPUT} value={c.packSize || ""} placeholder="ex : 9" onChange={(e) => set("packSize", Number(e.target.value))} />
            </label>
          )}
        </>)}
        {c.payMode !== "commission" && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={c.plusCommission} onChange={(e) => set("plusCommission", e.target.checked)} />
            + commission en plus ({commissionLabel})
          </label>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {c.payMode === "commission" && `Commission actuelle : ${commissionLabel} (modifiable dans le tableau Éditeurs et Tarifs par produit).`}
        {c.payMode === "salary" && "Le salaire est compté jour par jour depuis la date de début → « Reste à payer » se met à jour tout seul."}
        {c.payMode === "per_product" && (c.perUnit === "pack"
          ? `Exemple : ${c.packSize} vidéos = ${c.perAmount || 0} MAD · ${c.packSize * 2} vidéos = ${(c.perAmount || 0) * 2} MAD · ${c.packSize * 3} vidéos = ${(c.perAmount || 0) * 3} MAD. Compte les vidéos enregistrées pour cet éditeur (Vidéos & Éditeurs), à leur date d'ajout.`
          : "Compté quand tu cliques « Valider » sur un lien vidéo envoyé par l'éditeur.")}
        {c.payMode !== "commission" && !c.plusCommission && " Aucune commission sur les commandes n'est comptée pour cet éditeur."}
      </p>

      {/* Confidentialité */}
      <label className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
        <input type="checkbox" className="mt-0.5" checked={c.hideAdMoney} onChange={(e) => set("hideAdMoney", e.target.checked)} />
        <span>
          <b>Masquer dépense, budget et campagnes</b>
          <span className="block text-xs text-muted-foreground">L&apos;éditeur voit seulement le coût de ses vidéos (coût par lead / par commande) et l&apos;engagement.</span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button disabled={pending}
          className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          onClick={() => start(async () => {
            const r = await saveEditorPortalCfg(editorId, c);
            setMsg(r.success ? { ok: true, t: "Enregistré ✓" } : { ok: false, t: r.error ?? "Erreur" });
          })}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {msg && <span className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{msg.t}</span>}
      </div>
    </div>
  );
}

/* ───────────────────────── Admin : liens reçus par produit ───────────────────────── */

export function ReceivedLinks({ products, links, editorNames }: {
  products: ProductCard[]; links: VideoDelivery[]; editorNames: Record<string, string>;
}) {
  const [status, setStatus] = useState<"all" | DeliveryStatus>("pending");
  const [editor, setEditor] = useState("");
  const list = links.filter((l) => (status === "all" || l.status === status) && (!editor || l.editorId === editor));
  const byProduct = products
    .map((p) => ({ p, items: list.filter((l) => l.productId === p.id) }))
    .filter((g) => g.items.length);
  const unknown = list.filter((l) => !products.some((p) => p.id === l.productId));
  const count = (s: DeliveryStatus) => links.filter((l) => l.status === s).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        {(["pending", "accepted", "rejected", "all"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={cn("rounded-full border px-3 py-1 text-xs", status === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {s === "all" ? `Tous (${links.length})` : `${STATUS_UI[s].label} (${count(s)})`}
          </button>
        ))}
        <select className="h-8 rounded-md border bg-background px-2 text-xs" value={editor} onChange={(e) => setEditor(e.target.value)}>
          <option value="">Tous les éditeurs</option>
          {Object.entries(editorNames).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
      </div>
      {byProduct.length === 0 && unknown.length === 0 && <p className="px-4 pb-4 text-sm text-muted-foreground">Aucun lien.</p>}
      <div className="grid gap-3 px-4 pb-4 md:grid-cols-2 xl:grid-cols-3">
        {byProduct.map(({ p, items }) => (
          <div key={p.id} className="overflow-hidden rounded-xl border">
            <div className="flex items-center gap-2 border-b bg-muted/30 p-2">
              <ProductThumb p={p} size="sm" />
              <div className="text-sm font-semibold">{p.name} <span className="font-normal text-muted-foreground">({items.length})</span></div>
            </div>
            <div className="divide-y">
              {items.map((l) => <LinkRow key={l.id} l={l} canReview canDelete editorName={editorNames[l.editorId]} />)}
            </div>
          </div>
        ))}
        {unknown.length > 0 && (
          <div className="overflow-hidden rounded-xl border">
            <div className="border-b bg-muted/30 p-2 text-sm font-semibold">Produit supprimé ({unknown.length})</div>
            <div className="divide-y">
              {unknown.map((l) => <LinkRow key={l.id} l={l} canReview canDelete editorName={editorNames[l.editorId]} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Fiche produit pour l'éditeur ───────────────────────── */

const URL_RE = /(https?:\/\/[^\s]+)/g;
export function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) => i % 2 === 1
        ? <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">{part}</a>
        : <span key={i}>{part}</span>)}
    </>
  );
}

/** Lecture seule (éditeur) : détails du produit écrits par l'admin. */
export function BriefView({ brief }: { brief?: ProductBrief }) {
  if (!brief || (!brief.text && !brief.links)) {
    return <p className="border-b p-3 text-xs text-muted-foreground">Pas encore de détails pour ce produit.</p>;
  }
  return (
    <details open className="group border-b">
      <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-sm font-medium">
        <FileText className="h-4 w-4 text-fuchsia-600" /> Détails du produit
      </summary>
      <div className="space-y-2 px-3 pb-3 text-sm">
        {brief.text && <div dir="auto" className="whitespace-pre-wrap leading-relaxed"><Linkified text={brief.text} /></div>}
        {brief.links && (
          <div className="rounded-md bg-muted/40 p-2 text-xs">
            <div className="mb-1 font-medium">Liens utiles</div>
            <div dir="ltr" className="whitespace-pre-wrap"><Linkified text={brief.links} /></div>
          </div>
        )}
      </div>
    </details>
  );
}

/** Admin : écrire / modifier la fiche d'un produit. */
export function BriefForm({ productId, initial, compact = false }: { productId: string; initial: ProductBrief; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const [text, setText] = useState(initial.text);
  const [links, setLinks] = useState(initial.links);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <div className="space-y-1">
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <Pencil className="h-3.5 w-3.5" /> {initial.text || initial.links ? "Modifier les détails du produit" : "Écrire les détails du produit"}
        </button>
        {initial.text && <p dir="auto" className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{initial.text}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-sm">
        <span className="text-xs font-medium text-muted-foreground">Détails du produit (visible par les éditeurs)</span>
        <textarea dir="auto" rows={compact ? 6 : 10} value={text} onChange={(e) => { setText(e.target.value); setMsg(null); }}
          placeholder={"Ex :\n• C'est quoi : …\n• Problème qu'il règle : …\n• Points forts : …\n• Client cible : …\n• Prix / offre : …\n• Angle / hook à utiliser : …\n• À ne pas dire / montrer : …\n• Format : 9:16, 20-30 s, sous-titres darija"}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary/30" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-xs font-medium text-muted-foreground">Liens utiles (photos, rushs, vidéos d&apos;exemple, page produit…) — un par ligne</span>
        <textarea dir="ltr" rows={3} value={links} onChange={(e) => { setLinks(e.target.value); setMsg(null); }}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
      </label>
      <BriefMediaManager productId={productId} initial={initial.media ?? []} />
      <div className="flex items-center gap-2">
        <button disabled={pending}
          className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          onClick={() => start(async () => {
            const r = await saveProductBrief(productId, text, links);
            setMsg(r.success ? { ok: true, t: "Enregistré ✓" } : { ok: false, t: r.error ?? "Erreur" });
          })}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {compact && <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:underline">Fermer</button>}
        {msg && <span className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{msg.t}</span>}
      </div>
    </div>
  );
}

/** Admin (page Vidéos & Éditeurs) : choisir un produit et écrire sa fiche. */
export function BriefsManager({ products, briefs }: { products: ProductCard[]; briefs: Record<string, ProductBrief> }) {
  const [pid, setPid] = useState(products[0]?.id ?? "");
  const p = products.find((x) => x.id === pid);
  const done = products.filter((x) => briefs[x.id]?.text || briefs[x.id]?.links || briefs[x.id]?.media?.length).length;
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[280px_1fr]">
      <div className="max-h-[480px] space-y-1 overflow-y-auto pr-1">
        <div className="pb-1 text-xs text-muted-foreground">{done} / {products.length} produits avec détails</div>
        {products.map((x) => {
          const has = !!(briefs[x.id]?.text || briefs[x.id]?.links || briefs[x.id]?.media?.length);
          return (
            <button key={x.id} onClick={() => setPid(x.id)}
              className={cn("flex w-full items-center gap-2 rounded-lg border p-1.5 text-left text-xs",
                x.id === pid ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted")}>
              <ProductThumb p={x} size="sm" />
              <span className="line-clamp-2 flex-1">{x.name}</span>
              {has ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : <span className="shrink-0 text-[10px] text-amber-600">vide</span>}
            </button>
          );
        })}
      </div>
      {p ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <ProductThumb p={p} size="sm" />
            <div className="font-semibold">{p.name}</div>
          </div>
          <BriefForm key={p.id} productId={p.id} initial={briefs[p.id] ?? EMPTY_BRIEF} />
        </div>
      ) : <p className="text-sm text-muted-foreground">Aucun produit.</p>}
    </div>
  );
}
