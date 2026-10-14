alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.songs enable row level security;
alter table public.audio_files enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.recordings enable row level security;
alter table public.usage_records enable row level security;
alter table public.audit_events enable row level security;
alter table public.copyright_reports enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

grant select on public.plans to anon, authenticated;
create policy plans_read on public.plans for select to anon, authenticated using (true);

grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

grant select on public.user_preferences to authenticated;
grant update (default_volume, show_lyrics) on public.user_preferences to authenticated;
create policy preferences_select_own on public.user_preferences for select to authenticated
  using (user_id = auth.uid());
create policy preferences_update_own on public.user_preferences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, delete on public.songs to authenticated;
grant insert (user_id, title, artist, original_filename, rights_confirmed_at) on public.songs to authenticated;
grant update (title, artist, is_favorite) on public.songs to authenticated;
create policy songs_select_own on public.songs for select to authenticated
  using (user_id = auth.uid());
create policy songs_insert_own on public.songs for insert to authenticated
  with check (user_id = auth.uid());
create policy songs_update_own on public.songs for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy songs_delete_own on public.songs for delete to authenticated
  using (user_id = auth.uid());

grant select on public.audio_files to authenticated;
create policy audio_files_select_own on public.audio_files for select to authenticated
  using (user_id = auth.uid());

grant select on public.processing_jobs to authenticated;
create policy jobs_select_own on public.processing_jobs for select to authenticated
  using (user_id = auth.uid());

grant select, delete on public.recordings to authenticated;
create policy recordings_select_own on public.recordings for select to authenticated
  using (user_id = auth.uid());
create policy recordings_delete_own on public.recordings for delete to authenticated
  using (user_id = auth.uid());

grant select on public.usage_records to authenticated;
create policy usage_select_own on public.usage_records for select to authenticated
  using (user_id = auth.uid());

grant execute on function public.current_period_start() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.set_updated_at() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('originals', 'originals', false, 209715200),
  ('stems', 'stems', false, 524288000),
  ('recordings', 'recordings', false, 209715200)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy originals_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'originals' and (storage.foldername(name))[1] = auth.uid()::text);
create policy originals_select_own on storage.objects for select to authenticated
  using (bucket_id = 'originals' and (storage.foldername(name))[1] = auth.uid()::text);
create policy originals_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'originals' and (storage.foldername(name))[1] = auth.uid()::text);

create policy stems_select_own on storage.objects for select to authenticated
  using (bucket_id = 'stems' and (storage.foldername(name))[1] = auth.uid()::text);
create policy stems_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'stems' and (storage.foldername(name))[1] = auth.uid()::text);

create policy recordings_obj_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
create policy recordings_obj_select_own on storage.objects for select to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
create policy recordings_obj_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
