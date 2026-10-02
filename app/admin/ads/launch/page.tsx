import type { Metadata } from "next";
import Link from "next/link";
import { Rocket } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NewLaunchForm } from "@/components/ads/launcher-ui";

export const metadata: Metadata = { title: "Lancer une campagne" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "📝 Brouillon", creating: "⚙️ Création…", waiting_media: "⏳ Meta traite les vidéos",
  ready: "⏸️ Créée (en pause)", active: "🟢 Active", error: "❌ Erreur",
};

export default async function LaunchListPage() {
  await requireRole(["super_admin", "admin", "manager"]);
  const [{ data: products }, { data: launches }] = await Promise.all([
    supabaseAdmin.from("products").select("id, name").eq("is_active", true).order("name"),
    supabaseAdmin.from("campaign_launches" as never).select("id, name, product_id, daily_budget_usd, status, created_at").order("created_at", { ascending: false }),
  ]);
  const prods = (products ?? []) as { id: string; name: string }[];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Rocket className="h-5 w-5 text-primary" /> Lancer une campagne Meta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Structure COD Maroc éprouvée : campagne Prospects → 1 ensemble large (Maroc, Advantage+), optimisé sur les commandes du pixel →
          3 à 5 vidéos/images. Budget et limites calculés sur tes vraies marges. Créée en pause, tu actives quand tu veux.
        </p>
      </div>
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 font-medium">Nouvelle campagne</h2>
        <NewLaunchForm products={prods} />
      </section>
      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3"><h2 className="font-medium">Mes lancements</h2></div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr><th className="px-4 py-2">Campagne</th><th className="px-4 py-2">Produit</th><th className="px-4 py-2 text-right">Budget</th><th className="px-4 py-2">Statut</th><th className="px-4 py-2">Créée le</th></tr>
          </thead>
          <tbody>
            {((launches ?? []) as { id: string; name: string; product_id: string | null; daily_budget_usd: number; status: string; created_at: string }[]).map((l) => (
              <tr key={l.id} className="border-t">
                <td className="px-4 py-2"><Link href={`/admin/ads/launch/${l.id}`} className="font-medium text-primary hover:underline">{l.name}</Link></td>
                <td className="px-4 py-2">{prods.find((p) => p.id === l.product_id)?.name ?? "—"}</td>
                <td className="px-4 py-2 text-right">{l.daily_budget_usd} $/jour</td>
                <td className="px-4 py-2">{STATUS_LABEL[l.status] ?? l.status}</td>
                <td className="px-4 py-2">{new Date(l.created_at).toLocaleDateString("fr-FR")}</td>
              </tr>
            ))}
            {(launches ?? []).length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Aucun lancement.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
