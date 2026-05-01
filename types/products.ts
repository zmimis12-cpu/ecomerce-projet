/**
 * types/products.ts
 * Product domain types — fully typed, decoupled from DB stubs.
 */

export interface Product {
  id: string;
  sku: string;
  slug: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  is_bundle: boolean;

  // MAD cost fields
  sale_price_mad: number;
  purchase_price_mad: number;
  packaging_cost_mad: number;
  confirmation_cost_mad: number;
  shipping_cost_mad: number;
  ads_cost_mad: number;
  other_costs_mad: number;

  // Computed (by DB trigger)
  total_cost_mad: number;
  estimated_profit_mad: number;
  min_profitable_price: number;
  margin_pct: number;

  // Images
  images?: ProductImage[];

  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  storage_path: string;
  public_url: string;
  is_primary: boolean;
  display_order: number;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
}

export interface ProductFormValues {
  name: string;
  slug: string;
  description: string;
  sku: string;
  is_active: boolean;
  sale_price_mad: number;
  purchase_price_mad: number;
  packaging_cost_mad: number;
  confirmation_cost_mad: number;
  shipping_cost_mad: number;
  ads_cost_mad: number;
  other_costs_mad: number;
}

export interface ProductListItem extends Product {
  primary_image_url: string | null;
}

/** Compute costs client-side for live preview in form */
export function computeCosts(values: Partial<ProductFormValues>) {
  const total =
    (values.purchase_price_mad ?? 0) +
    (values.packaging_cost_mad ?? 0) +
    (values.confirmation_cost_mad ?? 0) +
    (values.shipping_cost_mad ?? 0) +
    (values.ads_cost_mad ?? 0) +
    (values.other_costs_mad ?? 0);

  const sale = values.sale_price_mad ?? 0;
  const profit = sale - total;
  const margin = sale === 0 ? 0 : Math.round((profit / sale) * 10000) / 100;

  return { total, profit, margin, minPrice: total };
}

/** Format MAD currency */
export function formatMAD(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("fr-MA", {
    style: "currency",
    currency: "MAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Generate slug from name */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 80);
}
