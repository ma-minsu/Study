alter table public.study_subject_catalog add column display_name text not null default '' check (length(display_name)<=75);
create or replace function study_private.personal_subject_catalog_change(p_password text,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; v_field text; v_name text; v_era text; v_time text; v_verse text; v_year integer; v_display text;
begin
 err:=study_private.check_password(p_password); if err is not null then return jsonb_build_object('ok',false,'error',err); end if;
 v_field:=coalesce(p_data->>'field','');v_name:=btrim(coalesce(p_data->>'name',''));
 if coalesce(p_action,'') not in ('save','hide') or v_field not in ('traits','history','prophecy') or length(v_name) not between 1 and 75 then return jsonb_build_object('ok',false,'error','항목을 확인해 주세요.');end if;
 if p_action='hide' then
  insert into public.study_subject_catalog(field,name,hidden) values(v_field,v_name,true)
  on conflict(field,name) do update set hidden=true,updated_at=now();
 else
  v_era:=btrim(coalesce(p_data->>'era',''));v_time:=btrim(coalesce(p_data->>'time_label',''));v_verse:=btrim(coalesce(p_data->>'verse',''));
  if length(v_era)>100 or length(v_time)>100 or length(v_verse)>100 or coalesce(p_data->>'sort_year','') !~ '^(-?[1-9][0-9]{0,3})?$' then return jsonb_build_object('ok',false,'error','시기 또는 성구를 확인해 주세요.');end if;
  v_year:=nullif(p_data->>'sort_year','')::integer; v_display:=btrim(coalesce(p_data->>'display_name','')); if length(v_display)>75 then return jsonb_build_object('ok',false,'error','이름을 확인해 주세요.');end if;
  insert into public.study_subject_catalog(field,name,era,time_label,sort_year,verse,display_name,hidden) values(v_field,v_name,v_era,v_time,v_year,v_verse,v_display,false)
  on conflict(field,name) do update set era=excluded.era,time_label=excluded.time_label,sort_year=excluded.sort_year,verse=excluded.verse,display_name=case when p_data ? 'display_name' then excluded.display_name else study_subject_catalog.display_name end,hidden=false,updated_at=now();
 end if;
 return jsonb_build_object('ok',true);
end $$;

create or replace function study_private.personal_study_restore(p_password text,p_subjects jsonb,p_links jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; item jsonb; v_year integer; v_hidden boolean; v_note uuid; subject_count integer:=0; link_count integer:=0; n integer;
begin
 err:=study_private.check_password(p_password);if err is not null then return jsonb_build_object('ok',false,'error',err);end if;
 if jsonb_typeof(p_subjects) is distinct from 'array' or jsonb_typeof(p_links) is distinct from 'array' then raise exception '개인 연구 백업을 확인해 주세요.';end if;
 if jsonb_array_length(p_subjects)>10000 or jsonb_array_length(p_links)>100000 then raise exception '개인 연구 백업이 너무 큽니다.';end if;
 for item in select value from jsonb_array_elements(p_subjects) loop
  if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'field','') not in ('traits','history','prophecy') or jsonb_typeof(item->'name') is distinct from 'string' or length(btrim(item->>'name')) not between 1 and 75 or (item->>'name')<>btrim(item->>'name') or length(coalesce(item->>'era',''))>100 or length(coalesce(item->>'time_label',''))>100 or length(coalesce(item->>'verse',''))>100 or length(coalesce(item->>'display_name',''))>75 or (item ? 'hidden' and jsonb_typeof(item->'hidden') is distinct from 'boolean') or coalesce(item->>'sort_year','') !~ '^(-?[1-9][0-9]{0,3})?$' then raise exception '개인 연구 항목을 확인해 주세요.';end if;
  if (item ? 'created_at' and jsonb_typeof(item->'created_at') not in ('string','null')) or (item ? 'updated_at' and jsonb_typeof(item->'updated_at') not in ('string','null')) then raise exception '항목 날짜를 확인해 주세요.';end if;
  v_year:=nullif(item->>'sort_year','')::integer;v_hidden:=coalesce((item->>'hidden')::boolean,false);
  insert into public.study_subject_catalog(field,name,era,time_label,sort_year,verse,display_name,hidden,created_at,updated_at)
  values(item->>'field',item->>'name',coalesce(item->>'era',''),coalesce(item->>'time_label',''),v_year,coalesce(item->>'verse',''),coalesce(item->>'display_name',''),v_hidden,coalesce((item->>'created_at')::timestamptz,now()),coalesce((item->>'updated_at')::timestamptz,now())) on conflict(field,name) do nothing;
  get diagnostics n=row_count;subject_count:=subject_count+n;
 end loop;
 for item in select value from jsonb_array_elements(p_links) loop
  if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'note_id') is distinct from 'string' or coalesce(item->>'note_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or jsonb_typeof(item->'target_key') is distinct from 'string' or length(btrim(item->>'target_key')) not between 1 and 100 then raise exception '연구 연결을 확인해 주세요.';end if;
  v_note:=(item->>'note_id')::uuid;
  if not exists(select 1 from public.study_notes where id=v_note and person not like '@family-session:%' and person not like '@family-photo:%') then raise exception '연결할 연구 기록을 찾을 수 없습니다.';end if;
  insert into public.study_note_subject_links(note_id,target_key) values(v_note,item->>'target_key') on conflict(note_id,target_key) do nothing;
  get diagnostics n=row_count;link_count:=link_count+n;
 end loop;
 return jsonb_build_object('ok',true,'subjects_added',subject_count,'links_added',link_count);
end $$;

notify pgrst,'reload schema';
