-- ── Migration: bucket pour images/GIF par section de landing page ───────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('lp-media', 'lp-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "lp_media_public_read" ON storage.objects;
CREATE POLICY "lp_media_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'lp-media');

DROP POLICY IF EXISTS "lp_media_auth_write" ON storage.objects;
CREATE POLICY "lp_media_auth_write" ON storage.objects
  FOR ALL USING (bucket_id = 'lp-media' AND auth.uid() IS NOT NULL);
