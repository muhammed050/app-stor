-- Operational setup for the selected Supabase project and production domain.
-- Run only after the API is deployed. Secret stays in the private application schema.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
INSERT INTO eldevo.records(id,kind,owner,body,created_at)
VALUES ('job:secret','job','system',jsonb_build_object('id','job:secret','value',gen_random_uuid()::text || gen_random_uuid()::text)::text,now()::text)
ON CONFLICT(id) DO NOTHING;
SELECT cron.schedule('eldevo-publication-verification','*/15 * * * *',
$job$
 SELECT net.http_post(
   url := 'https://dorucenie.com/api/jobs/verify',
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT body::jsonb->>'value' FROM eldevo.records WHERE id='job:secret')),
   body := '{}'::jsonb,
   timeout_milliseconds := 110000
 );
$job$);
