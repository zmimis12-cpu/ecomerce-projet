import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getDeliveryStores } from "@/lib/delivery/store-actions";
import { DeliveryProvidersClient } from "@/components/settings/delivery-providers-client";

export const metadata: Metadata = { title: "Sociétés de Livraison" };
export const dynamic = "force-dynamic";

export default async function DeliveryProvidersPage() {
  await requireRole(["super_admin", "admin"]);

  const [stores, { data: companies }] = await Promise.all([
    getDeliveryStores(),
    supabaseAdmin.from("delivery_companies").select("id, slug, name, is_active").order("name"),
  ]);

  type Company = { id: string; slug: string; name: string; is_active: boolean };
  const cos = (companies ?? []) as Company[];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sociétés de Livraison</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gérez vos transporteurs, comptes/stores, tokens API, Google Sheets et webhooks.
        </p>
      </div>
      <DeliveryProvidersClient stores={stores} companies={cos} />
    </div>
  );
}
