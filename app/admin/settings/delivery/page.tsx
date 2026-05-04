import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DigylogSettingsForm } from "@/components/delivery-integration/digylog-settings-form";

export const metadata: Metadata = { title: "Paramètres Digylog" };
export const dynamic = "force-dynamic";

export default async function DeliverySettingsPage() {
  await requireRole(["super_admin","admin"]);
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("digylog_settings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const hasToken = !!(process.env.DIGYLOG_TOKEN ?? "");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Digylog — Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configurez votre intégration avec Digylog API v2.4.
        </p>
      </div>

      {!hasToken && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>DIGYLOG_TOKEN</strong> non trouvé. Ajoutez-le dans vos variables d&apos;environnement Vercel.
        </div>
      )}
      {hasToken && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✓ <strong>DIGYLOG_TOKEN</strong> configuré dans les variables Vercel.
        </div>
      )}

      <DigylogSettingsForm
        settings={(settings ?? {}) as Record<string, unknown>}
        appUrl={appUrl}
        hasToken={hasToken}
      />
    </div>
  );
}
