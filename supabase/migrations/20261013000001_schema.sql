create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table public.plans (
  id text primary key,
  name text not null,
  monthly_jobs integer not null,
  max_storage_bytes bigint not null,
  max_file_bytes bigint not null,
  max_duration_seconds integer not null
);

insert into public.plans (id, name, monthly_jobs, max_storage_bytes, max_file_bytes, max_duration_seconds)
values ('free', 'Free', 3, 524288000, 52428800, 600);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  plan_id text not null default 'free' references public.plans (id),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  default_volume numeric(3, 2) not null default 0.80 check (default_volume between 0 and 1),
  show_lyrics boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  artist text check (artist is null or char_length(artist) <= 200),
  original_filename text,
  status text not null default 'uploading'
    check (status in ('uploading', 'uploaded', 'processing', 'ready', 'failed')),
  duration_seconds numeric(10, 2),
  peaks jsonb,
  is_favorite boolean not null default false,
  rights_confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index songs_user_created_idx on public.songs (user_id, created_at desc);
create index songs_user_favorite_idx on public.songs (user_id) where is_favorite;
create index songs_title_trgm_idx on public.songs using gin (title gin_trgm_ops);
create index songs_stale_idx on public.songs (created_at) where status = 'uploading';

create table public.audio_files (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('original', 'instrumental', 'vocals', 'recording', 'mix')),
  bucket text not null,
  path text not null unique,
  format text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  duration_seconds numeric(10, 2),
  sample_rate integer,
  created_at timestamptz not null default now()
);

create unique index audio_files_song_kind_idx on public.audio_files (song_id, kind)
  where kind in ('original', 'instrumental', 'vocals');
create index audio_files_user_idx on public.audio_files (user_id);
create index audio_files_song_idx on public.audio_files (song_id);

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'canceled')),
  stage text,
  progress smallint check (progress is null or progress between 0 and 100),
  error text,
  attempt integer not null default 1,
  model text not null default 'htdemucs',
  queue_job_id text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index processing_jobs_one_active_idx on public.processing_jobs (song_id)
  where status in ('queued', 'processing');
create index processing_jobs_user_created_idx on public.processing_jobs (user_id, created_at desc);
create index processing_jobs_status_idx on public.processing_jobs (status, created_at);

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  audio_file_id uuid not null references public.audio_files (id) on delete cascade,
  title text not null default 'Take',
  created_at timestamptz not null default now()
);

create index recordings_song_idx on public.recordings (song_id);
create index recordings_user_idx on public.recordings (user_id);

create table public.usage_records (
  user_id uuid not null references public.profiles (id) on delete cascade,
  period_start date not null,
  jobs_used integer not null default 0 check (jobs_used >= 0),
  primary key (user_id, period_start)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  user_id uuid,
  action text not null,
  entity text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_user_idx on public.audit_events (user_id, created_at desc);
create index audit_events_created_idx on public.audit_events (created_at);

create table public.copyright_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_name text not null,
  reporter_email text not null,
  work_description text not null,
  location_description text not null,
  statement_accepted boolean not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'rejected')),
  created_at timestamptz not null default now()
);

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger songs_updated before update on public.songs
  for each row execute function public.set_updated_at();
create trigger processing_jobs_updated before update on public.processing_jobs
  for each row execute function public.set_updated_at();
create trigger user_preferences_updated before update on public.user_preferences
  for each row execute function public.set_updated_at();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.current_period_start() returns date
language sql stable as $$
  select (date_trunc('month', now() at time zone 'utc'))::date;
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create function public.storage_used(p_user uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(size_bytes), 0)::bigint from public.audio_files where user_id = p_user;
$$;

create function public.reserve_processing_job(p_user uuid, p_song uuid, p_model text default 'htdemucs')
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

create function public.finish_processing_job(p_job uuid, p_status text, p_error text default null)
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

  if p_status in ('failed', 'canceled') then
    v_period := (date_trunc('month', v_job.created_at at time zone 'utc'))::date;
    update public.usage_records
    set jobs_used = greatest(jobs_used - 1, 0)
    where user_id = v_job.user_id and period_start = v_period;
  end if;

  insert into public.audit_events (user_id, action, entity, entity_id, metadata)
  values (v_job.user_id, 'job.' || p_status, 'processing_job', p_job::text, jsonb_build_object('error', p_error));
end;
$$;

create function public.stale_upload_songs(p_older_than interval default interval '1 day')
returns table (song_id uuid, owner_id uuid)
language sql stable security definer set search_path = public as $$
  select id, user_id from public.songs
  where status = 'uploading' and created_at < now() - p_older_than;
$$;

create function public.prune_audit_events(p_older_than interval default interval '1 year')
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  delete from public.audit_events where created_at < now() - p_older_than;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
