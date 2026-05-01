# Supabase Storage — Bucket Setup

Create the following buckets in your Supabase project:
Dashboard → Storage → New bucket

## Buckets

### 1. `product-images`
- **Public:** Yes (images served directly to customers/previews)
- **Allowed MIME types:** `image/jpeg, image/png, image/webp, image/avif`
- **Max file size:** 5 MB
- **RLS policies:**
  - SELECT: public (anyone can read)
  - INSERT/UPDATE/DELETE: authenticated users with role `admin`, `manager`, `warehouse`

### 2. `landing-page-images`
- **Public:** Yes
- **Allowed MIME types:** `image/jpeg, image/png, image/webp, image/gif, video/mp4`
- **Max file size:** 50 MB
- **RLS policies:**
  - SELECT: public
  - INSERT/UPDATE/DELETE: `admin`, `manager`

### 3. `delivery-documents`
- **Public:** No (private — carrier invoices, manifests)
- **Allowed MIME types:** `application/pdf, image/jpeg, image/png`
- **Max file size:** 20 MB
- **RLS policies:**
  - SELECT: authenticated users with role `admin`, `manager`, `finance`, `scanner_agent`
  - INSERT: `admin`, `manager`, `scanner_agent`
  - DELETE: `admin`, `manager`

## Folder conventions

```
product-images/
  {product_id}/
    main.webp
    gallery-1.webp
    gallery-2.webp

landing-page-images/
  {campaign_id}/
    hero.jpg
    creative-1.mp4

delivery-documents/
  {year}/{month}/
    {shipment_id}-manifest.pdf
    {shipment_id}-invoice.pdf
```

## Storage helper (add to lib/supabase/storage.ts when needed)

```ts
export function getProductImageUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}
```
