-- Full backup and additive restore of verses and monthly routines.
-- Run after 005. Existing rows are never overwritten.
create or replace function public.study_extra_backup(p_password text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text;
begin
 err:=study_private.check_password(p_password);
 if err is not null then return jsonb_build_object('ok',false,'error',err); end if;
 return jsonb_build_object('ok',true,
  'verses',coalesce((select jsonb_agg(to_jsonb(v)) from public.study_verse_collection v),'[]'::jsonb),
  'preferences',coalesce((select jsonb_agg(to_jsonb(p)) from public.study_verse_preferences p),'[]'::jsonb),
  'settings',coalesce((select jsonb_agg(to_jsonb(s)) from study_private.routine_settings s),'[]'::jsonb),
  'checks',coalesce((select jsonb_agg(to_jsonb(c)) from study_private.routine_checks c),'[]'::jsonb));
end $$;
create or replace function public.study_extra_restore(p_password text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; rec jsonb; n int; total int:=0; d date; f text; k text; pos int;
begin
 err:=study_private.check_password(p_password);
 if err is not null then return jsonb_build_object('ok',false,'error',err); end if;
 if jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(p_data->'verses') is distinct from 'array' or jsonb_typeof(p_data->'preferences') is distinct from 'array' or jsonb_typeof(p_data->'settings') is distinct from 'array' or jsonb_typeof(p_data->'checks') is distinct from 'array' then raise exception '백업 자료를 확인해 주세요.'; end if;
 for rec in select value from jsonb_array_elements(p_data->'verses') loop
  insert into public.study_verse_collection(id,person,reference,verse_text,created_at)
  values ((rec->>'id')::uuid,rec->>'person',coalesce(rec->>'reference',''),rec->>'verse_text',(rec->>'created_at')::timestamptz) on conflict(id) do nothing;
  get diagnostics n = row_count; total:=total+n;
 end loop;
 for rec in select value from jsonb_array_elements(p_data->'preferences') loop
  if rec->>'selected_id' is not null and not exists(select 1 from public.study_verse_collection where id=(rec->>'selected_id')::uuid and person=rec->>'person') then raise exception '성구 선택을 확인해 주세요.'; end if;
  insert into public.study_verse_preferences(person,mode,selected_id) values(rec->>'person',rec->>'mode',(rec->>'selected_id')::uuid) on conflict(person) do nothing;
  get diagnostics n = row_count; total:=total+n;
 end loop;
 for rec in select value from jsonb_array_elements(p_data->'settings') loop
  if length(coalesce(rec->>'monthly_1',''))>500 or length(coalesce(rec->>'monthly_2',''))>500 or length(coalesce(rec->>'weekly_1',''))>500 or length(coalesce(rec->>'weekly_2',''))>500 or length(coalesce(rec->>'month_verse',''))>500 then raise exception '일과 항목이 너무 깁니다.'; end if;
  insert into study_private.routine_settings(person,month,goal,monthly_1,monthly_2,weekly_1,weekly_2,month_verse)
  values(rec->>'person',rec->>'month',(rec->>'goal')::integer,coalesce(rec->>'monthly_1',''),coalesce(rec->>'monthly_2',''),coalesce(rec->>'weekly_1',''),coalesce(rec->>'weekly_2',''),coalesce(rec->>'month_verse','')) on conflict(person,month) do nothing;
  get diagnostics n = row_count; total:=total+n;
 end loop;
 for rec in select value from jsonb_array_elements(p_data->'checks') loop
  if coalesce(rec->>'month','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception '월을 확인해 주세요.'; end if;
  d:=(rec->>'month'||'-01')::date; f:=rec->>'frequency'; k:=rec->>'item'; pos:=(rec->>'position')::int;
  if not coalesce((f='daily' and k in ('prayer','daily_text','bible','ministry','new_content','detox') and pos between 1 and extract(day from (d + interval '1 month - 1 day'))) or (f='weekly' and k in ('personal','family','meeting','watchtower','custom1','custom2') and pos between 1 and 5) or (f='monthly' and k in ('broadcast','report','custom1','custom2') and pos=1),false) then raise exception '일과 체크를 확인해 주세요.'; end if;
  insert into study_private.routine_checks(person,month,frequency,item,position) values(rec->>'person',rec->>'month',f,k,pos) on conflict(person,month,frequency,item,position) do nothing;
  get diagnostics n = row_count; total:=total+n;
 end loop;
 return jsonb_build_object('ok',true,'added',total);
end $$;
revoke all on function public.study_extra_backup(text),public.study_extra_restore(text,jsonb) from public;
grant execute on function public.study_extra_backup(text),public.study_extra_restore(text,jsonb) to anon,authenticated;
notify pgrst, 'reload schema';
