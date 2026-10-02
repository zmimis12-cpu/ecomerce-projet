-- ── Offres flexibles sur les landing pages (remplace le 1/2/3 pièces figé) ───
-- [{ id, qty, price, label?, note?, badge?, isDefault? }]
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS offers JSONB NOT NULL DEFAULT '[]';
