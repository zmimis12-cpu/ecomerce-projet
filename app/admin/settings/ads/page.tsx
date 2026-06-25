import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getAdPlatformSettings } from "@/lib/ads/actions";
import { AdsSettingsForm } from "@/components/ads-integration/ads-settings-form";
import { CampaignAssignment } from "@/components/ads-integration/campaign-assignment";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Paramètres Publicité" };
export const dynamic = "force-dynamic";

export default async function AdsSettingsPage() {
  await requireRole(["super_admin", "admin"]);

  const [metaSettings, googleSettings, tiktokSettings, productsData] = await Promise.all([
    getAdPlatformSettings("meta"),
    getAdPlatformSettings("google"),
    getAdPlatformSettings("tiktok"),
    supabaseAdmin.from("products").select("id, name, sku").order("name"),
  ]);

  const products = (productsData.data ?? []) as { id: string; name: string; sku: string }[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paramètres Publicité</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connectez vos comptes publicitaires. Assignez chaque campagne à un produit pour un calcul exact des dépenses.
        </p>
      </div>

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
    </div>
  );
}
