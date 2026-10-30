-- Monthly ministry reports. Run after the existing study migrations.
create table if not exists study_private.ministry_reports (
 person text not null check(person in ('mine','bora')),
 month text not null check(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 hours jsonb not null default '{}'::jsonb check(jsonb_typeof(hours)='object'),
 studies integer check(studies between 0 and 9999),
 revision bigint not null default 0,
 primary key(person,month)
);
revoke all on study_private.ministry_reports from public, anon, authenticated;
create or replace function public.study_ministry_read(p_password text,p_person text,p_month text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; item study_private.ministry_reports%rowtype;
begin
 err:=study_private.check_password(p_password); if err is not null then return jsonb_build_object('ok',false,'error',err); end if;
 if p_person is null or p_person not in ('mine','bora') or p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then return jsonb_build_object('ok',false,'error','입력값을 확인해 주세요.'); end if;
 select * into item from study_private.ministry_reports where person=p_person and month=p_month;
 return jsonb_build_object('ok',true,'hours',coalesce(item.hours,'{}'::jsonb),'studies',item.studies,'revision',coalesce(item.revision,0));
end $$;
create or replace function public.study_ministry_write(p_password text,p_person text,p_month text,p_revision bigint,p_action text,p_day integer,p_value integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; next_revision bigint; last_day integer;
begin
 err:=study_private.check_password(p_password); if err is not null then return jsonb_build_object('ok',false,'error',err); end if;
 if p_person is null or p_person not in ('mine','bora') or p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_revision is null or p_revision<0 then return jsonb_build_object('ok',false,'error','입력값을 확인해 주세요.'); end if;
 if substring(p_month,1,4)::integer not between 1900 and 9998 then return jsonb_build_object('ok',false,'error','연도를 확인해 주세요.'); end if;
 if p_action='hours' then
  last_day:=extract(day from (to_date(p_month||'-01','YYYY-MM-DD')+interval '1 month - 1 day'))::integer;
  if p_day is null or p_day not between 1 and last_day or p_value is null or p_value not between 0 and 24 then return jsonb_build_object('ok',false,'error','시간을 확인해 주세요.'); end if;
 elsif p_action='studies' then
  if p_value is not null and (p_value<0 or p_value>9999) then return jsonb_build_object('ok',false,'error','연구 건수를 확인해 주세요.'); end if;
 else return jsonb_build_object('ok',false,'error','요청을 확인해 주세요.'); end if;
 insert into study_private.ministry_reports(person,month) values(p_person,p_month) on conflict do nothing;
 update study_private.ministry_reports set
  hours=case when p_action<>'hours' then hours when p_value=0 then hours-(p_day::text) else jsonb_set(hours, array[p_day::text],to_jsonb(p_value),true) end,
  studies=case when p_action='studies' then p_value else studies end,
  revision=revision+1
 where person=p_person and month=p_month and revision=p_revision returning revision into next_revision;
 if next_revision is null then return jsonb_build_object('ok',false,'conflict',true,'error','다른 기기에서 기록이 바뀌었어요. 다시 불러온 뒤 확인해 주세요.'); end if;
 return jsonb_build_object('ok',true,'revision',next_revision);
end $$;
revoke all on function public.study_ministry_read(text,text,text), public.study_ministry_write(text,text,text,bigint,text,integer,integer) from public;
grant execute on function public.study_ministry_read(text,text,text), public.study_ministry_write(text,text,text,bigint,text,integer,integer) to anon,authenticated;
notify pgrst,'reload schema';

-- Include ministry reports in the existing downloadable backup, with additive restore.
create or replace function public.study_ministry_backup(p_password text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text;
begin
 err:=study_private.check_password(p_password);if err is not null then return jsonb_build_object('ok',false,'error',err);end if;
 return jsonb_build_object('ok',true,'reports',coalesce((select jsonb_agg(jsonb_build_object('person',person,'month',month,'hours',hours,'studies',studies)) from study_private.ministry_reports),'[]'::jsonb));
end $$;
create or replace function public.study_ministry_restore(p_password text,p_reports jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; rec jsonb; k text; v jsonb; last_day integer; n integer; total integer:=0; count_studies integer;
begin
 err:=study_private.check_password(p_password);if err is not null then return jsonb_build_object('ok',false,'error',err);end if;
 if jsonb_typeof(p_reports) is distinct from 'array' or jsonb_array_length(p_reports)>10000 then raise exception '봉사 보고 백업을 확인해 주세요.';end if;
 for rec in select value from jsonb_array_elements(p_reports) loop
  if coalesce(rec->>'person','') not in ('mine','bora') or coalesce(rec->>'month','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or substring(rec->>'month',1,4)::integer not between 1900 and 9998 or jsonb_typeof(rec->'hours') is distinct from 'object' then raise exception '봉사 보고 백업을 확인해 주세요.';end if;
  last_day:=extract(day from (to_date((rec->>'month')||'-01','YYYY-MM-DD')+interval '1 month - 1 day'))::integer;
  for k,v in select key,value from jsonb_each(rec->'hours') loop
   if k !~ '^([1-9]|[12][0-9]|3[01])$' or k::integer>last_day or jsonb_typeof(v) is distinct from 'number' or v::text !~ '^([1-9]|1[0-9]|2[0-4])$' then raise exception '봉사 시간을 확인해 주세요.';end if;
  end loop;
  if rec->'studies' is null or rec->'studies'='null'::jsonb then count_studies:=null;
  elsif jsonb_typeof(rec->'studies')='number' and (rec->>'studies') ~ '^(0|[1-9][0-9]{0,3})$' then count_studies:=(rec->>'studies')::integer;
  else raise exception '연구 건수를 확인해 주세요.';end if;
  insert into study_private.ministry_reports(person,month,hours,studies) values(rec->>'person',rec->>'month',rec->'hours',count_studies) on conflict(person,month) do nothing;
  get diagnostics n=row_count;total:=total+n;
 end loop;
 return jsonb_build_object('ok',true,'added',total);
end $$;
revoke all on function public.study_ministry_backup(text), public.study_ministry_restore(text,jsonb) from public;
grant execute on function public.study_ministry_backup(text), public.study_ministry_restore(text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
