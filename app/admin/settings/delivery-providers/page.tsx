import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DeliveryProvidersClient } from "@/components/settings/delivery-providers-client";
import type { DeliveryStoreRow } from "@/lib/delivery/store-actions-types";

export const metadata: Metadata = { title: "Sociétés de Livraison" };
export const dynamic = "force-dynamic";

type Company = { id: string; slug: string; name: string; is_active: boolean };

export default async function DeliveryProvidersPage() {
  await requireRole(["super_admin", "admin"]);

  let stores: DeliveryStoreRow[] = [];
  let companies: Company[]       = [];

  try {
    const { data } = await supabaseAdmin
      .from("delivery_stores")
      .select("id, name, slug, is_active, is_default, delivery_fee_mad, google_sheet_id, google_sheet_name, api_base_url, metadata, created_at, delivery_companies(id, slug, name)")
      .order("name");
    stores = (data ?? []) as DeliveryStoreRow[];
  } catch (e) {
    console.error("[delivery-providers] stores:", e);
  }

  try {
    const { data } = await supabaseAdmin
      .from("delivery_companies")
      .select("id, slug, name, is_active")
      .order("name");
    companies = (data ?? []) as Company[];
  } catch (e) {
    console.error("[delivery-providers] companies:", e);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sociétés de Livraison</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gérez vos transporteurs, comptes/stores, tokens API et webhooks.
        </p>
      </div>
      {(stores.length === 0 && companies.length === 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="font-semibold text-amber-800 text-sm">⚠ Migration SQL requise</p>
          <p className="text-xs text-amber-700 mt-1">
            Tables <code className="font-mono bg-amber-100 px-1 rounded">delivery_companies</code> et{" "}
            <code className="font-mono bg-amber-100 px-1 rounded">delivery_stores</code> manquantes.
          </p>
        </div>
      )}
      <DeliveryProvidersClient stores={stores} companies={companies} />
    </div>
  );
}
