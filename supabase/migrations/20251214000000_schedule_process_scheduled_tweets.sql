-- Enable required extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule Edge Function every minute (Supabase-safe)
select
  cron.schedule(
    'process_scheduled_tweets_every_minute',
    '* * * * *',
    $$
    select
      net.http_post(
        url := 'https://vgdycmpevjiyfjrbskxf.functions.supabase.co/process-scheduled-tweets',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        )
      );
    $$
  )
where not exists (
  select 1
  from cron.job
  where jobname = 'process_scheduled_tweets_every_minute'
);


