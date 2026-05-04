/**
 * lib/delivery/index.ts
 * Delivery provider registry — returns the right provider for a company slug.
 * Server-side only — never import in client components.
 */
import { DeliveryProvider } from "./providers/base";
import { DigylogProvider } from "./providers/digylog";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Registry of all providers
const PROVIDERS: Record<string, (apiKey: string, baseUrl: string) => DeliveryProvider> = {
  digylog: (key, url) => new DigylogProvider(key, url),
};

// Get provider for a specific company (fetches config from DB)
export async function getDeliveryProvider(slug: string): Promise<{
  provider: DeliveryProvider;
  companyId: string;
} | null> {
  const { data, error } = await supabaseAdmin
    .from("delivery_companies")
    .select("id, slug, api_base_url, api_key_encrypted, is_active")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (error || !data) return null;

  const company = data as {
    id: string; slug: string; api_base_url: string;
    api_key_encrypted: string | null; is_active: boolean;
  };

  const factory = PROVIDERS[company.slug];
  if (!factory) return null;

  // API key: prefer env var, fall back to DB (for future encryption)
  const apiKey = getApiKeyFromEnv(company.slug) ?? company.api_key_encrypted ?? "";

  return {
    provider:  factory(apiKey, company.api_base_url ?? ""),
    companyId: company.id,
  };
}

// Get the default active provider
export async function getDefaultProvider(): Promise<{
  provider: DeliveryProvider;
  companyId: string;
  slug: string;
} | null> {
  const { data } = await supabaseAdmin
    .from("delivery_companies")
    .select("id, slug, api_base_url, api_key_encrypted, is_active")
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .single();

  if (!data) return null;
  const company = data as { id: string; slug: string; api_base_url: string; api_key_encrypted: string | null; is_active: boolean };
  const factory = PROVIDERS[company.slug];
  if (!factory) return null;

  const apiKey = getApiKeyFromEnv(company.slug) ?? company.api_key_encrypted ?? "";
  return {
    provider:  factory(apiKey, company.api_base_url ?? ""),
    companyId: company.id,
    slug:      company.slug,
  };
}

function getApiKeyFromEnv(slug: string): string | null {
  const key = `DELIVERY_API_KEY_${slug.toUpperCase().replace(/-/g,"_")}`;
  return process.env[key] ?? null;
}

export { DeliveryProvider } from "./providers/base";
export { mapStatus, STATUS_LABELS, STATUS_MAP } from "./status-map";
