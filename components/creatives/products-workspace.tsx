"use client";
/**
 * Espace éditeur « Mes produits » — liste compacte à gauche, produit sélectionné à droite.
 * Même avec beaucoup de produits, tout reste lisible : un produit à la fois, détails repliables.
 */
import { useMemo, useState, useTransition } from "react";
import { Search, Send, FileText, ChevronDown, Link2 } from "lucide-react";
import { submitVideoLinks } from "@/lib/creatives/portal-actions";
import { EMPTY_BRIEF, type VideoDelivery, type ProductBrief } from "@/lib/creatives/portal-shared";
import { ProductThumb, LinkRow, BriefForm, Linkified } from "@/components/creatives/portal-controls";
import { cn } from "@/lib/utils";

type ProductCard = { id: string; name: string; image: string | null };

export function ProductsWorkspace({ products, links, briefs, canSubmit, canReview }: {
  products: ProductCard[]; links: VideoDelivery[]; briefs: Record<string, ProductBrief>;
  canSubmit: boolean; canReview: boolean;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(products[0]?.id ?? "");
  const stats = useMemo(() => {
    const m = new Map<string, { sent: number; ok: number; pending: number }>();
    for (const l of links) {
      const s = m.get(l.productId) ?? { sent: 0, ok: 0, pending: 0 };
      s.sent++; if (l.status === "accepted") s.ok++; if (l.status === "pending") s.pending++;
      m.set(l.productId, s);
    }
    return m;
  }, [links]);
  const shown = products.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  const product = products.find((p) => p.id === sel) ?? products[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      {/* Liste compacte */}
      <aside className="overflow-hidden rounded-xl border bg-card lg:sticky lg:top-0 lg:max-h-[calc(100vh-9rem)] lg:self-start">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Rechercher (${products.length} produits)`}
              className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <ul className="max-h-64 divide-y overflow-y-auto lg:max-h-[calc(100vh-13rem)]">
          {shown.map((p) => {
            const s = stats.get(p.id);
            const on = p.id === product?.id;
            return (
              <li key={p.id}>
                <button onClick={() => {
                  setSel(p.id);
                  // mobile : la fiche est sous la liste → on y descend
                  if (window.innerWidth < 1024) requestAnimationFrame(() => document.getElementById("ws-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
                }}
                  className={cn("flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors",
                    on ? "bg-primary/10" : "hover:bg-muted/60")}>
                  <ProductThumb p={p} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", on && "font-semibold")}>{p.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {s ? `${s.sent} envoyé${s.sent > 1 ? "s" : ""} · ${s.ok} validé${s.ok > 1 ? "s" : ""}` : "Aucune vidéo"}
                    </span>
                  </span>
                  {s?.pending ? <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white" title="En attente de validation">{s.pending}</span> : null}
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="p-4 text-center text-xs text-muted-foreground">Aucun produit.</li>}
        </ul>
      </aside>

      {/* Produit sélectionné */}
      {product && (
        <ProductPanel key={product.id} product={product} brief={briefs[product.id]}
          links={links.filter((l) => l.productId === product.id)} canSubmit={canSubmit} canReview={canReview} />
      )}
    </div>
  );
}

function ProductPanel({ product, brief, links, canSubmit, canReview }: {
  product: ProductCard; brief?: ProductBrief; links: VideoDelivery[]; canSubmit: boolean; canReview: boolean;
}) {
  const ok = links.filter((l) => l.status === "accepted").length;
  return (
    <section id="ws-panel" className="min-w-0 scroll-mt-16 space-y-4">
      <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
        <div className="w-16 shrink-0"><ProductThumb p={product} /></div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{product.name}</h2>
          <p className="text-xs text-muted-foreground">{links.length} lien{links.length > 1 ? "s" : ""} envoyé{links.length > 1 ? "s" : ""} · {ok} validé{ok > 1 ? "s" : ""}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Détails du produit */}
        <div className="rounded-xl border bg-card">
          <h3 className="flex items-center gap-1.5 border-b px-3 py-2 text-sm font-semibold"><FileText className="h-4 w-4 text-fuchsia-600" /> Détails du produit</h3>
          <div className="p-3">
            {canReview ? <BriefForm productId={product.id} initial={brief ?? EMPTY_BRIEF} compact /> : <BriefText brief={brief} />}
          </div>
        </div>

        <div className="space-y-4">
          {canSubmit && <SubmitForm productId={product.id} />}
          <div className="rounded-xl border bg-card">
            <h3 className="flex items-center gap-1.5 border-b px-3 py-2 text-sm font-semibold"><Link2 className="h-4 w-4" /> {canSubmit ? "Mes vidéos envoyées" : "Vidéos envoyées"} ({links.length})</h3>
            <div className="max-h-96 divide-y overflow-y-auto">
              {links.length === 0 && <p className="p-3 text-xs text-muted-foreground">Aucun lien pour ce produit.</p>}
              {links.map((l) => <LinkRow key={l.id} l={l} canReview={canReview} canDelete={canReview || l.status !== "accepted"} />)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Texte long replié (« Voir tout ») pour ne pas prendre toute la page. */
function BriefText({ brief }: { brief?: ProductBrief }) {
  const [open, setOpen] = useState(false);
  if (!brief || (!brief.text && !brief.links)) return <p className="text-xs text-muted-foreground">Pas encore de détails pour ce produit.</p>;
  const long = (brief.text?.length ?? 0) > 400 || (brief.text?.split("\n").length ?? 0) > 8;
  return (
    <div className="space-y-2 text-sm">
      {brief.text && (
        <div className="relative">
          <div dir="auto" className={cn("whitespace-pre-wrap leading-relaxed", long && !open && "max-h-48 overflow-hidden")}>
            <Linkified text={brief.text} />
          </div>
          {long && !open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />}
        </div>
      )}
      {long && (
        <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          {open ? "Réduire" : "Voir tout"} <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      )}
      {brief.links && (
        <div className="rounded-md bg-muted/40 p-2 text-xs">
          <div className="mb-1 font-medium">Liens utiles</div>
          <div dir="ltr" className="whitespace-pre-wrap"><Linkified text={brief.links} /></div>
        </div>
      )}
    </div>
  );
}

function SubmitForm({ productId }: { productId: string }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Send className="h-4 w-4 text-primary" /> Envoyer une vidéo</h3>
      <textarea dir="ltr" rows={2} value={text} onChange={(e) => { setText(e.target.value); setMsg(null); }}
        placeholder={"Lien(s) Google Drive — un par ligne"}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
      <div className="flex flex-wrap items-center gap-2">
        <input className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (facultatif)" />
        <button disabled={pending || !text.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          onClick={() => start(async () => {
            const r = await submitVideoLinks({ productId, urls: text.split(/\s+/), note });
            setMsg(r.success ? { ok: true, t: "Envoyé ✓" } : { ok: false, t: r.error ?? "Erreur" });
            if (r.success) { setText(""); setNote(""); }
          })}>
          {pending ? "Envoi…" : "Envoyer"}
        </button>
      </div>
      {msg && <p className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{msg.t}</p>}
    </div>
  );
}
