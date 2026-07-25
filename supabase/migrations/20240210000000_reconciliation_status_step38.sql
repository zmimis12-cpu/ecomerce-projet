-- ── Migration: statut de réconciliation précis sur delivery_invoice_items ──
-- Permet de distinguer "retour confirmé reçu" de "retour annoncé par Digylog
-- mais pas encore scanné à l'entrepôt" — matched_status seul (matched/pending/
-- mismatched) ne suffisait pas à afficher cette nuance importante.
ALTER TABLE delivery_invoice_items
  ADD COLUMN IF NOT EXISTS reconciliation_status TEXT;
