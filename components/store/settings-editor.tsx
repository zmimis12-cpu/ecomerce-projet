"use client";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Star, ExternalLink } from "lucide-react";
import { saveStoreConfig } from "@/lib/store/actions";
import type { StoreConfig } from "@/lib/store/config";
import { cn } from "@/lib/utils";
import { SectionImagePicker } from "@/components/landing-builder/section-image-picker";
import { ImageChoice } from "@/components/store/image-choice";

type P = { id: string; title: string; image: string | null; price: number; slug: string };

type Photos = Record<string, { auto: string | null; images: { url: string; label?: string }[] }>;

export function StoreSettingsEditor({ tab, initial, products, photos = {} }: { tab: "accueil" | "produits"; initial: StoreConfig; products: P[]; photos?: Photos }) {
  const [cfg, setCfg] = useState<StoreConfig>(initial);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const set = <K extends keyof StoreConfig>(k: K, v: StoreConfig[K]) => { setCfg((c) => ({ ...c, [k]: v })); setMsg(""); };

  // Ordre : produits triés selon le réglage actuel
  const ordered = [...products].sort((a, b) => (cfg.products[a.id]?.order ?? 1000) - (cfg.products[b.id]?.order ?? 1000));
  function setP(id: string, patch: Partial<StoreConfig["products"][string]>) {
    setCfg((c) => ({ ...c, products: { ...c.products, [id]: { ...c.products[id], ...patch } } })); setMsg("");
  }
  function move(idx: number, dir: -1 | 1) {
    const list = [...ordered];
    const j = idx + dir; if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    setCfg((c) => {
      const next = { ...c.products };
      list.forEach((p, i) => { next[p.id] = { ...next[p.id], order: i }; });
      return { ...c, products: next };
    });
    setMsg("");
  }

  const field = "h-10 w-full rounded-lg border bg-background px-3 text-sm";
  return (
    <div className="space-y-4">
      {tab === "accueil" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
            <h2 className="font-semibold">Bannière d&apos;accueil</h2>
            <L t="Titre (ligne blanche)"><input dir="auto" className={field} value={cfg.heroTitle} onChange={(e) => set("heroTitle", e.target.value)} /></L>
            <L t="Titre (ligne dorée, optionnel)"><input dir="auto" className={field} value={cfg.heroTitleGold ?? ""} onChange={(e) => set("heroTitleGold", e.target.value)} /></L>
            <L t="Sous-titre"><textarea dir="auto" rows={2} className={cn(field, "h-auto py-2")} value={cfg.heroSubtitle} onChange={(e) => set("heroSubtitle", e.target.value)} /></L>
            <L t="Texte du bouton (vide = pas de bouton)"><input dir="auto" className={field} value={cfg.heroCta} onChange={(e) => set("heroCta", e.target.value)} /></L>
            <SectionImagePicker label="Image de fond (optionnel) — importe une photo depuis ton téléphone ou ton PC"
              value={cfg.heroImage || undefined} onChange={(url) => set("heroImage", url)} />
            <L t="Barre d'annonce en haut (vide = « توصيل لجميع المدن · الدفع عند الاستلام »)"><input dir="auto" className={field} value={cfg.announcement} onChange={(e) => set("announcement", e.target.value)} placeholder="ex : 🔥 توصيل مجاني هاد الأسبوع" /></L>
          </div>
          <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
            <h2 className="font-semibold">Sections & contact</h2>
            <L t="Titre « mis en avant »"><input dir="auto" className={field} value={cfg.featuredTitle} onChange={(e) => set("featuredTitle", e.target.value)} /></L>
            <L t="Titre de la grille de produits"><input dir="auto" className={field} value={cfg.allTitle} onChange={(e) => set("allTitle", e.target.value)} /></L>
            <Toggle on={cfg.showTrust} onChange={(v) => set("showTrust", v)} label="Afficher les garanties (livraison, paiement à la livraison…)" />
            <Toggle on={cfg.showAbout} onChange={(v) => set("showAbout", v)} label="Afficher « About HajtekZone / ODT Deals » (recommandé pour Meta/TikTok)" />
            <L t="Email de contact"><input className={field} value={cfg.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} /></L>
            <L t="Bouton WhatsApp sur l'accueil (numéro, vide = caché)"><input className={field} placeholder="06…" value={cfg.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} /></L>
          </div>
          <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
            <h2 className="font-semibold">4 garanties (sous la bannière)</h2>
            {(cfg.trust ?? []).map((t, i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <input dir="auto" className={field} placeholder="Titre" value={t.title}
                  onChange={(e) => set("trust", cfg.trust.map((x, k) => k === i ? { ...x, title: e.target.value } : x))} />
                <input dir="auto" className={field} placeholder="Sous-titre" value={t.sub}
                  onChange={(e) => set("trust", cfg.trust.map((x, k) => k === i ? { ...x, sub: e.target.value } : x))} />
              </div>
            ))}
          </div>
          <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
            <h2 className="font-semibold">Bandeau du bas</h2>
            <div className="grid grid-cols-2 gap-2">
              <input dir="auto" className={field} placeholder="Titre 1" value={cfg.bottomTitle1 ?? ""} onChange={(e) => set("bottomTitle1", e.target.value)} />
              <input dir="auto" className={field} placeholder="Texte 1" value={cfg.bottomSub1 ?? ""} onChange={(e) => set("bottomSub1", e.target.value)} />
              <input dir="auto" className={field} placeholder="Titre 2" value={cfg.bottomTitle2 ?? ""} onChange={(e) => set("bottomTitle2", e.target.value)} />
              <input dir="auto" className={field} placeholder="Texte 2" value={cfg.bottomSub2 ?? ""} onChange={(e) => set("bottomSub2", e.target.value)} />
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3 text-sm text-muted-foreground">
            🖼 clic sur la photo = choisir la photo affichée dans la boutique · 👁 = visible sur la boutique · ⭐ = section « mis en avant » en haut de l&apos;accueil · flèches = ordre d&apos;affichage · Catégorie = filtres en haut des produits (ex : الإلكترونيات، المنزل…).
            <datalist id="store-cats">{[...new Set(Object.values(cfg.products).map((x) => x.category).filter(Boolean))].map((c) => <option key={c} value={c} />)}</datalist>
            Un produit caché reste vendable par sa page (pubs), il n&apos;apparaît juste plus dans la boutique.
          </div>
          {ordered.map((p, i) => {
            const st = cfg.products[p.id] ?? {};
            const visible = st.visible !== false;
            return (
              <div key={p.id} className={cn("flex items-center gap-3 border-b px-3 py-2.5 last:border-0", !visible && "opacity-50")}>
                <div className="flex flex-col">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-0.5 hover:bg-muted disabled:opacity-20" title="Monter"><ArrowUp className="h-4 w-4" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === ordered.length - 1} className="rounded p-0.5 hover:bg-muted disabled:opacity-20" title="Descendre"><ArrowDown className="h-4 w-4" /></button>
                </div>
                {/* Photo affichée dans la boutique : au choix (photos du produit, bannière ou importée) */}
                <ImageChoice compact value={st.image ?? ""} onChange={(u) => setP(p.id, { image: u || undefined })}
                  candidates={photos[p.id]?.images ?? []} autoUrl={photos[p.id]?.auto ?? p.image} autoLabel="Photo principale" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" dir="auto">{p.title}</p>
                  <p className="text-xs text-muted-foreground">{p.price} MAD · /lp/{p.slug}</p>
                </div>
                <input dir="auto" list="store-cats" placeholder="Catégorie" value={st.category ?? ""}
                  onChange={(e) => setP(p.id, { category: e.target.value })}
                  className="h-9 w-24 rounded-lg border bg-background px-2 text-xs sm:w-32" />
                <a href={`/lp/${p.slug}`} target="_blank" className="hidden rounded p-2 text-muted-foreground hover:bg-muted sm:block" title="Voir"><ExternalLink className="h-4 w-4" /></a>
                <button onClick={() => setP(p.id, { featured: !st.featured })} title="Mettre en avant"
                  className={cn("rounded-lg p-2 transition", st.featured ? "bg-amber-100 text-amber-600" : "text-muted-foreground hover:bg-muted")}>
                  <Star className={cn("h-5 w-5", st.featured && "fill-amber-400")} />
                </button>
                <button onClick={() => setP(p.id, { visible: !visible })} title={visible ? "Cacher" : "Afficher"}
                  className={cn("rounded-lg p-2 transition", visible ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>
                  {visible ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                </button>
              </div>
            );
          })}
          {!ordered.length && <p className="p-6 text-center text-sm text-muted-foreground">Aucun produit : active une landing page pour qu&apos;il apparaisse ici.</p>}
        </div>
      )}

      <div className="sticky bottom-4 flex items-center gap-3">
        <button disabled={pending} onClick={() => start(async () => { const r = await saveStoreConfig(cfg); setMsg(r.success ? "✅ Enregistré — en ligne sur hajtek.ma" : `❌ ${r.error}`); })}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg disabled:opacity-50">
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {msg && <span className="rounded-md bg-card px-3 py-1.5 text-sm shadow">{msg}</span>}
      </div>
    </div>
  );
}

function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="block space-y-1 text-sm"><span className="text-xs font-medium text-muted-foreground">{t}</span>{children}</label>;
}
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left text-sm">
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-green-500" : "bg-muted-foreground/30")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
      </span>
      {label}
    </button>
  );
}
