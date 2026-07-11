-- ── Migration: Bank cards & expense tracking ─────────────────────────────────
-- Feature séparée du dashboard commandes: suivre les dépenses (domaine,
-- abonnements SaaS, etc.) par carte bancaire.

-- 1. Cartes bancaires
CREATE TABLE IF NOT EXISTS bank_cards (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label         TEXT NOT NULL,              -- ex: "Visa Business", "Carte Hicham"
  last4         TEXT,                       -- 4 derniers chiffres (optionnel)
  color         TEXT NOT NULL DEFAULT '#0f172a',  -- couleur d'affichage (hex)
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE bank_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bank_cards_auth" ON bank_cards;
CREATE POLICY "bank_cards_auth" ON bank_cards FOR ALL USING (auth.uid() IS NOT NULL);

-- 2. Lier les dépenses existantes à une carte (la table "expenses" existait
--    déjà mais n'était utilisée nulle part dans le code — on l'active ici).
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS card_id UUID REFERENCES bank_cards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_card ON expenses(card_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);
