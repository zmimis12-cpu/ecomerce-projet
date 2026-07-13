-- ── Migration: bucket Supabase Storage pour les médias WhatsApp ─────────────
-- (on est revenu sur Supabase Storage au lieu de Cloudflare R2)

INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: lecture publique (les URLs sont envoyées directement à Meta/WhatsApp)
DROP POLICY IF EXISTS "whatsapp_media_public_read" ON storage.objects;
CREATE POLICY "whatsapp_media_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'whatsapp-media');

-- Policy: écriture/suppression pour utilisateurs authentifiés (admin/manager via l'app)
DROP POLICY IF EXISTS "whatsapp_media_auth_write" ON storage.objects;
CREATE POLICY "whatsapp_media_auth_write" ON storage.objects
  FOR ALL USING (bucket_id = 'whatsapp-media' AND auth.uid() IS NOT NULL);
