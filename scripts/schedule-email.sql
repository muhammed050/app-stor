-- Requires scripts/schedule-verification.sql to have created job:secret and extensions.
SELECT cron.schedule('dorucenie-transactional-email','* * * * *',
$job$
 SELECT net.http_post(
   url := 'https://dorucenie.com/api/jobs/email',
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT body::jsonb->>'value' FROM eldevo.records WHERE id='job:secret')),
   body := '{}'::jsonb,
   timeout_milliseconds := 110000
 );
$job$);
