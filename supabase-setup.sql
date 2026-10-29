create table if not exists public.study_notes (
  id uuid primary key default gen_random_uuid(),
  person text not null check (char_length(person) between 1 and 100),
  author text not null check (author in ('mine', 'bora')),
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 20000),
  images text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.study_notes enable row level security;
grant select, insert on public.study_notes to anon, authenticated;
create policy "Public can read notes" on public.study_notes for select to anon, authenticated using (true);
create policy "Public can add notes" on public.study_notes for insert to anon, authenticated with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-images', 'study-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "Public can read study images" on storage.objects for select to anon, authenticated using (bucket_id = 'study-images');
create policy "Public can upload study images" on storage.objects for insert to anon, authenticated with check (bucket_id = 'study-images');
