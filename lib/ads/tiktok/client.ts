// TikTok Marketing API client — fetches campaign-level ad spend so it can be
// matched to products by SKU in the campaign name (see matcher.ts).
//
// Required TikTok setup (one-time, done by the store owner, not in code):
//   1. Create an app at business-api.tiktok.com (TikTok for Business)
//   2. Get approved for the "Reporting" scope on your access token
//   3. Find your advertiser_id in TikTok Ads Manager (Account Settings)
//   4. Same access_token as the one used for the Events API (pixel) works
//      here too, as long as it has both scopes granted.
//
// Naming convention for campaigns to be auto-matched to a product: include
// the product's exact SKU anywhere in the campaign name (same rule as Meta).

const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

export type TikTokCampaignInsight = {
  campaign_id: string;
  campaign_name: string;
  spend: number; // en devise du compte — l'appelant gère la conversion MAD si besoin
};

export type TikTokInsightsResult =
  | { ok: true; campaigns: TikTokCampaignInsight[] }
  | { ok: false; error: string };

export class TikTokAdsClient {
  constructor(private accessToken: string, private advertiserId: string) {}

  hasCredentials(): boolean {
    return this.accessToken.length > 0 && this.advertiserId.length > 0;
  }

  /**
   * Récupère les dépenses par campagne sur une période.
   * dateFrom/dateTo format: YYYY-MM-DD
   */
  async getCampaignSpend(dateFrom: string, dateTo: string): Promise<TikTokInsightsResult> {
    if (!this.hasCredentials()) {
      return { ok: false, error: "Token ou Advertiser ID TikTok manquant." };
    }

    const url = new URL(`${TIKTOK_API_BASE}/report/integrated/get/`);
    url.searchParams.set("advertiser_id", this.advertiserId);
    url.searchParams.set("report_type", "BASIC");
    url.searchParams.set("dimensions", JSON.stringify(["campaign_id"]));
    url.searchParams.set("data_level", "AUCTION_CAMPAIGN");
    url.searchParams.set("metrics", JSON.stringify(["campaign_name", "spend"]));
    url.searchParams.set("start_date", dateFrom);
    url.searchParams.set("end_date", dateTo);
    url.searchParams.set("page_size", "200");

    try {
      const campaigns: TikTokCampaignInsight[] = [];
      let page = 1;
      let guard = 0;

      while (guard < 10) {
        url.searchParams.set("page", String(page));
        const res = await fetch(url.toString(), {
          headers: { "Access-Token": this.accessToken },
        });
        const json = await res.json();

        if (!res.ok || json.code !== 0) {
          return { ok: false, error: json?.message ?? `Erreur HTTP ${res.status}` };
        }

        const rows = (json.data?.list ?? []) as {
          dimensions: { campaign_id: string };
          metrics: { campaign_name: string; spend: string };
        }[];
        campaigns.push(...rows.map((r) => ({
          campaign_id: r.dimensions.campaign_id,
          campaign_name: r.metrics.campaign_name,
          spend: parseFloat(r.metrics.spend ?? "0") || 0,
        })));

        const totalPages = json.data?.page_info?.total_page ?? 1;
        if (page >= totalPages) break;
        page++;
        guard++;
      }

      return { ok: true, campaigns };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau inconnue" };
    }
  }

  /** Vérification rapide des identifiants — récupère le nom de l'annonceur. */
  async testConnection(): Promise<{ ok: boolean; error?: string; accountName?: string }> {
    if (!this.hasCredentials()) {
      return { ok: false, error: "Token ou Advertiser ID TikTok manquant." };
    }
    try {
      const url = new URL(`${TIKTOK_API_BASE}/advertiser/info/`);
      url.searchParams.set("advertiser_ids", JSON.stringify([this.advertiserId]));
      const res = await fetch(url.toString(), {
        headers: { "Access-Token": this.accessToken },
      });
      const json = await res.json();
      if (!res.ok || json.code !== 0) {
        return { ok: false, error: json?.message ?? `Erreur HTTP ${res.status}` };
      }
      const info = json.data?.list?.[0];
      return { ok: true, accountName: info?.name ?? this.advertiserId };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau inconnue" };
    }
  }

  /** Liste toutes les campagnes du compte (id + nom + statut) */
  async listCampaigns(): Promise<{ ok: boolean; error?: string; campaigns?: { id: string; name: string; status: string }[] }> {
    if (!this.hasCredentials()) return { ok: false, error: "Token ou Advertiser ID TikTok manquant." };
    try {
      const url = new URL(`${TIKTOK_API_BASE}/campaign/get/`);
      url.searchParams.set("advertiser_id", this.advertiserId);
      url.searchParams.set("page_size", "200");
      const res = await fetch(url.toString(), {
        headers: { "Access-Token": this.accessToken },
      });
      const json = await res.json();
      if (!res.ok || json.code !== 0) return { ok: false, error: json?.message ?? `Erreur HTTP ${res.status}` };
      const campaigns = (json.data?.list ?? []).map((c: { campaign_id: string; campaign_name: string; operation_status: string }) => ({
        id: c.campaign_id,
        name: c.campaign_name,
        status: c.operation_status,
      }));
      return { ok: true, campaigns };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau inconnue" };
    }
  }
}
