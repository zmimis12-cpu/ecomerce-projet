/**
 * lib/delivery/providers/index.ts
 * Provider registry — resolves the correct adapter for a given store.
 * Adding a new provider = create new class extending DeliveryProvider.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DigylogProvider } from "./digylog";
import type { DeliveryProvider } from "./base";

export type { DeliveryProvider, ShipmentPayload, ShipmentResult } from "./base";

type StoreRow = {
  id: string;
  slug: string;
  api_token: string | null;
  api_base_url: string | null;
  delivery_companies: { slug: string } | null;
};

/**
 * Resolve the correct provider adapter for a given store ID.
 * Falls back to env-based Digylog if no store configured.
 */
export async function getProviderForStore(storeId?: string | null): Promise<DeliveryProvider> {
  if (storeId) {
    const { data } = await supabaseAdmin
      .from("delivery_stores")
      .select("id, slug, api_token, api_base_url, delivery_companies(slug)")
      .eq("id", storeId)
      .eq("is_active", true)
      .maybeSingle();

    const store = data as StoreRow | null;
    if (store) {
      const companySlug = store.delivery_companies?.slug ?? "digylog";
      return resolveProvider(companySlug, store.api_token, store.api_base_url);
    }
  }

  // Fallback: use Digylog env vars
  return resolveProvider("digylog", null, null);
}

/**
 * Get the default provider (first active default store).
 */
export async function getDefaultProvider(): Promise<DeliveryProvider> {
  const { data } = await supabaseAdmin
    .from("delivery_stores")
    .select("id, slug, api_token, api_base_url, delivery_companies(slug)")
    .eq("is_active", true)
    .eq("is_default", true)
    .maybeSingle();

  const store = data as StoreRow | null;
  if (store) {
    const companySlug = store.delivery_companies?.slug ?? "digylog";
    return resolveProvider(companySlug, store.api_token, store.api_base_url);
  }

  return resolveProvider("digylog", null, null);
}

function resolveProvider(
  companySlug: string,
  apiToken: string | null,
  baseUrl: string | null
): DeliveryProvider {
  switch (companySlug) {
    case "digylog":
      return new DigylogProvider(
        apiToken ?? process.env.DIGYLOG_TOKEN ?? "",
        baseUrl  ?? process.env.DIGYLOG_BASE_URL ?? "https://seller.digylog.com/api"
      );
    // case "ozone":
    //   return new OzoneProvider(apiToken ?? "", baseUrl ?? "");
    default:
      // Unknown provider → fallback to Digylog
      return new DigylogProvider(
        process.env.DIGYLOG_TOKEN ?? "",
        process.env.DIGYLOG_BASE_URL ?? "https://seller.digylog.com/api"
      );
  }
}

/**
 * List all active delivery stores for UI dropdowns.
 */
export async function listDeliveryStores() {
  const { data } = await supabaseAdmin
    .from("delivery_stores")
    .select("id, name, slug, is_default, is_active, delivery_companies(id, name, slug)")
    .eq("is_active", true)
    .order("name");

  return (data ?? []) as {
    id: string; name: string; slug: string;
    is_default: boolean; is_active: boolean;
    delivery_companies: { id: string; name: string; slug: string } | null;
  }[];
}

/**
 * List all delivery companies.
 */
export async function listDeliveryCompanies() {
  const { data } = await supabaseAdmin
    .from("delivery_companies")
    .select("id, slug, name, is_active")
    .order("name");
  return (data ?? []) as { id: string; slug: string; name: string; is_active: boolean }[];
}
