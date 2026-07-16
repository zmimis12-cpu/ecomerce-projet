-- ── Migration: tracking Meta Conversions API (Purchase server-side) ─────────
-- Le pixel navigateur ne peut pas envoyer "Purchase" au moment de la
-- livraison/paiement (le client n'est plus sur la page à ce moment-là,
-- parfois plusieurs jours après). On capture les données de matching à la
-- CRÉATION de la commande, et on envoie l'événement Purchase plus tard,
-- côté serveur, quand le statut passe réellement à "paid".

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS meta_pixel_id       TEXT,
  ADD COLUMN IF NOT EXISTS meta_fbp            TEXT,
  ADD COLUMN IF NOT EXISTS meta_fbc            TEXT,
  ADD COLUMN IF NOT EXISTS meta_client_ip      TEXT,
  ADD COLUMN IF NOT EXISTS meta_client_ua      TEXT,
  ADD COLUMN IF NOT EXISTS meta_purchase_sent  BOOLEAN NOT NULL DEFAULT false;
