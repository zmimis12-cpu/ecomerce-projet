import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getAdPlatformSettings } from "@/lib/ads/actions";
import { AdsSettingsForm } from "@/components/ads-integration/ads-settings-form";

export const metadata: Metadata = { title: "Paramètres Publicité" };
export const dynamic = "force-dynamic";

export default async function AdsSettingsPage() {
  await requireRole(["super_admin", "admin"]);

  const [metaSettings, googleSettings, tiktokSettings] = await Promise.all([
    getAdPlatformSettings("meta"),
    getAdPlatformSettings("google"),
    getAdPlatformSettings("tiktok"),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paramètres Publicité</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connectez vos comptes publicitaires. Nommez chaque campagne avec le SKU
          du produit entre crochets, ex: <code className="bg-secondary px-1 rounded">[FOAM CLEANER] Conversions</code>.
          Le système calcule automatiquement le coût réel par produit.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <AdsSettingsForm platform="meta"   settings={metaSettings}   />
        <AdsSettingsForm platform="google" settings={googleSettings} />
        <AdsSettingsForm platform="tiktok" settings={tiktokSettings} />
      </div>
    </div>
  );
}
