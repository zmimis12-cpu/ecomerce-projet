import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DeliverySettingsForm } from "@/components/delivery-integration/delivery-settings-form";

export const metadata: Metadata = { title: "Paramètres Transporteur" };
export const dynamic = "force-dynamic";

export default async function DeliverySettingsPage() {
  await requireRole(["super_admin","admin"]);
  const supabase = await createClient();

  const { data: companies } = await supabase
    .from("delivery_companies")
    .select("*")
    .order("created_at");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Transporteur — Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configurez votre intégration avec le transporteur.
        </p>
      </div>
      <DeliverySettingsForm
        companies={(companies ?? []) as Record<string, unknown>[]}
        appUrl={appUrl}
      />
    </div>
  );
}
