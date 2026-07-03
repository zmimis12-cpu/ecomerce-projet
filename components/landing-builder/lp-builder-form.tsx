"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertLandingPage } from "@/lib/landing-pages/actions";
import { AIGenerateButton } from "./ai-generate-button";
import { SmartGenerateButton } from "./smart-generate-button";
import { SectionsEditor } from "./sections-editor";
import { TEMPLATE_LABELS, TEMPLATE_DESCRIPTIONS, buildDefaultSections } from "@/lib/templates";
import type { TemplateKey, LPSection } from "@/lib/templates";
import type { GeneratedContent } from "@/lib/ai/generator";
import { cn } from "@/lib/utils";
import { Globe, Phone, Eye } from "lucide-react";

interface Product { id: string; name: string; slug: string; sale_price_mad: number; }

interface LPBuilderFormProps {
  products: Product[];
  mode: "create" | "edit";
  defaultValues?: Record<string, unknown>;
}

const TEMPLATES = Object.entries(TEMPLATE_LABELS) as [TemplateKey, string][];

export function LPBuilderForm({ products, mode, defaultValues }: LPBuilderFormProps) {
  const router                       = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast]            = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [activeTab, setActiveTab]    = useState<"general" | "content" | "sections" | "tracking">("general");

  // Form state
  const [productId,    setProductId]    = useState(String(defaultValues?.product_id    ?? ""));
  const [templateKey,  setTemplateKey]  = useState<TemplateKey>((defaultValues?.template_key as TemplateKey) ?? "gadget_viral");
  const [slug,         setSlug]         = useState(String(defaultValues?.slug          ?? ""));
  const [title,        setTitle]        = useState(String(defaultValues?.title         ?? ""));
  const [subtitle,     setSubtitle]     = useState(String(defaultValues?.subtitle      ?? ""));
  const [offerText,    setOfferText]    = useState(String(defaultValues?.offer_text    ?? ""));
  const [heroHeadline, setHeroHeadline] = useState(String(defaultValues?.hero_headline ?? ""));
  const [heroSub,      setHeroSub]      = useState(String(defaultValues?.hero_subheadline ?? ""));
  const [priceText,    setPriceText]    = useState(String(defaultValues?.price_text    ?? ""));
  const [oldPrice,     setOldPrice]     = useState(String(defaultValues?.old_price_text ?? ""));
  const [stockText,    setStockText]    = useState(String(defaultValues?.stock_text    ?? ""));
  const [ctaText,      setCtaText]      = useState(String(defaultValues?.cta_text      ?? "اطلب الآن"));
  const [whatsapp,     setWhatsapp]     = useState(String(defaultValues?.whatsapp_number ?? ""));
  const [metaPixel,    setMetaPixel]    = useState(String(defaultValues?.meta_pixel_id  ?? ""));
  const [tiktokPixel,  setTiktokPixel]  = useState(String(defaultValues?.tiktok_pixel_id ?? ""));
  const [googleGtm,    setGoogleGtm]    = useState(String(defaultValues?.google_gtm_id ?? ""));
  const [isActive,     setIsActive]     = useState(Boolean(defaultValues?.is_active    ?? true));
  const [b1,           setB1]           = useState<string>(String(defaultValues?.bundle_1_price ?? ""));
  const [b2,           setB2]           = useState<string>(String(defaultValues?.bundle_2_price ?? ""));
  const [b3,           setB3]           = useState<string>(String(defaultValues?.bundle_3_price ?? ""));
  const [aiAnalysis,   setAiAnalysis]   = useState<Record<string, string> | null>(null);
  const [customerPhotos, setCustomerPhotos] = useState<string>(
    ((defaultValues?.customer_photos as string[]) ?? []).join("\n")
  );
  const [sections,     setSections]     = useState<LPSection[]>(
    (defaultValues?.sections as LPSection[]) ?? buildDefaultSections(templateKey)
  );

  // Auto-fill when product selected
  function handleProductChange(id: string) {
    setProductId(id);
    const p = products.find((p) => p.id === id);
    if (p && mode === "create") {
      setSlug((s) => s || p.slug);
      setTitle((t) => t || p.name);
      setPriceText(`${p.sale_price_mad.toFixed(0)} درهم`);
      setOldPrice(`${(p.sale_price_mad * 1.3).toFixed(0)} درهم`);
      setB1(String(p.sale_price_mad));
      setB2(String((p.sale_price_mad * 2 * 0.9).toFixed(2)));
      setB3(String((p.sale_price_mad * 3 * 0.8).toFixed(2)));
    }
  }

  // Apply template — reset sections
  function handleTemplateChange(key: TemplateKey) {
    setTemplateKey(key);
    setSections(buildDefaultSections(key));
  }

  // Apply AI generated content
  function handleAIGenerated(content: GeneratedContent, _analysisData?: Record<string, string>) {
    setTitle(content.title || title);
    setSubtitle(content.subtitle || subtitle);
    setHeroHeadline(content.hero_headline);
    setHeroSub(content.hero_subheadline);
    setOfferText(content.offer_text);
    setPriceText(content.price_text);
    setOldPrice(content.old_price_text);
    setStockText(content.stock_text);
    setCtaText(content.cta_text);
    setSections(content.sections);
    if (content.ai_analysis) setAiAnalysis(content.ai_analysis as unknown as Record<string, string>);
    setToast({ type: "success", msg: "✨ Contenu généré avec succès!" });
    setTimeout(() => setToast(null), 3000);
    setActiveTab("content");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId || !slug || !title) {
      setToast({ type: "error", msg: "Produit, slug et titre sont obligatoires." });
      return;
    }

    startTransition(async () => {
      const res = await upsertLandingPage(
        mode === "edit" ? String(defaultValues?.id ?? "") || null : null,
        {
          product_id:       productId,
          slug:             slug.trim().toLowerCase(),
          title,
          subtitle,
          offer_text:       offerText,
          hero_headline:    heroHeadline,
          hero_subheadline: heroSub,
          price_text:       priceText,
          old_price_text:   oldPrice,
          stock_text:       stockText,
          cta_text:         ctaText,
          whatsapp_number:  whatsapp || undefined,
          customer_photos:  customerPhotos ? customerPhotos.split("\n").map(s => s.trim()).filter(Boolean) : [],
          meta_pixel_id:    metaPixel.trim() || undefined,
          tiktok_pixel_id:  tiktokPixel.trim() || undefined,
          google_gtm_id:    googleGtm.trim() || undefined,
          template_key:     templateKey,
          sections,
          is_active:        isActive,
          ai_analysis:     aiAnalysis ?? undefined,
          bundle_1_price:   b1 ? parseFloat(b1) : null,
          bundle_2_price:   b2 ? parseFloat(b2) : null,
          bundle_3_price:   b3 ? parseFloat(b3) : null,
        }
      );

      if (res.success) {
        setToast({ type: "success", msg: mode === "create" ? "Page créée !" : "Sauvegardé !" });
        setTimeout(() => router.push("/admin/landing-pages"), 800);
      } else {
        const msg = res.error?.includes("unique")
          ? "Ce slug est déjà utilisé."
          : (res.error ?? "Erreur.");
        setToast({ type: "error", msg });
      }
    });
  }

  const appUrl     = typeof window !== "undefined" ? window.location.origin : "";
  const previewUrl = slug ? `${appUrl}/lp/${slug}` : "";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {toast && (
        <div className={cn(
          "rounded-lg px-4 py-3 text-sm font-medium sticky top-4 z-10",
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-50 border border-red-200 text-red-700"
        )}>
          {toast.msg}
        </div>
      )}

      {/* ── Header strip ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {/* Status toggle */}
          <button type="button" onClick={() => setIsActive(!isActive)}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              isActive ? "bg-green-500" : "bg-slate-300"
            )}>
            <span className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
              isActive ? "translate-x-6" : "translate-x-1"
            )} />
          </button>
          <span className="text-sm font-medium">{isActive ? "Active" : "Inactive"}</span>
        </div>

        {previewUrl && (
          <a href={previewUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-primary hover:underline">
            <Eye className="h-4 w-4" /> Prévisualiser
          </a>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <button type="button" onClick={() => router.back()} disabled={isPending}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            Annuler
          </button>
          <button type="submit" disabled={isPending}
            className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {isPending ? "Sauvegarde…" : mode === "create" ? "Créer la page" : "Enregistrer"}
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b">
        {(["general", "content", "sections", "tracking"] as const).map((tab) => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            {tab === "general"  ? "Général"   :
             tab === "content"  ? "Contenu IA" :
             tab === "sections" ? "Sections"  : "Tracking"}
          </button>
        ))}
      </div>

      {/* ── Tab: General ── */}
      {activeTab === "general" && (
        <div className="space-y-5">
          <Card title="Produit & Template">
            <Field label="Produit *">
              <select value={productId} onChange={(e) => handleProductChange(e.target.value)}
                className={selectCls(!productId)}>
                <option value="">— Sélectionnez un produit —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.sale_price_mad} MAD</option>
                ))}
              </select>
            </Field>

            <Field label="Template">
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map(([key, label]) => (
                  <button key={key} type="button" onClick={() => handleTemplateChange(key)}
                    className={cn(
                      "rounded-xl p-3 text-left border-2 transition-all",
                      templateKey === key
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    )}>
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {TEMPLATE_DESCRIPTIONS[key]}
                    </p>
                  </button>
                ))}
              </div>
            </Field>
          </Card>

          <Card title="URL & Titre">
            <Field label="Slug (URL) *">
              <div className="flex items-center">
                <span className="flex h-10 items-center rounded-l-md border border-r-0 bg-secondary px-3 text-sm text-muted-foreground">/lp/</span>
                <input type="text" value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                  placeholder="nom-du-produit"
                  className={cn(inputCls(false), "rounded-l-none")} />
              </div>
              {previewUrl && (
                <p className="text-xs text-muted-foreground font-mono mt-1.5 truncate">{previewUrl}</p>
              )}
            </Field>

            <Field label="Titre *">
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="اسم المنتج بالعربية" dir="auto" className={inputCls(!title)} />
            </Field>

            <Field label="Sous-titre">
              <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)}
                placeholder="وصف قصير" dir="auto" className={inputCls(false)} />
            </Field>
          </Card>

          <Card title="Offres Bundle">
            <p className="text-xs text-muted-foreground">Laissez vide pour auto-calculer depuis le prix produit.</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "1 pièce (MAD)", val: b1, set: setB1 },
                { label: "2 pièces (MAD)", val: b2, set: setB2 },
                { label: "3 pièces (MAD)", val: b3, set: setB3 },
              ].map(({ label, val, set }) => (
                <Field key={label} label={label}>
                  <input type="number" min="0" step="0.01" value={val}
                    onChange={(e) => set(e.target.value)}
                    placeholder="Auto" className={inputCls(false)} />
                </Field>
              ))}
            </div>
          </Card>

          <Card title="WhatsApp (optionnel)">
            <Field label="Numéro WhatsApp">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="+212600000000" className={inputCls(false)} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Un bouton WhatsApp sera ajouté à la page.</p>
            </Field>
          </Card>

          <Card title="Photos clients (optionnel)">
            <Field label="URLs des photos clients (une par ligne)">
              <textarea
                value={customerPhotos}
                onChange={(e) => setCustomerPhotos(e.target.value)}
                placeholder={"https://...photo1.jpg\nhttps://...photo2.jpg\nhttps://...photo3.jpg\nhttps://...photo4.jpg"}
                rows={5}
                className={inputCls(false)}
                style={{resize:"vertical", fontFamily:"monospace", fontSize:"12px"}}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ajoutez les URLs des photos de vos clients (depuis Supabase Storage). Minimum 4 photos recommandées.
              </p>
            </Field>
          </Card>
        </div>
      )}

      {/* ── Tab: Content IA ── */}
      {activeTab === "content" && (
        <div className="space-y-5">
          <Card title="Génération Intelligente ✨">
            <p className="text-sm text-muted-foreground mb-3">
              L&apos;IA analyse automatiquement votre produit, sélectionne le meilleur template et génère tout le contenu en arabe/darija.
            </p>
            <SmartGenerateButton
              productId={productId}
              onGenerated={(content, tKey) => {
                handleTemplateChange(tKey as TemplateKey);
                handleAIGenerated(content);
              }}
            />
            <div className="border-t pt-3 mt-1">
              <p className="text-xs text-muted-foreground mb-2">Ou choisissez un template manuellement :</p>
              <AIGenerateButton
                productId={productId}
                templateKey={templateKey}
                onGenerated={handleAIGenerated}
              />
            </div>
          </Card>

          {aiAnalysis && (
            <Card title="🔍 Analyse produit détectée">
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["Type produit",  String(aiAnalysis.fingerprint ?? aiAnalysis.product_type ?? "—")],
                  ["Template choisi", String(aiAnalysis.templateKey ?? "—")],
                  ["Audience cible", String(aiAnalysis.target_audience ?? "—")],
                  ["Problème détecté", String(aiAnalysis.main_problem ?? "—")],
                  ["Bénéfice clé", String(aiAnalysis.main_benefit ?? "—")],
                  ["Angle émotionnel", String(aiAnalysis.emotional_angle ?? "—")],
                ] as [string, string][]).map(([label, val]) => (
                  <div key={label} className="rounded-lg bg-violet-50 border border-violet-100 p-2.5">
                    <p className="text-[10px] text-violet-500 uppercase tracking-wide font-semibold mb-0.5">{label}</p>
                    <p className="text-xs font-semibold text-foreground leading-snug" dir="auto">{val}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                {previewUrl && (
                  <a href={previewUrl} target="_blank" rel="noopener noreferrer"
                    className="flex-1 text-center rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-secondary/50 transition-colors">
                    Voir la page →
                  </a>
                )}
                <button type="button"
                  onClick={() => setActiveTab("sections")}
                  className="flex-1 text-center rounded-lg bg-secondary px-3 py-2 text-xs font-medium hover:bg-secondary/70 transition-colors">
                  Éditer sections →
                </button>
              </div>
            </Card>
          )}

          <Card title="Textes Hero">
            {[
              { label: "Headline hero",    val: heroHeadline, set: setHeroHeadline, ph: "العنوان الرئيسي الجذاب" },
              { label: "Sous-headline",    val: heroSub,      set: setHeroSub,      ph: "النص الثانوي تحت العنوان" },
              { label: "Texte promo",      val: offerText,    set: setOfferText,    ph: "🔥 عرض محدود" },
              { label: "Texte prix",       val: priceText,    set: setPriceText,    ph: "299 درهم" },
              { label: "Ancien prix",      val: oldPrice,     set: setOldPrice,     ph: "399 درهم" },
              { label: "Texte stock",      val: stockText,    set: setStockText,    ph: "⚠️ المخزون محدود" },
              { label: "Texte bouton CTA", val: ctaText,      set: setCtaText,      ph: "🛒 اطلب الآن" },
            ].map(({ label, val, set, ph }) => (
              <Field key={label} label={label}>
                <input type="text" value={val} onChange={(e) => set(e.target.value)}
                  placeholder={ph} dir="auto" className={inputCls(false)} />
              </Field>
            ))}
          </Card>
        </div>
      )}

      {/* ── Tab: Sections ── */}
      {activeTab === "sections" && (
        <Card title="Sections de la page">
          <p className="text-xs text-muted-foreground mb-3">
            Activez/désactivez et éditez chaque section. L&apos;ordre est fixé par le template.
          </p>
          <SectionsEditor sections={sections} onChange={setSections} />
        </Card>
      )}

      {/* ── Tab: Tracking ── */}
      {activeTab === "tracking" && (
        <Card title="Pixels & Tracking">
          <Field label="Meta Pixel ID">
            <input type="text" value={metaPixel} onChange={(e) => setMetaPixel(e.target.value)}
              placeholder="123456789012345" className={inputCls(false)} />
            <p className="text-xs text-muted-foreground mt-1">
              Facebook → Gestionnaire d&apos;événements → votre pixel → ID
            </p>
          </Field>
          <Field label="TikTok Pixel ID">
            <input type="text" value={tiktokPixel} onChange={(e) => setTiktokPixel(e.target.value)}
              placeholder="ABCDE1234567890" className={inputCls(false)} />
          </Field>
          <Field label="Google Tag Manager ID">
            <input type="text" value={googleGtm} onChange={(e) => setGoogleGtm(e.target.value)}
              placeholder="GTM-XXXXXXX" className={inputCls(false)} />
            <p className="text-xs text-muted-foreground mt-1">
              Pour Google Ads — créez un conteneur sur tagmanager.google.com, collez son ID ici
            </p>
          </Field>
          <div className="rounded-lg bg-secondary/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium mb-1 flex items-center gap-1">
              <Globe className="h-3 w-3" /> Variables d&apos;environnement pour l&apos;IA
            </p>
            <code className="block">AI_PROVIDER=openai</code>
            <code className="block">OPENAI_API_KEY=sk-...</code>
            <p className="mt-1 text-muted-foreground/70">Ajoutez dans Vercel → Settings → Env Vars</p>
          </div>
        </Card>
      )}
    </form>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

const inputCls = (hasError: boolean) => cn(
  "flex h-10 w-full rounded-md border bg-background px-3 text-sm",
  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
  hasError ? "border-red-400" : "border-input"
);

const selectCls = (hasError: boolean) => cn(
  "flex h-10 w-full rounded-md border bg-background px-3 text-sm",
  "focus:outline-none focus:ring-2 focus:ring-ring",
  hasError ? "border-red-400" : "border-input"
);
