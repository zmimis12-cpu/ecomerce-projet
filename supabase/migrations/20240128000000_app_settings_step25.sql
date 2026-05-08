-- ── Migration: app_settings — centralized settings table ─────────────────────

CREATE TABLE IF NOT EXISTS app_settings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key         TEXT NOT NULL UNIQUE,
  value       JSONB NOT NULL DEFAULT 'null'::jsonb,
  category    TEXT NOT NULL DEFAULT 'general',
  label       TEXT,
  description TEXT,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_settings_key      ON app_settings(key);
CREATE INDEX IF NOT EXISTS idx_app_settings_category ON app_settings(category);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_select_auth"  ON app_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "settings_write_admin"  ON app_settings FOR ALL
  WITH CHECK (user_has_role('admin','super_admin'));

-- ── Seed default settings ─────────────────────────────────────────────────────
INSERT INTO app_settings (key, value, category, label) VALUES
  -- General
  ('company_name',         '"GestionPro"',        'general',    'Nom de la société'),
  ('timezone',             '"Africa/Casablanca"',  'general',    'Fuseau horaire'),
  ('currency',             '"MAD"',                'general',    'Devise'),
  ('language',             '"fr"',                 'general',    'Langue'),

  -- Delivery
  ('digylog_base_url',     '"https://seller.digylog.com/api"', 'delivery', 'Digylog Base URL'),
  ('delivery_fee_casa',    '25',                   'delivery',   'Frais livraison Casablanca (MAD)'),
  ('delivery_fee_other',   '35',                   'delivery',   'Frais livraison autres villes (MAD)'),
  ('delivery_fee_client',  '35',                   'delivery',   'Frais facturés au client (MAD)'),
  ('return_fee_default',   '35',                   'delivery',   'Frais retour par défaut (MAD)'),

  -- Finance
  ('packaging_cost_default',  '5',  'finance', 'Coût emballage par défaut (MAD)'),
  ('call_center_cost_default','3',  'finance', 'Coût call center par défaut (MAD)'),
  ('overcharge_threshold',    '5',  'finance', 'Seuil détection surcharge (MAD)'),

  -- Scanner
  ('scanner_sounds_enabled',  'true',   'scanner', 'Sons scanner activés'),
  ('scanner_fast_mode',       'true',   'scanner', 'Mode scan ultra-rapide'),
  ('scanner_auto_process',    'false',  'scanner', 'Traitement auto des retours'),

  -- Call Center
  ('cc_min_call_duration',    '20',   'call_center', 'Durée min appel confirmation (sec)'),
  ('cc_commission_per_order', '3',    'call_center', 'Commission par commande livrée (MAD)'),
  ('cc_fake_rate_threshold',  '20',   'call_center', 'Seuil taux fausses commandes (%)'),

  -- Google Sheets
  ('gsheet_auto_sync',        'false', 'google_sheets', 'Sync automatique Google Sheets'),
  ('gsheet_sync_interval',    '30',    'google_sheets', 'Intervalle sync (minutes)')

ON CONFLICT (key) DO NOTHING;
