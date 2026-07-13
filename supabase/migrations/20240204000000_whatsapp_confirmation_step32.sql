-- ── Migration: WhatsApp order confirmation (Twilio) ──────────────────────────

-- 1. Config WhatsApp Business API (Meta Cloud API — pas d'abonnement mensuel,
--    juste à la conversation: 1000 gratuites/mois, puis quelques centimes)
CREATE TABLE IF NOT EXISTS whatsapp_settings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider          TEXT NOT NULL DEFAULT 'meta_cloud',
  access_token      TEXT NOT NULL DEFAULT '',   -- token système Meta (longue durée)
  phone_number_id   TEXT NOT NULL DEFAULT '',   -- ID du numéro WhatsApp Business (Meta Business Manager)
  is_active         BOOLEAN NOT NULL DEFAULT false,
  message_template  TEXT NOT NULL DEFAULT
    E'السلام عليكم {name} 🌸\nتوصلنا بالطلب ديالك ديال {product} بثمن {price}درهم.\nبغينا غير نأكدو معاك المعلومات:\n📍 المدينة: {city}\n🏠 العنوان: {address}\nواش هاد المعلومات صحيحة؟',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE whatsapp_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_settings_auth" ON whatsapp_settings;
CREATE POLICY "wa_settings_auth" ON whatsapp_settings FOR ALL USING (auth.uid() IS NOT NULL);

-- 2. Photos/vidéos "preuve produit" à envoyer après le message texte
CREATE TABLE IF NOT EXISTS product_whatsapp_media (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_url      TEXT NOT NULL,
  media_type     TEXT NOT NULL DEFAULT 'image',  -- 'image' | 'video'
  storage_path   TEXT,                            -- chemin R2 pour suppression propre
  display_order  INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pwm_product ON product_whatsapp_media(product_id);
ALTER TABLE product_whatsapp_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pwm_auth" ON product_whatsapp_media;
CREATE POLICY "pwm_auth" ON product_whatsapp_media FOR ALL USING (auth.uid() IS NOT NULL);

-- 3. Log des envois (debug + éviter les doublons)
CREATE TABLE IF NOT EXISTS whatsapp_message_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
  phone         TEXT NOT NULL,
  message_type  TEXT NOT NULL,        -- 'confirmation_text' | 'media'
  status        TEXT NOT NULL,        -- 'sent' | 'failed'
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_log_order ON whatsapp_message_log(order_id);
ALTER TABLE whatsapp_message_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_log_auth" ON whatsapp_message_log;
CREATE POLICY "wa_log_auth" ON whatsapp_message_log FOR ALL USING (auth.uid() IS NOT NULL);
