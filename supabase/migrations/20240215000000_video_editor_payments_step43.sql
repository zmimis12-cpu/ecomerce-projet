-- ── Migration: Paiements des éditeurs vidéo + justificatifs ───────────────────
-- Reste à payer = total gagné (commandes livrées) − total des paiements.

CREATE TABLE IF NOT EXISTS video_editor_payments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  editor_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  method      TEXT NOT NULL DEFAULT 'virement'
              CHECK (method IN ('virement','cash','wafacash','cashplus','autre')),
  reference   TEXT,
  note        TEXT,
  proof_path  TEXT,          -- fichier dans le bucket privé editor-payment-proofs
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vep_editor ON video_editor_payments(editor_id, paid_on DESC);

ALTER TABLE video_editor_payments ENABLE ROW LEVEL SECURITY;  -- accès serveur uniquement

-- Bucket PRIVÉ pour les justificatifs (lus via liens signés temporaires)
INSERT INTO storage.buckets (id, name, public)
VALUES ('editor-payment-proofs', 'editor-payment-proofs', false)
ON CONFLICT (id) DO NOTHING;
