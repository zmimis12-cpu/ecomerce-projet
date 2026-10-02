import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getAdPlatformSettings } from "@/lib/ads/actions";
import { listManualAdSpend } from "@/lib/ads/manual-actions";
import { AdsSettingsForm } from "@/components/ads-integration/ads-settings-form";
import { CampaignAssignment } from "@/components/ads-integration/campaign-assignment";
import { ManualAdSpendForm } from "@/components/ads-integration/manual-ad-spend-form";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getMetaAccounts } from "@/lib/ads/meta-accounts";
import { MetaAccountsManager } from "@/components/ads-integration/meta-accounts-manager";

export const metadata: Metadata = { title: "Paramètres Publicité" };
export const dynamic = "force-dynamic";

export default async function AdsSettingsPage() {
  await requireRole(["super_admin", "admin"]);

  const [metaSettings, googleSettings, tiktokSettings, productsData, manualEntries] = await Promise.all([
    getAdPlatformSettings("meta"),
    getAdPlatformSettings("google"),
    getAdPlatformSettings("tiktok"),
    supabaseAdmin.from("products").select("id, name, sku").order("name"),
    listManualAdSpend(),
  ]);
  // Jamais de token renvoyé au navigateur
  const metaAccounts = (await getMetaAccounts()).map(({ token: _t, ...a }) => { void _t; return a; });

  const products = (productsData.data ?? []) as { id: string; name: string; sku: string }[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paramètres Publicité</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connectez vos comptes publicitaires. Assignez chaque campagne à un produit pour un calcul exact des dépenses.
        </p>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-1 font-semibold">Comptes Meta (plusieurs comptes)</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Synchro, stats, règles automatiques et taxe couvrent TOUS les comptes actifs. Le compte principal sert au Lanceur et à l&apos;audience Acheteurs.
        </p>
        <MetaAccountsManager accounts={metaAccounts} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <AdsSettingsForm platform="meta"   settings={metaSettings}   />
        <AdsSettingsForm platform="google" settings={googleSettings} />
        <AdsSettingsForm platform="tiktok" settings={tiktokSettings} />
      </div>

      {metaSettings?.is_active && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <CampaignAssignment products={products} />
        </div>
      )}

      <ManualAdSpendForm entries={manualEntries} />
    </div>
  );
}
