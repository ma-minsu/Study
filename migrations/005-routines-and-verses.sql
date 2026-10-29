-- Adds a favorite-verse collection and password-protected monthly routines.
-- Existing study notes, images, and settings remain intact.
create table if not exists public.study_verse_collection (
 id uuid primary key default gen_random_uuid(),
 person text not null check(person in ('mine','bora')),
 reference text not null default '' check(length(reference)<=200),
 verse_text text not null check(length(verse_text) between 1 and 2000),
 created_at timestamptz not null default now()
);
create table if not exists public.study_verse_preferences (
 person text primary key check(person in ('mine','bora')),
 mode text not null default 'manual' check(mode in ('manual','auto')),
 selected_id uuid references public.study_verse_collection(id) on delete set null
);
alter table public.study_verse_collection enable row level security;
alter table public.study_verse_preferences enable row level security;
grant select on public.study_verse_collection,public.study_verse_preferences to anon,authenticated;
revoke insert,update,delete on public.study_verse_collection,public.study_verse_preferences from anon,authenticated;
drop policy if exists "Public can read verse collection" on public.study_verse_collection;
create policy "Public can read verse collection" on public.study_verse_collection for select to anon,authenticated using (true);
drop policy if exists "Public can read verse preferences" on public.study_verse_preferences;
create policy "Public can read verse preferences" on public.study_verse_preferences for select to anon,authenticated using (true);
create or replace function public.study_verse_change(p_password text,p_person text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; verse_id uuid; reference_text text; body_text text; new_mode text;
begin
 err:=study_private.check_password(p_password);if err is not null then return jsonb_build_object('ok',false,'error',err);end if;
 if p_person not in ('mine','bora') then raise exception '이름을 확인해 주세요.';end if;
 if p_action in ('create','update') then
  reference_text:=trim(coalesce(p_data->>'reference',''));body_text:=trim(coalesce(p_data->>'verse_text',''));
  if length(reference_text)>200 or length(body_text)<1 or length(body_text)>2000 then raise exception '성구 내용을 확인해 주세요.';end if;
  if p_action='create' then
   insert into public.study_verse_collection(person,reference,verse_text) values(p_person,reference_text,body_text) returning id into verse_id;
   insert into public.study_verse_preferences(person,mode,selected_id) values(p_person,'manual',verse_id) on conflict(person) do update set selected_id=coalesce(study_verse_preferences.selected_id,excluded.selected_id);
  else
   verse_id:=(p_data->>'id')::uuid;update public.study_verse_collection set reference=reference_text,verse_text=body_text where id=verse_id and person=p_person;
   if not found then raise exception '성구를 찾을 수 없습니다.';end if;
  end if;
 elsif p_action='choose' then
  verse_id:=(p_data->>'id')::uuid;if not exists(select 1 from public.study_verse_collection where id=verse_id and person=p_person) then raise exception '성구를 찾을 수 없습니다.';end if;
  insert into public.study_verse_preferences(person,mode,selected_id) values(p_person,'manual',verse_id) on conflict(person) do update set mode='manual',selected_id=excluded.selected_id;
 elsif p_action='mode' then
  new_mode:=p_data->>'mode';if new_mode not in ('manual','auto') then raise exception '표시 방식을 확인해 주세요.';end if;
  insert into public.study_verse_preferences(person,mode) values(p_person,new_mode) on conflict(person) do update set mode=excluded.mode;
 elsif p_action='delete' then
  verse_id:=(p_data->>'id')::uuid;delete from public.study_verse_collection where id=verse_id and person=p_person;if not found then raise exception '성구를 찾을 수 없습니다.';end if;
 else raise exception '요청을 확인해 주세요.';end if;
 return jsonb_build_object('ok',true,'id',verse_id);
end $$;
revoke all on function public.study_verse_change(text,text,text,jsonb) from public;
grant execute on function public.study_verse_change(text,text,text,jsonb) to anon,authenticated;
create table if not exists study_private.routine_settings (
 person text not null check(person in ('mine','bora')),
 month text not null check(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 goal integer check(goal between 0 and 1000),
 monthly_1 text not null default '',monthly_2 text not null default '',
 weekly_1 text not null default '',weekly_2 text not null default '',
 month_verse text not null default '',
 primary key(person,month)
);
create table if not exists study_private.routine_checks (
 person text not null check(person in ('mine','bora')),
 month text not null check(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 frequency text not null check(frequency in ('daily','weekly','monthly')),
 item text not null,position integer not null,
 primary key(person,month,frequency,item,position)
);
create or replace function public.study_routine_read(p_password text,p_month text) returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; s jsonb; c jsonb;
begin
 err:=study_private.check_password(p_password);if err is not null then return jsonb_build_object('ok',false,'error',err);end if;
 if p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception '월을 확인해 주세요.';end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into s from study_private.routine_settings t where month=p_month;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into c from study_private.routine_checks t where month=p_month;
 return jsonb_build_object('ok',true,'settings',s,'checks',c);
end $$;
create or replace function public.study_routine_write(p_password text,p_person text,p_month text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; freq text; item_key text; pos integer; checked boolean; field_key text; value_text text; target integer; n_days integer;
begin
 err:=study_private.check_password(p_password);if err is not null then return jsonb_build_object('ok',false,'error',err);end if;
 if p_person not in ('mine','bora') or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception '이름과 월을 확인해 주세요.';end if;
 if p_action='check' then
  freq:=p_data->>'frequency';item_key:=p_data->>'item';pos:=(p_data->>'position')::integer;checked:=(p_data->>'checked')::boolean;
  n_days:=extract(day from ((p_month||'-01')::date + interval '1 month - 1 day'))::integer;
  if checked is null or not ((freq='daily' and item_key in ('prayer','daily_text','bible','ministry','new_content','detox') and pos between 1 and n_days) or (freq='weekly' and item_key in ('personal','family','meeting','watchtower','custom1','custom2') and pos between 1 and 5) or (freq='monthly' and item_key in ('broadcast','report','custom1','custom2') and pos=1)) then raise exception '항목을 확인해 주세요.';end if;
  if checked then insert into study_private.routine_checks(person,month,frequency,item,position) values(p_person,p_month,freq,item_key,pos) on conflict do nothing;
  else delete from study_private.routine_checks where person=p_person and month=p_month and frequency=freq and item=item_key and position=pos;end if;
 elsif p_action='setting' then
  field_key:=p_data->>'field'; value_text:=trim(coalesce(p_data->>'value',''));
  if field_key not in ('monthly_1','monthly_2','weekly_1','weekly_2','month_verse') or length(value_text)>500 then raise exception '항목을 확인해 주세요.';end if;
  if value_text='' and field_key <> 'month_verse' and exists(select 1 from study_private.routine_checks where person=p_person and month=p_month and frequency=split_part(field_key,'_',1) and item='custom'||split_part(field_key,'_',2)) then
   raise exception '체크 기록이 있어 항목을 비울 수 없습니다. 먼저 체크를 해제해 주세요.';
  end if;
  insert into study_private.routine_settings(person,month) values(p_person,p_month) on conflict do nothing;
  if field_key='monthly_1' then update study_private.routine_settings set monthly_1=value_text where person=p_person and month=p_month;
  elsif field_key='monthly_2' then update study_private.routine_settings set monthly_2=value_text where person=p_person and month=p_month;
  elsif field_key='weekly_1' then update study_private.routine_settings set weekly_1=value_text where person=p_person and month=p_month;
  elsif field_key='weekly_2' then update study_private.routine_settings set weekly_2=value_text where person=p_person and month=p_month;
  else update study_private.routine_settings set month_verse=value_text where person=p_person and month=p_month;end if;
 elsif p_action='goal' then
  target:=(p_data->>'value')::integer;if target is null or target<0 or target>1000 then raise exception '목표 점수를 확인해 주세요.';end if;
  insert into study_private.routine_settings(person,month,goal) values(p_person,p_month,target) on conflict(person,month) do update set goal=excluded.goal;
 else raise exception '요청을 확인해 주세요.';end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.study_routine_read(text,text), public.study_routine_write(text,text,text,text,jsonb) from public;
grant execute on function public.study_routine_read(text,text), public.study_routine_write(text,text,text,text,jsonb) to anon,authenticated;
notify pgrst, 'reload schema';
