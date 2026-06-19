// Matches ad campaigns to products by looking for the product's SKU inside
// the campaign name. Same normalization (strip whitespace, lowercase) as the
// sheet-sync product matcher, since both deal with names typed by hand and
// SKUs that may contain Arabic text with inconsistent spacing.

export type ProductForMatching = { id: string; sku: string; name: string };
export type CampaignForMatching = { campaign_id: string; campaign_name: string; spend: number };

export type MatchResult = {
  product_id: string;
  matched_campaign_names: string[];
  total_spend: number;
};

function normalize(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/**
 * For each product, sum the spend of every campaign whose name contains
 * that product's SKU (normalized match). A campaign can only count toward
 * one product — the first matching product wins — to avoid double-counting
 * spend if two SKUs happen to both appear in one campaign name.
 */
export function matchCampaignsToProducts(
  products: ProductForMatching[],
  campaigns: CampaignForMatching[]
): { matches: MatchResult[]; unmatchedCampaigns: CampaignForMatching[] } {
  const matches: MatchResult[] = products.map((p) => ({
    product_id: p.id,
    matched_campaign_names: [],
    total_spend: 0,
  }));
  const matchByProductId = new Map(matches.map((m) => [m.product_id, m]));
  const unmatchedCampaigns: CampaignForMatching[] = [];

  for (const campaign of campaigns) {
    const normalizedCampaignName = normalize(campaign.campaign_name);
    const matchedProduct = products.find((p) => {
      const sku = normalize(p.sku);
      return sku.length > 0 && normalizedCampaignName.includes(sku);
    });

    if (matchedProduct) {
      const m = matchByProductId.get(matchedProduct.id)!;
      m.matched_campaign_names.push(campaign.campaign_name);
      m.total_spend += campaign.spend;
    } else {
      unmatchedCampaigns.push(campaign);
    }
  }

  return { matches, unmatchedCampaigns };
}
