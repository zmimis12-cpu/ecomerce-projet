// Meta Marketing API client — fetches campaign-level ad spend so it can be
// matched to products by SKU in the campaign name (see matcher.ts).
//
// Required Meta setup (one-time, done by the store owner, not in code):
//   1. Create an app at developers.facebook.com (type: Business)
//   2. Add the "Marketing API" product to the app
//   3. Generate a long-lived System User access token with the `ads_read`
//      permission (System User tokens don't expire when a person leaves —
//      unlike personal user tokens which expire in ~60 days)
//   4. Find the ad account id in Ads Manager (format: act_XXXXXXXXXXXXX)
//
// Naming convention for campaigns to be auto-matched to a product:
// include the product's exact SKU anywhere in the campaign name, e.g.
// "[FOAM CLEANER] Conversions - Maroc". Matching is case-insensitive and
// ignores whitespace differences (same normalization as the sheet-sync
// product matcher, since campaign names are typed by hand too).

const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export type MetaCampaignInsight = {
  campaign_id: string;
  campaign_name: string;
  spend: number; // in account currency — caller is responsible for MAD conversion if needed
};

export type MetaInsightsResult =
  | { ok: true; campaigns: MetaCampaignInsight[] }
  | { ok: false; error: string };

export class MetaAdsClient {
  constructor(private accessToken: string, private accountId: string) {}

  hasCredentials(): boolean {
    return this.accessToken.length > 0 && this.accountId.length > 0;
  }

  /** Normalize account id — Meta requires the "act_" prefix on insights calls. */
  private get prefixedAccountId(): string {
    return this.accountId.startsWith("act_") ? this.accountId : `act_${this.accountId}`;
  }

  /**
   * Fetch campaign-level spend for a date range.
   * dateFrom/dateTo format: YYYY-MM-DD
   */
  async getCampaignSpend(dateFrom: string, dateTo: string): Promise<MetaInsightsResult> {
    if (!this.hasCredentials()) {
      return { ok: false, error: "Token ou Ad Account ID Meta manquant." };
    }

    const url = new URL(`${META_BASE_URL}/${this.prefixedAccountId}/insights`);
    url.searchParams.set("level", "campaign");
    url.searchParams.set("fields", "campaign_id,campaign_name,spend");
    url.searchParams.set("time_range", JSON.stringify({ since: dateFrom, until: dateTo }));
    url.searchParams.set("limit", "200");
    url.searchParams.set("access_token", this.accessToken);

    try {
      const res = await fetch(url.toString());
      const json = await res.json();

      if (!res.ok || json.error) {
        const msg = json?.error?.message ?? `Erreur HTTP ${res.status}`;
        return { ok: false, error: msg };
      }

      const rows = (json.data ?? []) as { campaign_id: string; campaign_name: string; spend?: string }[];
      const campaigns: MetaCampaignInsight[] = rows.map((r) => ({
        campaign_id: r.campaign_id,
        campaign_name: r.campaign_name,
        spend: parseFloat(r.spend ?? "0") || 0,
      }));

      // Handle pagination — Meta returns `paging.next` if there are more results
      let nextUrl: string | undefined = json.paging?.next;
      let guard = 0;
      while (nextUrl && guard < 10) {
        const nextRes = await fetch(nextUrl);
        const nextJson = await nextRes.json();
        if (!nextRes.ok || nextJson.error) break;
        const nextRows = (nextJson.data ?? []) as { campaign_id: string; campaign_name: string; spend?: string }[];
        campaigns.push(...nextRows.map((r) => ({
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name,
          spend: parseFloat(r.spend ?? "0") || 0,
        })));
        nextUrl = nextJson.paging?.next;
        guard++;
      }

      return { ok: true, campaigns };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau inconnue" };
    }
  }

  /** Quick credential check — fetches the ad account name. Used by a "Tester la connexion" button. */
  async testConnection(): Promise<{ ok: boolean; error?: string; accountName?: string }> {
    if (!this.hasCredentials()) {
      return { ok: false, error: "Token ou Ad Account ID Meta manquant." };
    }
    try {
      const url = new URL(`${META_BASE_URL}/${this.prefixedAccountId}`);
      url.searchParams.set("fields", "name,currency,account_status");
      url.searchParams.set("access_token", this.accessToken);
      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok || json.error) {
        return { ok: false, error: json?.error?.message ?? `Erreur HTTP ${res.status}` };
      }
      return { ok: true, accountName: json.name };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau inconnue" };
    }
  }

  /** List all campaigns in the account (id + name + status) */
  async listCampaigns(): Promise<{ ok: boolean; error?: string; campaigns?: { id: string; name: string; status: string }[] }> {
    if (!this.hasCredentials()) return { ok: false, error: "Token ou Ad Account ID Meta manquant." };
    try {
      const url = new URL(`${META_BASE_URL}/${this.prefixedAccountId}/campaigns`);
      url.searchParams.set("fields", "id,name,effective_status");
      url.searchParams.set("limit", "200");
      url.searchParams.set("access_token", this.accessToken);
      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok || json.error) return { ok: false, error: json?.error?.message ?? `Erreur HTTP ${res.status}` };
      const campaigns = (json.data ?? []).map((c: { id: string; name: string; effective_status: string }) => ({
        id: c.id,
        name: c.name,
        status: c.effective_status,
      }));
      return { ok: true, campaigns };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau inconnue" };
    }
  }
}
