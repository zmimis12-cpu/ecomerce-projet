"use client";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, ExternalLink, RotateCcw, Trash2 } from "lucide-react";
import { saveLpDesign } from "@/lib/store/actions";
import { LP_BLOCKS, DEFAULT_LP_DESIGN, type LpDesign, type LpDesignStore } from "@/lib/store/lp-design-shared";
import { cn } from "@/lib/utils";
import { ImageChoice } from "@/components/store/image-choice";

type Lp = { slug: string; title: string; images?: { url: string; label?: string }[] };

export function LpDesignEditor({ initial, pages }: { initial: LpDesignStore; pages: Lp[] }) {
  const [store, setStore] = useState<LpDesignStore>(initial);
  const [scope, setScope] = useState<string>("__global");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const isGlobal = scope === "__global";
  const hasOwn = !isGlobal && !!store.perSlug[scope];
  const d: LpDesign = isGlobal ? store.global : store.perSlug[scope] ?? store.global;

  function update(next: LpDesign) {
    setMsg("");
    setStore((s) => isGlobal ? { ...s, global: next } : { ...s, perSlug: { ...s.perSlug, [scope]: next } });
  }
  const set = <K extends keyof LpDesign>(k: K, v: LpDesign[K]) => update({ ...d, [k]: v });
  const label = (k: string) => LP_BLOCKS.find((b) => b.key === k)?.label ?? k;

  function move(i: number, dir: -1 | 1) {
    const list = [...d.blocks]; const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set("blocks", list);
  }
  function toggleBlock(i: number) {
    const list = d.blocks.map((b, k) => (k === i ? { ...b, on: !b.on } : b));
    set("blocks", list);
  }
  function resetScope() {
    setMsg("");
    if (isGlobal) setStore((s) => ({ ...s, global: DEFAULT_LP_DESIGN }));
    else setStore((s) => { const p = { ...s.perSlug }; delete p[scope]; return { ...s, perSlug: p }; });
  }

  const field = "h-10 w-full rounded-lg border bg-background px-3 text-sm";
  const T = (k: keyof LpDesign, t: string, ph?: string) => (
    <L t={t}><input dir="auto" className={field} value={String(d[k] ?? "")} placeholder={ph} onChange={(e) => set(k, e.target.value as never)} /></L>
  );
  const B = (k: keyof LpDesign, t: string) => <Toggle on={!!d[k]} onChange={(v) => set(k, v as never)} label={t} />;
  const C = (k: keyof LpDesign, t: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="color" className="h-9 w-12 cursor-pointer rounded border bg-background" value={String(d[k] || (DEFAULT_LP_DESIGN[k] as string))} onChange={(e) => set(k, e.target.value as never)} />
      {t}
    </label>
  );

  return (
    <div className="space-y-4">
      {/* Choix : toutes les landing pages ou une seule */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <span className="text-sm font-semibold">Réglages pour :</span>
        <select className={cn(field, "w-auto min-w-[240px]")} value={scope} onChange={(e) => { setScope(e.target.value); setMsg(""); }}>
          <option value="__global">🌐 Toutes les landing pages</option>
          {pages.map((p) => <option key={p.slug} value={p.slug}>{store.perSlug[p.slug] ? "✏️ " : ""}{p.title} — /lp/{p.slug}</option>)}
        </select>
        {!isGlobal && (
          <span className="text-xs text-muted-foreground">
            {hasOwn ? "Cette landing page a ses propres réglages." : "Utilise les réglages globaux — toute modification ici crée des réglages propres à cette page."}
          </span>
        )}
        {!isGlobal && <a href={`/lp/${scope}`} target="_blank" className="flex items-center gap-1 text-sm text-primary hover:underline">Voir <ExternalLink className="h-3.5 w-3.5" /></a>}
        <button onClick={resetScope} className="ml-auto flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">
          <RotateCcw className="h-3.5 w-3.5" /> {isGlobal ? "Design par défaut" : "Revenir aux réglages globaux"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Blocs : ordre + affichage */}
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">Sections de la page</h2>
            <p className="text-xs text-muted-foreground">Flèches = ordre · 👁 = afficher / cacher. La photo du produit reste toujours en haut.</p>
          </div>
          {d.blocks.map((b, i) => (
            <div key={b.key} className={cn("flex items-center gap-3 border-b px-3 py-2 last:border-0", !b.on && "opacity-50")}>
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-0.5 hover:bg-muted disabled:opacity-20"><ArrowUp className="h-4 w-4" /></button>
                <button onClick={() => move(i, 1)} disabled={i === d.blocks.length - 1} className="rounded p-0.5 hover:bg-muted disabled:opacity-20"><ArrowDown className="h-4 w-4" /></button>
              </div>
              <span className="flex-1 text-sm">{label(b.key)}</span>
              <button onClick={() => toggleBlock(i)} className={cn("rounded-lg p-2", b.on ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>
                {b.on ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
              </button>
            </div>
          ))}
        </div>

        {/* Options */}
        <div className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="font-semibold">Options</h2>
          {!isGlobal && (() => {
            const pg = pages.find((x) => x.slug === scope);
            const auto = d.heroSource === "banner"
              ? pg?.images?.find((i) => i.label === "Bannière LP")?.url ?? pg?.images?.[0]?.url
              : pg?.images?.find((i) => i.label !== "Bannière LP")?.url ?? pg?.images?.[0]?.url;
            return (
              <L t="Photo du haut (hero) de cette landing page">
                <ImageChoice value={d.heroImage} onChange={(u) => set("heroImage", u)} candidates={pg?.images ?? []}
                  autoUrl={auto} autoLabel="Selon l'option ci-dessous" />
              </L>
            );
          })()}
          <L t={isGlobal ? "Photo principale en haut" : "Si aucune photo choisie : utiliser"}>
            <select className={field} value={d.heroSource} onChange={(e) => set("heroSource", e.target.value as LpDesign["heroSource"])}>
              <option value="product">1re photo du produit</option>
              <option value="banner">Bannière (image hero de la landing page)</option>
            </select>
          </L>
          <L t="Position de la photo principale">
            <select className={field} value={d.heroPosition} onChange={(e) => set("heroPosition", e.target.value as LpDesign["heroPosition"])}>
              <option value="top">Photo en haut, puis titre, prix et formulaire (recommandé)</option>
              <option value="after_form">Formulaire tout en haut, photo juste après</option>
              <option value="hidden">Pas de grande photo</option>
            </select>
          </L>
          {B("offersAfterFields", "Choix de la quantité SOUS les champs nom / téléphone / ville (sinon au-dessus)")}
          {B("formFirst", "Formulaire juste sous la photo (avant les icônes et les autres blocs)")}
          {B("offerThumbs", "Petite photo du produit sur chaque offre (1 / 2 / 3 pièces)")}
          {B("crossAtBottom", "Autres produits toujours tout en bas de la page (recommandé pour Meta)")}
          {B("showBumps", "Upsells « أضف لطلبك » dans le formulaire")}
          {B("showTopBar", "Barre noire en haut (texte d'offre)")}
          {B("showStoreHeader", "En-tête boutique (logo + menu القائمة)")}
          {B("showBadge", "Badge « عرض خاص »")}
          {B("showDiscount", "Badge « تخفيض X% »")}
          {B("showOldPrice", "Ancien prix barré")}
          {B("showCodBar", "Bande verte livraison / paiement à la livraison")}
          {B("askAddress", "Champ « العنوان » dans le formulaire")}
          {d.askAddress && B("addressRequired", "… adresse obligatoire")}
          {B("showWhatsapp", "Bouton WhatsApp sous le formulaire")}
          {B("showWhatsappFloat", "Bouton WhatsApp rond flottant (coin de l'écran)")}
          {B("sticky", "Bouton de commande fixe en bas de l'écran")}
          {d.sticky && B("stickyAlways", "… toujours visible (barre « اشتري الآن » + WhatsApp sur toute la page, envoie la commande directement)")}
          {B("showFooter", "Pied de page (footer)")}
        </div>

        {/* Textes */}
        <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="font-semibold">Textes</h2>
          <p className="text-xs text-muted-foreground">Vide = texte de la landing page (éditeur) ou texte par défaut.</p>
          {T("topBar", "Barre du haut", "vide = « offre » de la landing page")}
          {T("badge", "Badge offre")}
          {T("codBar", "Bande verte")}
          {T("orderTitle", "Titre au-dessus du formulaire")}
          {T("orderSub", "Sous-titre du formulaire", "vide = réassurance de la landing page")}
          {T("whyTitle", "Titre « pourquoi »", "vide = titre de la section scénarios")}
          {T("crossTitle", "Titre produits complémentaires")}
          {T("reviewsTitle", "Titre avis clients")}
          {T("faqTitle", "Titre FAQ")}
        </div>

        {/* Photos ↔ textes : chaque photo avec le bon texte (par landing page) */}
        {!isGlobal && (() => {
          const imgs = pages.find((x) => x.slug === scope)?.images ?? [];
          const setTile = (i: number, patch: Partial<{ image: string; text: string }>) =>
            set("tiles", d.tiles.map((t, j) => (j === i ? { ...t, ...patch } : t)));
          const moveG = (i: number, dir: -1 | 1) => {
            const g = [...d.galleryImages]; const j = i + dir;
            if (j < 0 || j >= g.length) return;
            [g[i], g[j]] = [g[j], g[i]]; set("galleryImages", g);
          };
          return (
            <div className="space-y-5 rounded-xl border bg-card p-4 shadow-sm lg:col-span-2">
              <div>
                <h2 className="font-semibold">Photos & textes de cette page</h2>
                <p className="text-xs text-muted-foreground">Choisis quelle photo va avec quel texte. Vide = automatique (photos du produit dans l&apos;ordre + textes des avantages).</p>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Bloc « photo + texte »</h3>
                <div className="grid gap-3 md:grid-cols-[auto_1fr]">
                  <ImageChoice value={d.featureImage} onChange={(u) => set("featureImage", u)} candidates={imgs} autoUrl={imgs[1]?.url ?? imgs[0]?.url} autoLabel="2e photo du produit" />
                  <div className="space-y-2">
                    <input dir="auto" className={field} value={d.featureTitle} placeholder="Titre (vide = sous-titre de la landing page)" onChange={(e) => set("featureTitle", e.target.value)} />
                    <textarea dir="auto" rows={2} className={cn(field, "h-auto py-2")} value={d.featureText} placeholder="Texte (vide = 1er avantage)" onChange={(e) => set("featureText", e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Photo sous la liste des problèmes (« واش كتعاني من هادشي؟ »)</h3>
                <ImageChoice value={d.problemImage} onChange={(u) => set("problemImage", u)} candidates={imgs} autoUrl={null} autoLabel="Pas de photo" />
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Titre du bloc « Pour qui ? »</h3>
                <input dir="auto" className={field} value={d.whoTitle} placeholder="vide = titre de la landing page (لمن مناسب؟)" onChange={(e) => set("whoTitle", e.target.value)} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Tuiles photo + légende ({d.tiles.length || "auto"})</h3>
                  <button type="button" disabled={d.tiles.length >= 9}
                    onClick={() => set("tiles", [...d.tiles, { image: "", text: "" }])}
                    className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40">+ Ajouter une tuile</button>
                </div>
                {d.tiles.length === 0 && <p className="text-xs text-muted-foreground">Automatique : photos 3 à 5 du produit avec les avantages 2 à 4. Ajoute une tuile pour choisir toi-même.</p>}
                {d.tiles.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border p-2">
                    <ImageChoice compact value={t.image} onChange={(u) => setTile(i, { image: u })} candidates={imgs} autoUrl={null} />
                    <input dir="auto" className={field} value={t.text} placeholder="Texte sous la photo (ex : قوي ومتين — كيتحمل 150 كيلو)" onChange={(e) => setTile(i, { text: e.target.value })} />
                    <button type="button" onClick={() => set("tiles", d.tiles.filter((_, j) => j !== i))} className="rounded p-2 text-red-600 hover:bg-red-50" title="Supprimer"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                {d.tiles.some((t) => !t.image) && <p className="text-xs text-amber-700">Une tuile sans photo n&apos;est pas affichée.</p>}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Galerie ({d.galleryImages.length || "auto"})</h3>
                  <ImageChoice compact value="" onChange={(u) => u && set("galleryImages", [...d.galleryImages, u].slice(0, 20))} candidates={imgs} autoUrl={null} />
                </div>
                <p className="text-xs text-muted-foreground">{d.galleryImages.length ? "Clique sur le crayon pour ajouter une photo. Flèches = ordre." : "Automatique : photos 6 et suivantes du produit. Clique sur le crayon pour choisir toi-même."}</p>
                <div className="flex flex-wrap gap-2">
                  {d.galleryImages.map((u, i) => (
                    <div key={u + i} className="relative h-20 w-20 overflow-hidden rounded-lg border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="h-full w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/55 px-0.5 text-white">
                        <button type="button" onClick={() => moveG(i, -1)} className="p-0.5"><ArrowUp className="h-3 w-3 -rotate-90" /></button>
                        <button type="button" onClick={() => set("galleryImages", d.galleryImages.filter((_, j) => j !== i))} className="p-0.5"><Trash2 className="h-3 w-3" /></button>
                        <button type="button" onClick={() => moveG(i, 1)} className="p-0.5"><ArrowDown className="h-3 w-3 -rotate-90" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="font-semibold">Dernier appel, bouton fixe & vidéo</h2>
          {T("finalTitle", "Titre du dernier appel")}
          {T("finalText", "Texte du dernier appel", "vide = sous-titre de la landing page")}
          {T("finalCta", "Bouton du dernier appel", "vide = texte du bouton de la landing page")}
          {T("stickyText", "Texte du bouton fixe", "vide = texte du bouton de la landing page")}
          {T("videoUrl", isGlobal ? "Vidéo (YouTube ou .mp4) — mieux par landing page" : "Vidéo de ce produit (YouTube ou lien .mp4)", "https://youtu.be/… ou https://…/video.mp4")}
          {T("videoTitle", "Titre vidéo")}
          {T("videoSub", "Sous-titre vidéo")}
          <h3 className="pt-2 text-sm font-semibold">Couleurs</h3>
          <div className="grid grid-cols-2 gap-2">
            {C("colorPrimary", "Boutons & prix")}
            {C("colorBadge", "Badge offre")}
            {C("colorDiscount", "Badge réduction")}
            {C("colorDark", "Footer & dernier appel")}
            {C("colorBg", "Fond de page")}
          </div>
        </div>
      </div>

      <div className="sticky bottom-4 flex items-center gap-3">
        <button disabled={pending} onClick={() => start(async () => { const r = await saveLpDesign(store); setMsg(r.success ? "✅ Enregistré — en ligne dans ~1 min" : `❌ ${r.error}`); })}
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
