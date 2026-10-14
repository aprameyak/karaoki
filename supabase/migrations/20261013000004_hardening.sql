drop policy originals_insert_own on storage.objects;
create policy originals_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'originals'
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}/original\.(mp3|wav|m4a|flac)$')
    and exists (
      select 1 from public.songs s
      where s.user_id = auth.uid() and s.id::text = (storage.foldername(name))[2]
    )
  );

drop policy recordings_obj_insert_own on storage.objects;
create policy recordings_obj_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recordings'
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}/take-[A-Za-z0-9_-]{1,64}\.(webm|ogg|m4a|wav)$')
    and exists (
      select 1 from public.songs s
      where s.user_id = auth.uid() and s.id::text = (storage.foldername(name))[2]
    )
  );

update storage.buckets set file_size_limit = 52428800 where id = 'originals';

drop policy songs_delete_own on public.songs;
revoke delete on public.songs from authenticated;
drop policy recordings_delete_own on public.recordings;
revoke delete on public.recordings from authenticated;

create function public.limit_pending_uploads() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'uploading'
    and (select count(*) from public.songs where user_id = new.user_id and status = 'uploading') >= 10 then
    raise exception 'too_many_pending_uploads' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.limit_pending_uploads() from public, anon, authenticated;

create trigger songs_limit_pending before insert on public.songs
  for each row execute function public.limit_pending_uploads();

create or replace function public.reserve_processing_job(p_user uuid, p_song uuid, p_model text default 'htdemucs')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_plan public.plans;
  v_period date := public.current_period_start();
  v_used integer;
  v_song public.songs;
  v_job uuid;
begin
  select pl.* into v_plan
  from public.profiles pr
  join public.plans pl on pl.id = pr.plan_id
  where pr.id = p_user;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  select * into v_song from public.songs where id = p_song and user_id = p_user for update;
  if not found then
    raise exception 'song_not_found' using errcode = 'P0002';
  end if;
  if v_song.status = 'processing' then
    raise exception 'job_in_progress' using errcode = 'P0003';
  end if;
  if v_song.status = 'ready' then
    raise exception 'already_processed' using errcode = 'P0003';
  end if;

  insert into public.usage_records (user_id, period_start)
  values (p_user, v_period)
  on conflict (user_id, period_start) do nothing;

  select jobs_used into v_used
  from public.usage_records
  where user_id = p_user and period_start = v_period
  for update;

  if v_used >= v_plan.monthly_jobs then
    raise exception 'quota_exceeded' using errcode = 'P0004';
  end if;

  insert into public.processing_jobs (song_id, user_id, model, attempt)
  values (
    p_song,
    p_user,
    p_model,
    1 + (select count(*) from public.processing_jobs where song_id = p_song)
  )
  returning id into v_job;

  update public.usage_records
  set jobs_used = jobs_used + 1
  where user_id = p_user and period_start = v_period;

  update public.songs set status = 'processing' where id = p_song;

  insert into public.audit_events (user_id, action, entity, entity_id)
  values (p_user, 'job.reserved', 'processing_job', v_job::text);

  return v_job;
end;
$$;

create or replace function public.finish_processing_job(p_job uuid, p_status text, p_error text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_job public.processing_jobs;
  v_period date;
begin
  if p_status not in ('completed', 'failed', 'canceled') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;

  select * into v_job from public.processing_jobs where id = p_job for update;
  if not found then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if v_job.status in ('completed', 'failed', 'canceled') then
    return;
  end if;

  update public.processing_jobs
  set status = p_status,
      error = case when p_status = 'completed' then null else left(p_error, 1000) end,
      progress = case when p_status = 'completed' then 100 else progress end,
      stage = case when p_status = 'completed' then 'done' else stage end,
      finished_at = now()
  where id = p_job;

  update public.songs
  set status = case p_status
    when 'completed' then 'ready'
    when 'failed' then 'failed'
    else case
      when exists (
        select 1 from public.audio_files where song_id = v_job.song_id and kind = 'instrumental'
      ) then 'ready'
      else 'uploaded'
    end
  end
  where id = v_job.song_id;

  if p_status = 'failed' or (p_status = 'canceled' and v_job.started_at is null) then
    v_period := (date_trunc('month', v_job.created_at at time zone 'utc'))::date;
    update public.usage_records
    set jobs_used = greatest(jobs_used - 1, 0)
    where user_id = v_job.user_id and period_start = v_period;
  end if;

  insert into public.audit_events (user_id, action, entity, entity_id, metadata)
  values (v_job.user_id, 'job.' || p_status, 'processing_job', p_job::text, jsonb_build_object('error', p_error));
end;
$$;
