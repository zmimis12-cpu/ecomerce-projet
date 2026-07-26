-- ── Migration: variantes produit (taille/couleur) sur landing_pages ─────────
-- Format: [{ "name": "الحجم", "options": ["S","M","L"] },
--          { "name": "اللون", "options": [{"label":"أحمر","image":"https://..."}] }]
ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS variant_options JSONB DEFAULT '[]';
