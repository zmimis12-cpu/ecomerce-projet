-- ── Planification : synchro automatique toutes les 15 minutes ────────────────
-- ⚠️ Le secret ci-dessous doit être IDENTIQUE à la variable CRON_SECRET dans Vercel.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('gestionpro-auto-sync')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gestionpro-auto-sync');

SELECT cron.schedule(
  'gestionpro-auto-sync',
  '*/15 * * * *',
  $$
  SELECT net.http_get(
    url     := 'https://hajtek.ma/api/cron/sync',
    headers := jsonb_build_object('Authorization', 'Bearer QcRNPSCLzzT-Hl0urWTB61qhstFLdNBfaJMI8BoCn_g'),
    timeout_milliseconds := 60000
  );
  $$
);
