// store-actions-types.ts — types only, no server imports
export type DeliveryStoreRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  is_default: boolean;
  delivery_fee_mad: number | null;
  google_sheet_id: string | null;
  google_sheet_name: string | null;
  api_base_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  delivery_companies: { id: string; slug: string; name: string } | null;
};

export type StoreFormData = {
  companyId:        string;
  name:             string;
  slug:             string;
  apiToken?:        string;
  apiBaseUrl?:      string;
  webhookSecret?:   string;
  googleSheetId?:   string;
  googleSheetName?: string;
  deliveryFeeMad?:  number;
  isActive:         boolean;
  isDefault:        boolean;
  clientName?:      string;
  clientPhone?:     string;
  fulfillmentFee?:  number;
};
