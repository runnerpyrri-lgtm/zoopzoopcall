-- Edge 자원 한도 안에서 활성 공고를 한 건씩 순환 처리한다.
do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'homebom-official-document-sync';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
end $$;

select cron.schedule(
  'homebom-official-document-sync',
  '*/15 * * * *',
  $schedule$
  select net.http_post(
    url := 'https://neqjmxaneibobpedgsnl.supabase.co/functions/v1/sync-notice-documents',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-sync-token', coalesce((
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'homebom_notice_sync_token'
        limit 1
      ), '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $schedule$
);
