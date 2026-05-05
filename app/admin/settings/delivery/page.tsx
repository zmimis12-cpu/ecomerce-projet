import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DigylogSettingsForm } from "@/components/delivery-integration/digylog-settings-form";

export const metadata: Metadata = { title: "Paramètres Digylog" };
export const dynamic = "force-dynamic";

export default async function DeliverySettingsPage() {
  await requireRole(["super_admin","admin"]);

  const { data: settings } = await supabaseAdmin
    .from("digylog_settings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const appUrl       = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const envToken     = process.env.DIGYLOG_TOKEN ?? "";
  const dbToken      = (settings as Record<string,unknown> | null)?.token as string ?? "";
  const activeToken  = envToken || dbToken; // env takes priority
  const tokenSource  = envToken ? "env" : dbToken ? "db" : "none";

  const config = (settings as Record<string, unknown> | null)?.config as {
    networks?: { id: number; name: string }[];
    stores?:   { id: number; name: string }[];
    cities?:   string[];
  } | null ?? null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Digylog — Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configurez votre intégration avec Digylog API v2.4.
        </p>
      </div>

      {/* Token status banner */}
      {tokenSource === "none" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <strong>Token manquant.</strong> Entrez votre token Digylog ci-dessous pour activer l&apos;intégration.
        </div>
      )}
      {tokenSource === "db" && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✓ Token configuré depuis les paramètres.
        </div>
      )}
      {tokenSource === "env" && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          ✓ Token actif via variable d&apos;environnement Vercel <code className="bg-blue-100 px-1 rounded">DIGYLOG_TOKEN</code>.
          Le token saisi ci-dessous sera ignoré tant que la variable Vercel est définie.
        </div>
      )}

      <DigylogSettingsForm
        settings={(settings ?? {}) as Record<string, unknown>}
        appUrl={appUrl}
        hasToken={!!activeToken}
        tokenSource={tokenSource}
        cachedNetworks={config?.networks ?? []}
        cachedStores={config?.stores ?? []}
      />
    </div>
  );
}
