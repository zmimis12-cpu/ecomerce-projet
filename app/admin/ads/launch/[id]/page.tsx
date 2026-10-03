import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Rocket, CheckCircle2, AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { productEconomics, textSuggestions } from "@/lib/ads/launcher";
import { ItemEditor, DeleteItemButton, LaunchControls } from "@/components/ads/launcher-ui";
import { CampaignPanel, AdsetPanel, AdTextsEditor } from "@/components/ads/launcher-meta-ui";

export const metadata: Metadata = { title: "Campagne" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "📝 Brouillon", creating: "⚙️ Création…", waiting_media: "⏳ Meta traite les vidéos",
  ready: "⏸️ Créée dans Meta (en pause)", active: "🟢 Active", error: "❌ Erreur",
};
const ITEM_LABEL: Record<string, string> = {
  pending: "En attente", uploading: "Envoi…", processing: "⏳ Meta traite la vidéo", created: "✅ Créée", error: "❌ Erreur",
};

export default async function LaunchPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["super_admin", "admin", "manager"]);
  const { id } = await params;
  const { data: l } = await supabaseAdmin.from("campaign_launches" as never).select("*").eq("id", id).maybeSingle();
  if (!l) notFound();
  const launch = l as unknown as {
    id: string; name: string; product_id: string; daily_budget_usd: number; age_min: number; age_max: number;
    status: string; meta_campaign_id: string | null; error: string | null;
    objective: string | null; budget_mode: string | null; campaign_budget_usd: number | null;
  };
  const { data: setsRaw } = await supabaseAdmin.from("campaign_launch_adsets" as never).select("*").eq("launch_id", id).order("position");
  const adsets = (setsRaw ?? []) as {
    id: string; name: string; daily_budget_usd: number; optimization_event: string; bid_strategy: string; cost_cap_usd: number | null;
    age_min: number; age_max: number; genders: string; advantage_audience: boolean; placements: unknown;
    start_time: string | null; end_time: string | null; meta_adset_id: string | null; status: string; error: string | null;
  }[];
  const cbo = launch.budget_mode === "cbo";
  const [{ data: its }, { data: prod }, { data: cr }, eco] = await Promise.all([
    supabaseAdmin.from("campaign_launch_items" as never).select("*").eq("launch_id", id).order("created_at"),
    supabaseAdmin.from("products").select("name").eq("id", launch.product_id).maybeSingle(),
    supabaseAdmin.from("creatives" as never).select("id, code, title").eq("product_id", launch.product_id).order("code"),
    productEconomics(launch.product_id),
  ]);
  const items = (its ?? []) as {
    id: string; media_type: string; media_path: string; headline: string; primary_text: string; cta: string;
    status: string; error: string | null; creative_id: string | null; meta_ad_id: string | null;
    adset_ref: string | null; ad_name: string | null; description: string | null; display_link: string | null; url_override: string | null;
  }[];
  const creatives = (cr ?? []) as { id: string; code: string; title: string }[];
  const productName = (prod as { name: string } | null)?.name ?? "Produit";
  const texts = textSuggestions(productName, eco.price, eco.offer);
  const created = items.filter((i) => i.status === "created").length;
  const publicUrl = (p: string) => supabaseAdmin.storage.from("ad-media").getPublicUrl(p).data.publicUrl;

  const checks = [
    { ok: items.length >= 3, text: `3 à 5 pubs dans l'ensemble (tu en as ${items.length}) — Meta trouve plus vite la gagnante` },
    { ok: items.some((i) => i.media_type === "video"), text: "Au moins une vidéo (les vidéos convertissent mieux en COD)" },
    { ok: Number(launch.daily_budget_usd) >= eco.suggestedBudgetUsd * 0.7, text: `Budget suffisant pour apprendre (conseillé ≈ ${eco.suggestedBudgetUsd} $/jour)` },
    { ok: items.every((i) => i.creative_id), text: "Chaque pub liée à une vidéo d'éditeur (code ?cr=V00X → commandes attribuées)" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/ads/launch" className="text-xs text-muted-foreground hover:underline">← Lancements</Link>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold"><Rocket className="h-5 w-5 text-primary" /> {launch.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {productName} · {launch.daily_budget_usd} $/jour · Maroc {launch.age_min}-{launch.age_max} ans · ciblage large Advantage+ · optimisé « Lead » pixel
          </p>
          <p className="mt-1 text-sm font-medium">{STATUS_LABEL[launch.status] ?? launch.status}{launch.meta_campaign_id && <span className="ms-2 text-xs text-muted-foreground">Meta ID {launch.meta_campaign_id}</span>}</p>
          {launch.error && <p className="mt-1 text-sm text-red-600">{launch.error}</p>}
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 text-xs">
          <div>Offre de la landing page : <b>{eco.offer.label}</b> à <b>{eco.offer.price} MAD</b>{eco.offer.slug && <> (/lp/{eco.offer.slug})</>}</div>
          <div>Coût / commande max rentable : <b className="text-red-700">{eco.breakEvenCpoMad} MAD</b></div>
          <div>Objectif : <b>{eco.targetCpoMad} MAD</b> · Marge / livraison : <b>{eco.marginPerDelivered} MAD</b></div>
          <div className="mt-1 text-muted-foreground">Les règles auto du produit (protection + scaling) s&apos;appliquent à cette campagne.</div>
        </div>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-2 font-medium">Check-list « meilleure campagne »</h2>
        <ul className="space-y-1 text-sm">
          {checks.map((c) => (
            <li key={c.text} className="flex items-center gap-2">
              {c.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
              <span className={c.ok ? "" : "text-amber-800"}>{c.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 📣 NIVEAU CAMPAGNE ── */}
      <section className="rounded-xl border-l-4 border-l-blue-500 bg-card p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">📣 Campagne</h2>
        <CampaignPanel launchId={id} locked={!!launch.meta_campaign_id}
          initial={{ name: launch.name, objective: launch.objective ?? "OUTCOME_LEADS", budgetMode: (launch.budget_mode as "abo" | "cbo") ?? "abo", campaignBudgetUsd: launch.campaign_budget_usd }} />
      </section>

      {/* ── 🎯 NIVEAU ENSEMBLES + 🖼️ PUBS ── */}
      {adsets.map((st, idx) => {
        const its = items.filter((i) => (i.adset_ref ?? adsets[0]?.id) === st.id);
        const locked = !!st.meta_adset_id;
        return (
          <section key={st.id} className="space-y-3 rounded-xl border-l-4 border-l-violet-500 bg-card p-4 shadow-sm">
            <h2 className="flex flex-wrap items-center gap-2 font-semibold">
              🎯 Ensemble de pubs {idx + 1} <span className="font-normal text-muted-foreground">— {st.name}</span>
              {st.meta_adset_id && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800">Créé dans Meta</span>}
              {st.error && <span className="text-xs font-normal text-red-600">❌ {st.error}</span>}
            </h2>
            <AdsetPanel launchId={id} cbo={cbo} locked={locked}
              suggestedCapUsd={Math.round((eco.targetCpoMad / eco.fxRate) * 100) / 100}
              adset={{ id: st.id, name: st.name, dailyBudgetUsd: Number(st.daily_budget_usd), optimizationEvent: st.optimization_event,
                bidStrategy: st.bid_strategy, costCapUsd: st.cost_cap_usd, ageMin: st.age_min, ageMax: st.age_max, genders: st.genders,
                advantageAudience: st.advantage_audience, placements: (st.placements as "auto") ?? "auto", startTime: st.start_time, endTime: st.end_time }} />

            <div className="space-y-3 border-t pt-3">
              <h3 className="text-sm font-semibold">🖼️ Pubs de cet ensemble ({its.length})</h3>
              {its.map((it) => (
                <div key={it.id} className="rounded-lg border-l-4 border-l-amber-400 bg-muted/20 p-3">
                  <div className="mb-2 flex flex-wrap items-start gap-3">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                      {it.media_type === "video"
                        ? <video src={publicUrl(it.media_path)} className="h-full w-full object-cover" muted />
                        // eslint-disable-next-line @next/next/no-img-element
                        : <img src={publicUrl(it.media_path)} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div className="flex-1 text-xs">
                      {it.creative_id && <span className="me-2 rounded bg-fuchsia-100 px-1.5 py-0.5 font-mono text-[10px] text-fuchsia-800">{creatives.find((c) => c.id === it.creative_id)?.code}</span>}
                      {it.media_type === "video" ? "🎬 Vidéo" : "🖼️ Image"} · {ITEM_LABEL[it.status] ?? it.status}
                      {it.meta_ad_id && <span className="text-muted-foreground"> · Meta ID {it.meta_ad_id}</span>}
                      {it.error && <p className="text-red-600">{it.error}</p>}
                    </div>
                    {it.status !== "created" && <DeleteItemButton launchId={id} itemId={it.id} />}
                  </div>
                  <AdTextsEditor launchId={id} locked={it.status === "created"} adsets={adsets.map((a) => ({ id: a.id, name: a.name }))} item={it} />
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {launch.status !== "active" && (
        <section className="rounded-xl border border-dashed bg-card p-4">
          <h2 className="mb-3 font-semibold">➕ Nouvel ensemble de pubs</h2>
          <AdsetPanel launchId={id} cbo={cbo} locked={false} adset={null} suggestedCapUsd={Math.round((eco.targetCpoMad / eco.fxRate) * 100) / 100} />
        </section>
      )}

      {launch.status !== "active" && adsets.length > 0 && (
        <section className="rounded-xl border border-dashed bg-card p-4">
          <h2 className="mb-3 font-semibold">➕ Ajouter une pub (vidéo ou image)</h2>
          <ItemEditor launchId={id} creatives={creatives} texts={texts} adsets={adsets.filter((a) => !a.meta_adset_id).map((a) => ({ id: a.id, name: a.name }))} />
        </section>
      )}

      <section className="rounded-xl border bg-card p-4">
        <LaunchControls launchId={id} status={launch.status} itemsCount={items.length} createdCount={created} />
      </section>
    </div>
  );
}
