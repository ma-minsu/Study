-- Additional references live beside legacy fields so old clients and backups stay readable.
alter table public.study_notes add column if not exists note_references jsonb;
alter table public.study_notes add constraint study_notes_references_shape check (note_references is null or (jsonb_typeof(note_references)='object' and jsonb_typeof(note_references->'verses')='array' and jsonb_typeof(note_references->'resources')='array' and pg_column_size(note_references)<=100000));

-- A legacy client may change the first verse or URL. Preserve remaining entries.
create or replace function study_private.sync_legacy_note_references() returns trigger
language plpgsql set search_path='' as $$
declare vs jsonb; rs jsonb; first_resource jsonb;
begin
 if old.note_references is null or current_setting('study.note_refs_v3',true)='1' then return new; end if;
 if new.verse is distinct from old.verse then
  vs:=old.note_references->'verses';
  if jsonb_array_length(vs)>0 then vs:=vs-0; end if;
  if coalesce(new.verse,'')<>'' then vs:=jsonb_build_array(new.verse)||vs; end if;
  new.note_references:=jsonb_set(coalesce(new.note_references,old.note_references),'{verses}',vs);new.verse:=coalesce(vs->>0,'');
 end if;
 if new.reference_url is distinct from old.reference_url then
  rs:=coalesce(new.note_references,old.note_references)->'resources';
  first_resource:=case when jsonb_array_length(rs)>0 then rs->0 else jsonb_build_object('title','') end;
  if jsonb_array_length(rs)>0 then rs:=rs-0; end if;
  first_resource:=jsonb_set(first_resource,'{url}',to_jsonb(coalesce(new.reference_url,'')),true);
  if coalesce(first_resource->>'title','')<>'' or coalesce(first_resource->>'url','')<>'' then rs:=jsonb_build_array(first_resource)||rs; end if;
  new.note_references:=jsonb_set(coalesce(new.note_references,old.note_references),'{resources}',rs);new.reference_url:=coalesce(rs->0->>'url','');
 end if;
 return new;
end $$;
create trigger study_notes_sync_legacy_references before update of verse,reference_url on public.study_notes
for each row execute function study_private.sync_legacy_note_references();

create or replace function study_private.study_note_change_v3(p_password text,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; refs jsonb; item jsonb; result jsonb; first_verse text; first_url text; previous_flag text;
begin
 err:=study_private.check_password(p_password);if err is not null then return jsonb_build_object('ok',false,'error',err);end if;
 if p_action not in ('create','update','restore') then raise exception '지원하지 않는 요청입니다.';end if;
 refs:=nullif(p_data->'note_references','null'::jsonb);
 if refs is not null then
  if jsonb_typeof(refs) is distinct from 'object' or (refs - 'verses' - 'resources') <> '{}'::jsonb or jsonb_typeof(refs->'verses') is distinct from 'array' or jsonb_typeof(refs->'resources') is distinct from 'array' or jsonb_array_length(refs->'verses')>40 or jsonb_array_length(refs->'resources')>40 or pg_column_size(refs)>100000 then raise exception '성구와 자료를 확인해 주세요.';end if;
  for item in select value from jsonb_array_elements(refs->'verses') loop
   if jsonb_typeof(item) is distinct from 'string' or length(btrim(item#>>'{}')) not between 1 and 300 or item#>>'{}'<>btrim(item#>>'{}') then raise exception '성구를 확인해 주세요.';end if;
  end loop;
  for item in select value from jsonb_array_elements(refs->'resources') loop
   if jsonb_typeof(item) is distinct from 'object' or (item-'title'-'url') <> '{}'::jsonb or jsonb_typeof(item->'title') is distinct from 'string' or jsonb_typeof(item->'url') is distinct from 'string' or length(item->>'title')>300 or length(item->>'url')>2000 or (item->>'title'='' and item->>'url'='') or (item->>'url'<>'' and (item->>'url') !~ '^https?://') then raise exception '자료를 확인해 주세요.';end if;
  end loop;
  first_verse:=coalesce(refs->'verses'->>0,'');first_url:=coalesce(refs->'resources'->0->>'url','');
  if first_verse<>coalesce(p_data->>'verse','') or first_url<>coalesce(p_data->>'reference_url','') then raise exception '성구와 자료가 일치하지 않아요.';end if;
 end if;
 previous_flag:=current_setting('study.note_refs_v3',true);perform set_config('study.note_refs_v3','1',true);
 result:=study_private.study_note_change_v2(p_password,p_action,p_data);
 perform set_config('study.note_refs_v3',coalesce(previous_flag,''),true);
 if coalesce((result->>'ok')::boolean,false) then update public.study_notes set note_references=refs where id=(result->>'id')::uuid;end if;
 return result;
end $$;
revoke all on function study_private.study_note_change_v3(text,text,jsonb) from public;
grant execute on function study_private.study_note_change_v3(text,text,jsonb) to anon,authenticated;
create or replace function public.study_note_change_v3(p_password text,p_action text,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select study_private.study_note_change_v3(p_password,p_action,p_data) $$;
revoke all on function public.study_note_change_v3(text,text,jsonb) from public;
grant execute on function public.study_note_change_v3(text,text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
