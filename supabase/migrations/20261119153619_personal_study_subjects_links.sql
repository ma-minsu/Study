-- Personal study catalogue overrides and explicit note links. Existing records are not modified.
create table public.study_subject_catalog (
  field text not null check (field in ('traits','history','prophecy')),
  name text not null check (length(btrim(name)) between 1 and 75),
  era text not null default '' check (length(era) <= 100),
  time_label text not null default '' check (length(time_label) <= 100),
  sort_year integer check (sort_year between -9999 and 9999 and sort_year <> 0),
  verse text not null default '' check (length(verse) <= 100),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(field,name)
);
create table public.study_note_subject_links (
  note_id uuid not null references public.study_notes(id) on delete cascade,
  target_key text not null check (length(btrim(target_key)) between 1 and 100),
  created_at timestamptz not null default now(),
  primary key(note_id,target_key)
);
alter table public.study_subject_catalog enable row level security;
alter table public.study_note_subject_links enable row level security;
revoke all on public.study_subject_catalog,public.study_note_subject_links from public,anon,authenticated;
grant select on public.study_subject_catalog,public.study_note_subject_links to anon,authenticated;
create policy "Personal study subjects readable" on public.study_subject_catalog for select to anon,authenticated using (true);
create policy "Personal study links readable" on public.study_note_subject_links for select to anon,authenticated using (true);
create or replace function study_private.personal_subject_catalog_change(p_password text,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; v_field text; v_name text; v_era text; v_time text; v_verse text; v_year integer;
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
  v_year:=nullif(p_data->>'sort_year','')::integer;
  insert into public.study_subject_catalog(field,name,era,time_label,sort_year,verse,hidden) values(v_field,v_name,v_era,v_time,v_year,v_verse,false)
  on conflict(field,name) do update set era=excluded.era,time_label=excluded.time_label,sort_year=excluded.sort_year,verse=excluded.verse,hidden=false,updated_at=now();
 end if;
 return jsonb_build_object('ok',true);
end $$;
create or replace function study_private.personal_note_subject_links_save(p_password text,p_note uuid,p_targets jsonb,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; current_targets jsonb; expected_targets jsonb;
begin
 err:=study_private.check_password(p_password); if err is not null then return jsonb_build_object('ok',false,'error',err); end if;
 if jsonb_typeof(p_targets) is distinct from 'array' or jsonb_typeof(p_expected) is distinct from 'array' then return jsonb_build_object('ok',false,'error','연결을 확인해 주세요.');end if;
 if jsonb_array_length(p_targets)>100 or jsonb_array_length(p_expected)>100 then return jsonb_build_object('ok',false,'error','연결은 최대 100개입니다.');end if;
 if exists(select 1 from jsonb_array_elements(p_targets) x where jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 1 and 100) or exists(select 1 from jsonb_array_elements(p_expected) x where jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 1 and 100) then return jsonb_build_object('ok',false,'error','연결을 확인해 주세요.');end if;
 if (select count(*)<>count(distinct x#>>'{}') from jsonb_array_elements(p_targets) x) then return jsonb_build_object('ok',false,'error','같은 연결을 두 번 선택할 수 없습니다.');end if;
 perform 1 from public.study_notes n where n.id=p_note and n.person not like '@family-session:%' and n.person not like '@family-photo:%' for update;
 if not found then return jsonb_build_object('ok',false,'error','연구 기록을 찾을 수 없습니다.');end if;
 select coalesce(jsonb_agg(target_key order by target_key),'[]'::jsonb) into current_targets from public.study_note_subject_links where note_id=p_note;
 select coalesce(jsonb_agg(x#>>'{}' order by x#>>'{}'),'[]'::jsonb) into expected_targets from jsonb_array_elements(p_expected) x;
 if current_targets<>expected_targets then return jsonb_build_object('ok',false,'conflict',true,'error','다른 기기에서 연결이 바뀌었어요. 다시 열어 확인해 주세요.');end if;
 delete from public.study_note_subject_links where note_id=p_note;
 insert into public.study_note_subject_links(note_id,target_key) select p_note,x#>>'{}' from jsonb_array_elements(p_targets) x;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function study_private.personal_subject_catalog_change(text,text,jsonb),study_private.personal_note_subject_links_save(text,uuid,jsonb,jsonb) from public;
grant usage on schema study_private to anon,authenticated;
grant execute on function study_private.personal_subject_catalog_change(text,text,jsonb),study_private.personal_note_subject_links_save(text,uuid,jsonb,jsonb) to anon,authenticated;
create function public.study_subject_catalog_change(p_password text,p_action text,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select study_private.personal_subject_catalog_change(p_password,p_action,p_data) $$;
create function public.study_note_subject_links_save(p_password text,p_note uuid,p_targets jsonb,p_expected jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select study_private.personal_note_subject_links_save(p_password,p_note,p_targets,p_expected) $$;
revoke all on function public.study_subject_catalog_change(text,text,jsonb),public.study_note_subject_links_save(text,uuid,jsonb,jsonb) from public;
grant execute on function public.study_subject_catalog_change(text,text,jsonb),public.study_note_subject_links_save(text,uuid,jsonb,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
