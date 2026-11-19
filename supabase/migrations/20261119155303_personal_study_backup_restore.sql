-- Restore personal study catalog and remapped links additively, within one transaction.
create or replace function study_private.personal_study_restore(p_password text,p_subjects jsonb,p_links jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; item jsonb; v_year integer; v_hidden boolean; v_note uuid; subject_count integer:=0; link_count integer:=0; n integer;
begin
 err:=study_private.check_password(p_password);if err is not null then return jsonb_build_object('ok',false,'error',err);end if;
 if jsonb_typeof(p_subjects) is distinct from 'array' or jsonb_typeof(p_links) is distinct from 'array' then raise exception '개인 연구 백업을 확인해 주세요.';end if;
 if jsonb_array_length(p_subjects)>10000 or jsonb_array_length(p_links)>100000 then raise exception '개인 연구 백업이 너무 큽니다.';end if;
 for item in select value from jsonb_array_elements(p_subjects) loop
  if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'field','') not in ('traits','history','prophecy') or jsonb_typeof(item->'name') is distinct from 'string' or length(btrim(item->>'name')) not between 1 and 75 or (item->>'name')<>btrim(item->>'name') or length(coalesce(item->>'era',''))>100 or length(coalesce(item->>'time_label',''))>100 or length(coalesce(item->>'verse',''))>100 or (item ? 'hidden' and jsonb_typeof(item->'hidden') is distinct from 'boolean') or coalesce(item->>'sort_year','') !~ '^(-?[1-9][0-9]{0,3})?$' then raise exception '개인 연구 항목을 확인해 주세요.';end if;
  if (item ? 'created_at' and jsonb_typeof(item->'created_at') not in ('string','null')) or (item ? 'updated_at' and jsonb_typeof(item->'updated_at') not in ('string','null')) then raise exception '항목 날짜를 확인해 주세요.';end if;
  v_year:=nullif(item->>'sort_year','')::integer;v_hidden:=coalesce((item->>'hidden')::boolean,false);
  insert into public.study_subject_catalog(field,name,era,time_label,sort_year,verse,hidden,created_at,updated_at)
  values(item->>'field',item->>'name',coalesce(item->>'era',''),coalesce(item->>'time_label',''),v_year,coalesce(item->>'verse',''),v_hidden,coalesce((item->>'created_at')::timestamptz,now()),coalesce((item->>'updated_at')::timestamptz,now())) on conflict(field,name) do nothing;
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
revoke all on function study_private.personal_study_restore(text,jsonb,jsonb) from public;
grant execute on function study_private.personal_study_restore(text,jsonb,jsonb) to anon,authenticated;
create function public.study_personal_study_restore(p_password text,p_subjects jsonb,p_links jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select study_private.personal_study_restore(p_password,p_subjects,p_links) $$;
revoke all on function public.study_personal_study_restore(text,jsonb,jsonb) from public;
grant execute on function public.study_personal_study_restore(text,jsonb,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
