import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { RuleBuilder, RuleRowControls, RunNowButton } from "@/components/ads/rule-builder";
import { metricLabel, windowLabel, ACTIONS } from "@/lib/ads/rules-types";
import { getMetaAccounts } from "@/lib/ads/meta-accounts";

export const metadata: Metadata = { title: "Règles automatiques pub" };
export const dynamic = "force-dynamic";

const fmtVal = (k: string, v: number | null) => (v == null ? "∞" : k === "ctr" ? `${v}%` : ["spend", "cost_per_order", "cost_per_delivered", "cost_per_result"].includes(k) ? `${v} MAD` : String(v));

export default async function AdRulesPage() {
  await requireRole(["super_admin", "admin", "manager"]);
  const [{ data: rules }, { data: logs }, { data: products }] = await Promise.all([
    supabaseAdmin.from("ad_rules" as never).select("*").order("created_at", { ascending: false }),
    supabaseAdmin.from("ad_rule_logs" as never).select("*").order("created_at", { ascending: false }).limit(100),
    supabaseAdmin.from("products").select("id, name").eq("is_active", true).order("name"),
  ]);
  const prods = (products ?? []) as { id: string; name: string }[];
  const accounts = (await getMetaAccounts()).filter((a) => a.isActive).map((a) => ({ key: a.key, label: a.label }));
  // Campagnes de chaque compte (pour voir ce que les règles surveillent)
  const { act } = await import("@/lib/ads/meta-accounts");
  const allAcc = (await getMetaAccounts()).filter((a) => a.isActive && a.adAccountId);
  const { data: assigns } = await supabaseAdmin.from("campaign_product_assignments").select("campaign_id, product_id").eq("platform", "meta");
  const prodOfCampaign = new Map(((assigns ?? []) as { campaign_id: string; product_id: string }[]).map((a) => [a.campaign_id, a.product_id]));
  const campaignsByAccount: { key: string; label: string; campaigns: { id: string; name: string; status: string; productId: string | null }[] }[] = [];
  for (const a of allAcc) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${act(a)}/campaigns?fields=id,name,effective_status&limit=200&access_token=${encodeURIComponent(a.token)}`, { cache: "no-store" });
      const j = await res.json();
      campaignsByAccount.push({ key: a.key, label: a.label, campaigns: ((j.data ?? []) as { id: string; name: string; effective_status: string }[])
        .filter((c) => !["DELETED", "ARCHIVED"].includes(c.effective_status))
        .map((c) => ({ id: c.id, name: c.name, status: c.effective_status, productId: prodOfCampaign.get(c.id) ?? null })) });
    } catch { campaignsByAccount.push({ key: a.key, label: a.label, campaigns: [] }); }
  }
  const accName = (k: string | null) => (k ? accounts.find((a) => a.key === k)?.label ?? "compte retiré" : "Tous les comptes");
  const pname = (id: string | null) => (id ? prods.find((p) => p.id === id)?.name ?? "—" : "Tous les produits");
  type R = { id: string; name: string; enabled: boolean; simulate: boolean; level: string; product_id: string | null;
    time_window: string; conditions: { metric: string; op: string; value: number }[]; action: string; cooldown_minutes: number; last_run_at: string | null;
    budget_pct: number | null; budget_max_usd: number | null; budget_min_usd: number | null; account_key: string | null };
  type L = { id: string; created_at: string; rule_name: string; object_name: string | null; action: string; simulated: boolean;
    success: boolean; error: string | null; metrics: Record<string, number | null> | null; detail: string | null; account_label: string | null };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Règles automatiques pub</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vérifiées toutes les 15 min avec la dépense Meta réelle ET les vraies commandes du système. Protection contre les pertes.
          </p>
        </div>
        <RunNowButton />
      </div>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 font-medium">Nouvelle règle</h2>
        <RuleBuilder products={prods} accounts={accounts} />
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="font-medium">Campagnes surveillées, par compte</h2>
          <p className="mt-1 text-xs text-muted-foreground">Une campagne doit être reliée à un produit pour que les règles « niveau produit » la surveillent. Les règles « niveau pub » surveillent toutes les pubs.</p>
        </div>
        <div className="divide-y">
          {campaignsByAccount.map((acc) => (
            <div key={acc.key} className="px-4 py-3">
              <div className="mb-2 font-semibold">🏢 {acc.label} <span className="text-xs font-normal text-muted-foreground">({acc.campaigns.length} campagnes)</span></div>
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground"><tr><th className="py-1">Campagne</th><th className="py-1">Statut</th><th className="py-1">Produit relié</th><th className="py-1">Règles actives</th></tr></thead>
                <tbody>
                  {acc.campaigns.map((c) => {
                    const n = ((rules ?? []) as R[]).filter((r) => r.enabled
                      && (!r.account_key || r.account_key === acc.key)
                      && (r.level === "ad" || (c.productId && (!r.product_id || r.product_id === c.productId)))).length;
                    return (
                      <tr key={c.id} className="border-t">
                        <td className="py-1.5">{c.name}</td>
                        <td className="py-1.5">{c.status === "ACTIVE" ? "🟢 Active" : c.status === "PAUSED" ? "⏸️ En pause" : c.status}</td>
                        <td className="py-1.5">{c.productId ? pname(c.productId) : <span className="text-amber-700">⚠️ Aucun (règles produit ne s&apos;appliquent pas)</span>}</td>
                        <td className="py-1.5">{n}</td>
                      </tr>
                    );
                  })}
                  {acc.campaigns.length === 0 && <tr><td colSpan={4} className="py-2 text-muted-foreground">Aucune campagne.</td></tr>}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3"><h2 className="font-medium">Mes règles ({(rules ?? []).length})</h2></div>
        <div className="divide-y">
          {((rules ?? []) as R[]).length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune règle.</p>}
          {((rules ?? []) as R[]).map((r) => (
            <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="space-y-1 text-sm">
                <div className="font-medium">
                  {r.name}
                  {r.simulate && <span className="ms-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">SIMULATION</span>}
                  {!r.enabled && <span className="ms-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">DÉSACTIVÉE</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  🏢 {accName(r.account_key)} · {r.level === "product" ? "Produit" : "Pub"} · {pname(r.product_id)} · {windowLabel(r.time_window)}
                </div>
                <div className="text-xs">
                  <b>SI</b> {r.conditions.map((c, i) => <span key={i}>{i > 0 && <b> ET </b>}{metricLabel(c.metric)} {c.op} {c.value}</span>)}
                  {" "}<b>ALORS</b> {ACTIONS.find((a) => a.key === r.action)?.label}
                  {r.action === "increase_budget" && <> de {r.budget_pct} % (max ${r.budget_max_usd}/jour)</>}
                  {r.action === "decrease_budget" && <> de {r.budget_pct} %{r.budget_min_usd ? ` (min $${r.budget_min_usd}/jour)` : ""}</>}
                  <span className="text-muted-foreground"> · max 1 fois / {r.cooldown_minutes >= 60 ? `${Math.round(r.cooldown_minutes / 60)} h` : `${r.cooldown_minutes} min`}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Dernière vérification : {r.last_run_at ? new Date(r.last_run_at).toLocaleString("fr-FR", { timeZone: "Africa/Casablanca" }) : "jamais"}
                </div>
              </div>
              <RuleRowControls id={r.id} enabled={r.enabled} simulate={r.simulate} />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3"><h2 className="font-medium">Journal (100 dernières actions)</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr><th className="px-3 py-2">Quand</th><th className="px-3 py-2">Compte</th><th className="px-3 py-2">Règle</th><th className="px-3 py-2">Objet</th>
                <th className="px-3 py-2">Action</th><th className="px-3 py-2">Chiffres au moment de l&apos;action</th></tr>
            </thead>
            <tbody>
              {((logs ?? []) as L[]).length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Rien pour l&apos;instant.</td></tr>}
              {((logs ?? []) as L[]).map((l) => (
                <tr key={l.id} className="border-t align-top">
                  <td className="whitespace-nowrap px-3 py-2">{new Date(l.created_at).toLocaleString("fr-FR", { timeZone: "Africa/Casablanca" })}</td>
                  <td className="px-3 py-2">{l.account_label ?? "—"}</td>
                  <td className="px-3 py-2">{l.rule_name}</td>
                  <td className="px-3 py-2">{l.object_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    {l.simulated ? <span className="text-blue-700">🧪 aurait fait : {l.action}</span>
                      : l.success ? <span className="font-semibold text-emerald-700">✅ {l.action}</span>
                      : <span className="text-red-600">❌ {l.error}</span>}
                    {l.detail && <div className="text-[10px] text-muted-foreground">{l.detail}</div>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {l.metrics ? Object.entries(l.metrics).filter(([, v]) => v !== 0).map(([k, v]) => `${metricLabel(k)} ${fmtVal(k, v)}`).join(" · ") : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
