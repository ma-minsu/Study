-- Existing notes and images are preserved. Run once in the Supabase SQL editor.
alter table public.study_notes add column if not exists verse text not null default '';
alter table public.study_notes add column if not exists book text not null default '';
alter table public.study_notes add column if not exists topic text not null default '';
alter table public.study_notes add column if not exists reference_url text not null default '';
alter table public.study_notes add column if not exists updated_at timestamptz;
create table if not exists public.study_people (id uuid primary key default gen_random_uuid(), name text not null unique check (char_length(name) between 1 and 100), era text not null check (char_length(era) between 1 and 100), search_term text not null default '', created_at timestamptz not null default now());
alter table public.study_people enable row level security;
grant select on public.study_people to anon, authenticated;
drop policy if exists "Public can read people" on public.study_people;
create policy "Public can read people" on public.study_people for select to anon, authenticated using (true);
revoke insert, update, delete on public.study_people from anon, authenticated;
create table if not exists study_private.attempts (id boolean primary key default true check(id), failures integer not null default 0, locked_until timestamptz);
insert into study_private.attempts(id) values(true) on conflict(id) do nothing;
create or replace function study_private.set_study_password(p_password text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if length(p_password) < 8 then raise exception 'Password must have at least 8 characters'; end if;
  insert into study_private.settings(id,password_hash) values(true,extensions.crypt(p_password,extensions.gen_salt('bf'))) on conflict(id) do update set password_hash=excluded.password_hash;
  update study_private.attempts set failures=0,locked_until=null where id=true;
end $$;
revoke all on function study_private.set_study_password(text) from public, anon, authenticated;
create or replace function study_private.check_password(p_password text) returns text language plpgsql security definer set search_path = '' as $$
declare a study_private.attempts%rowtype; h text;
begin
  select * into a from study_private.attempts where id=true for update;
  if a.locked_until is not null and a.locked_until > now() then return '잠시 후 다시 시도해 주세요.'; end if;
  if a.locked_until is not null then update study_private.attempts set failures=0,locked_until=null where id=true; a.failures:=0; end if;
  select password_hash into h from study_private.settings where id=true;
  if h is null or p_password is null or h <> extensions.crypt(p_password,h) then
    update study_private.attempts set failures=a.failures+1, locked_until=case when a.failures+1>=8 then now()+interval '10 minutes' else null end where id=true;
    return '비밀번호가 맞지 않습니다.';
  end if;
  update study_private.attempts set failures=0,locked_until=null where id=true;
  return null;
end $$;
revoke all on function study_private.check_password(text) from public, anon, authenticated;
-- Disable the original write API so it cannot bypass attempt limits.
revoke execute on function public.add_study_note(text,text,text,text,text,jsonb) from public, anon, authenticated;
create or replace function public.study_change(p_password text, p_action text, p_data jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare err text; note_id uuid; img jsonb; imgs jsonb; u text;
begin
  err:=study_private.check_password(p_password);
  if err is not null then return jsonb_build_object('ok',false,'error',err); end if;
  if p_action='person' then
    insert into public.study_people(name,era,search_term) values (btrim(p_data->>'name'),btrim(p_data->>'era'),left(coalesce(p_data->>'search_term',''),200));
  elsif p_action in ('create','update','restore') then
    if length(coalesce(p_data->>'verse',''))>300 or length(coalesce(p_data->>'topic',''))>300 or length(coalesce(p_data->>'book',''))>100 or length(coalesce(p_data->>'reference_url',''))>2000 then raise exception '입력 길이를 확인해 주세요.'; end if;
    u:=coalesce(p_data->>'reference_url',''); if u<>'' and u !~ '^https?://' then raise exception '자료 링크는 http 또는 https 주소여야 합니다.'; end if;
    imgs:=coalesce(p_data->'images','[]'::jsonb);
    if jsonb_typeof(imgs)<>'array' or jsonb_array_length(imgs)>3 then raise exception '이미지는 최대 3장입니다.'; end if;
    if p_action in ('create','restore') then
      insert into public.study_notes(person,author,title,body,verse,book,topic,reference_url,created_at) values (btrim(p_data->>'person'),p_data->>'author',btrim(p_data->>'title'),btrim(p_data->>'body'),coalesce(p_data->>'verse',''),coalesce(p_data->>'book',''),coalesce(p_data->>'topic',''),u,case when p_action='restore' then coalesce((p_data->>'created_at')::timestamptz,now()) else now() end) returning id into note_id;
    else
      note_id:=(p_data->>'id')::uuid;
      update public.study_notes set author=p_data->>'author',title=btrim(p_data->>'title'),body=btrim(p_data->>'body'),verse=coalesce(p_data->>'verse',''),book=coalesce(p_data->>'book',''),topic=coalesce(p_data->>'topic',''),reference_url=u,updated_at=now() where id=note_id;
      if not found then raise exception '기록을 찾을 수 없습니다.'; end if;
      if coalesce((p_data->>'replace_images')::boolean,false) then delete from public.study_images where study_images.note_id=note_id; else imgs:='[]'::jsonb; end if;
    end if;
    for img in select * from jsonb_array_elements(imgs) loop insert into public.study_images(note_id,data_url) values(note_id,img #>> '{}'); end loop;
  elsif p_action='delete' then
    delete from public.study_notes where id=(p_data->>'id')::uuid;
    if not found then raise exception '기록을 찾을 수 없습니다.'; end if;
  else raise exception '지원하지 않는 요청입니다.';
  end if;
  return jsonb_build_object('ok',true,'id',note_id);
end $$;
revoke all on function public.study_change(text,text,jsonb) from public;
grant execute on function public.study_change(text,text,jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
