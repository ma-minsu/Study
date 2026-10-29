-- Run this once in the Supabase SQL Editor. Set the password separately as instructed.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists study_private;
revoke all on schema study_private from public, anon, authenticated;
create table if not exists study_private.settings (id boolean primary key default true check(id), password_hash text not null);
create or replace function study_private.set_study_password(p_password text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if length(p_password) < 4 then raise exception 'Password must have at least 4 characters'; end if;
  insert into study_private.settings(id,password_hash) values (true, extensions.crypt(p_password, extensions.gen_salt('bf')))
  on conflict(id) do update set password_hash = excluded.password_hash;
end $$;
revoke all on function study_private.set_study_password(text) from public, anon, authenticated;
create table if not exists public.study_notes (
  id uuid primary key default gen_random_uuid(),
  person text not null check (char_length(person) between 1 and 100),
  author text not null check (author in ('mine', 'bora')),
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 20000),
  created_at timestamptz not null default now()
);
create table if not exists public.study_images (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.study_notes(id) on delete cascade,
  data_url text not null check (length(data_url) <= 7000000 and data_url ~ '^data:image/(jpeg|png|webp|gif);base64,')
);
alter table public.study_notes enable row level security;
alter table public.study_images enable row level security;
grant select on public.study_notes, public.study_images to anon, authenticated;
drop policy if exists "Public can read notes" on public.study_notes;
create policy "Public can read notes" on public.study_notes for select to anon, authenticated using (true);
drop policy if exists "Public can add notes" on public.study_notes;
drop policy if exists "Public can upload study images" on storage.objects;
drop policy if exists "Public can read images" on public.study_images;
create policy "Public can read images" on public.study_images for select to anon, authenticated using (true);
revoke insert, update, delete on public.study_notes, public.study_images from anon, authenticated;
create or replace function public.add_study_note(p_password text, p_person text, p_author text, p_title text, p_body text, p_images jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid; img jsonb; saved_hash text;
begin
  select password_hash into saved_hash from study_private.settings where id = true;
  if saved_hash is null or p_password is null or saved_hash <> extensions.crypt(p_password, saved_hash) then
    raise exception 'Incorrect password' using errcode = '28000';
  end if;
  if jsonb_typeof(p_images) <> 'array' or jsonb_array_length(p_images) > 3 then raise exception 'Invalid images'; end if;
  insert into public.study_notes(person,author,title,body) values (p_person,p_author,p_title,p_body) returning id into new_id;
  for img in select * from jsonb_array_elements(p_images) loop
    insert into public.study_images(note_id,data_url) values (new_id, img #>> '{}');
  end loop;
  return new_id;
end $$;
revoke all on function public.add_study_note(text,text,text,text,text,jsonb) from public;
grant execute on function public.add_study_note(text,text,text,text,text,jsonb) to anon, authenticated;
