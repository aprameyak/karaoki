alter table public.user_preferences
  add column email_notifications boolean not null default true;

grant update (email_notifications) on public.user_preferences to authenticated;

alter table public.audio_files drop constraint audio_files_kind_check;
alter table public.audio_files add constraint audio_files_kind_check
  check (kind in ('original', 'instrumental', 'vocals', 'recording', 'mix', 'export'));

create table public.lyrics (
  song_id uuid primary key references public.songs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 100000),
  synced boolean not null default false,
  offset_ms integer not null default 0 check (offset_ms between -30000 and 30000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger lyrics_updated before update on public.lyrics
  for each row execute function public.set_updated_at();

create table public.audio_exports (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('instrumental', 'vocals')),
  semitones smallint not null check (semitones between -12 and 12),
  tempo numeric(4, 2) not null check (tempo between 0.5 and 2.0),
  preview boolean not null default false,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  error text,
  audio_file_id uuid references public.audio_files (id) on delete set null,
  queue_job_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index audio_exports_song_idx on public.audio_exports (song_id, created_at desc);
create index audio_exports_user_idx on public.audio_exports (user_id, created_at desc);

create trigger audio_exports_updated before update on public.audio_exports
  for each row execute function public.set_updated_at();

alter table public.recordings
  add column mix_file_id uuid references public.audio_files (id) on delete set null,
  add column status text not null default 'uploaded'
    check (status in ('uploaded', 'mixing', 'ready', 'failed')),
  add column offset_ms integer not null default 0 check (offset_ms between -2000 and 2000),
  add column vocal_gain numeric(3, 2) not null default 1.00 check (vocal_gain between 0 and 2),
  add column backing_gain numeric(3, 2) not null default 0.80 check (backing_gain between 0 and 2),
  add column error text,
  add column queue_job_id text,
  add column updated_at timestamptz not null default now();

create trigger recordings_updated before update on public.recordings
  for each row execute function public.set_updated_at();

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 254),
  message text not null check (char_length(message) between 10 and 5000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now()
);

create index support_requests_status_idx on public.support_requests (status, created_at desc);

alter table public.lyrics enable row level security;
alter table public.audio_exports enable row level security;
alter table public.support_requests enable row level security;

revoke all on public.lyrics, public.audio_exports, public.support_requests from anon, authenticated;

grant select, insert, delete on public.lyrics to authenticated;
grant update (content, synced, offset_ms) on public.lyrics to authenticated;
create policy lyrics_select_own on public.lyrics for select to authenticated
  using (user_id = auth.uid());
create policy lyrics_insert_own on public.lyrics for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.songs s where s.id = song_id and s.user_id = auth.uid())
  );
create policy lyrics_update_own on public.lyrics for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy lyrics_delete_own on public.lyrics for delete to authenticated
  using (user_id = auth.uid());

grant select on public.audio_exports to authenticated;
create policy exports_select_own on public.audio_exports for select to authenticated
  using (user_id = auth.uid());

grant all on public.lyrics, public.audio_exports, public.support_requests to service_role;

create function public.platform_stats()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'songs', (select count(*) from public.songs),
    'jobs_by_status', coalesce(
      (select jsonb_object_agg(status, n) from (
        select status, count(*) as n from public.processing_jobs group by status
      ) t), '{}'::jsonb),
    'avg_processing_seconds', (
      select round(avg(extract(epoch from (finished_at - started_at)))::numeric, 1)
      from public.processing_jobs
      where status = 'completed' and started_at is not null and finished_at is not null
    ),
    'total_processing_seconds', (
      select coalesce(round(sum(extract(epoch from (finished_at - started_at)))::numeric, 0), 0)
      from public.processing_jobs
      where status = 'completed' and started_at is not null and finished_at is not null
    ),
    'storage_bytes', (select coalesce(sum(size_bytes), 0) from public.audio_files),
    'open_copyright_reports', (select count(*) from public.copyright_reports where status = 'open'),
    'open_support_requests', (select count(*) from public.support_requests where status = 'open')
  );
$$;

revoke all on function public.platform_stats() from public, anon, authenticated;
grant execute on function public.platform_stats() to service_role;
