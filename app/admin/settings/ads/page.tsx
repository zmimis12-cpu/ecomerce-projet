import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getAdPlatformSettings } from "@/lib/ads/actions";
import { AdsSettingsForm } from "@/components/ads-integration/ads-settings-form";

export const metadata: Metadata = { title: "Paramètres Publicité" };
export const dynamic = "force-dynamic";

export default async function AdsSettingsPage() {
  await requireRole(["super_admin", "admin"]);

  const metaSettings = await getAdPlatformSettings("meta");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paramètres Publicité</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connectez vos comptes publicitaires pour calculer automatiquement le coût réel par produit.
          Nommez chaque campagne avec le SKU exact du produit entre crochets, ex: <code>[FOAM CLEANER] Conversions</code>.
        </p>
      </div>
      <AdsSettingsForm platform="meta" settings={metaSettings} />
    </div>
  );
}
