-- Add optional image descriptions without changing existing records.
alter table public.study_images add column if not exists alt_text text not null default '';
alter table public.study_files add column if not exists alt_text text not null default '';
create or replace function public.study_change(p_password text, p_action text, p_data jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare err text; note_id uuid; img jsonb; imgs jsonb; files jsonb; file_path text; upload_token text; u text; idx integer;
begin
  err:=study_private.check_password(p_password);
  if err is not null then return jsonb_build_object('ok',false,'error',err); end if;
  if p_action='person' then
    insert into public.study_people(name,era,search_term) values (btrim(p_data->>'name'),btrim(p_data->>'era'),left(coalesce(p_data->>'search_term',''),200));
  elsif p_action in ('create','update','restore') then
    if length(coalesce(p_data->>'verse',''))>300 or length(coalesce(p_data->>'topic',''))>300 or length(coalesce(p_data->>'book',''))>100 or length(coalesce(p_data->>'reference_url',''))>2000 then raise exception '입력 길이를 확인해 주세요.'; end if;
    u:=coalesce(p_data->>'reference_url',''); if u<>'' and u !~ '^https?://' then raise exception '자료 링크는 http 또는 https 주소여야 합니다.'; end if;
    imgs:=coalesce(p_data->'images','[]'::jsonb);
    files:=coalesce(p_data->'file_paths','[]'::jsonb);
    if jsonb_typeof(imgs)<>'array' or jsonb_typeof(files)<>'array' or jsonb_array_length(imgs)+jsonb_array_length(files)>3 then raise exception '이미지는 최대 3장입니다.'; end if;
    upload_token:=p_data->>'upload_token';
    for img in select * from jsonb_array_elements(files) loop
      file_path:=img #>> '{}';
      if upload_token is null or split_part(file_path,'/',1) <> upload_token or not study_private.is_allowed_upload(file_path)
         or not exists(select 1 from storage.objects where bucket_id='bible-study-photos' and name=file_path)
      then raise exception '이미지 업로드를 확인할 수 없습니다.'; end if;
    end loop;
    if p_action in ('create','restore') then
      insert into public.study_notes(person,author,title,body,verse,book,topic,reference_url,created_at) values (btrim(p_data->>'person'),p_data->>'author',btrim(p_data->>'title'),btrim(p_data->>'body'),coalesce(p_data->>'verse',''),coalesce(p_data->>'book',''),coalesce(p_data->>'topic',''),u,case when p_action='restore' then coalesce((p_data->>'created_at')::timestamptz,now()) else now() end) returning id into note_id;
    else
      note_id:=(p_data->>'id')::uuid;
      update public.study_notes set author=p_data->>'author',title=btrim(p_data->>'title'),body=btrim(p_data->>'body'),verse=coalesce(p_data->>'verse',''),book=coalesce(p_data->>'book',''),topic=coalesce(p_data->>'topic',''),reference_url=u,updated_at=now() where id=note_id;
      if not found then raise exception '기록을 찾을 수 없습니다.'; end if;
      if coalesce((p_data->>'replace_images')::boolean,false) then
        insert into study_private.cleanup_paths(path) select sf.path from public.study_files sf where sf.note_id=note_id on conflict do nothing;
        delete from public.study_files sf where sf.note_id=note_id;
        delete from public.study_images si where si.note_id=note_id;
      else imgs:='[]'::jsonb; files:='[]'::jsonb; end if;
    end if;
    idx:=0;
    for img in select * from jsonb_array_elements(imgs) loop
      insert into public.study_images(note_id,data_url,alt_text) values(note_id,img #>> '{}',left(coalesce(p_data->'image_descriptions'->>idx,''),150)); idx:=idx+1;
    end loop;
    for img in select * from jsonb_array_elements(files) loop
      insert into public.study_files(note_id,path,alt_text) values(note_id,img #>> '{}',left(coalesce(p_data->'image_descriptions'->>idx,''),150)); idx:=idx+1;
    end loop;
    if upload_token is not null then delete from study_private.upload_tokens where token=upload_token; end if;
  elsif p_action='delete' then
    insert into study_private.cleanup_paths(path) select sf.path from public.study_files sf where sf.note_id=(p_data->>'id')::uuid on conflict do nothing;
    delete from public.study_notes where id=(p_data->>'id')::uuid;
    if not found then raise exception '기록을 찾을 수 없습니다.'; end if;
  else raise exception '지원하지 않는 요청입니다.';
  end if;
  return jsonb_build_object('ok',true,'id',note_id);
end $$;
revoke all on function public.study_change(text,text,jsonb) from public;
grant execute on function public.study_change(text,text,jsonb) to anon, authenticated;

create or replace function public.study_migrate_images(p_password text,p_note uuid,p_upload_token text,p_mapping jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare err text; item jsonb; original_id uuid; new_path text; original_alt text;
begin
 err:=study_private.check_password(p_password);
 if err is not null then return jsonb_build_object('ok',false,'error',err); end if;
 if jsonb_typeof(p_mapping)<>'array' or jsonb_array_length(p_mapping)>3 then raise exception '이미지 목록을 확인해 주세요.'; end if;
 for item in select * from jsonb_array_elements(p_mapping) loop
  original_id:=(item->>'id')::uuid; new_path:=item->>'path';
  if split_part(new_path,'/',1)<>p_upload_token or not study_private.is_allowed_upload(new_path)
     or not exists(select 1 from storage.objects where bucket_id='bible-study-photos' and name=new_path)
     or not exists(select 1 from public.study_images where id=original_id and note_id=p_note)
  then raise exception '원본 또는 업로드한 이미지를 확인할 수 없습니다.'; end if;
  select alt_text into original_alt from public.study_images where id=original_id and note_id=p_note;
  insert into public.study_files(note_id,path,alt_text) values(p_note,new_path,coalesce(original_alt,''));
  delete from public.study_images where id=original_id and note_id=p_note;
 end loop;
 delete from study_private.upload_tokens where token=p_upload_token;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.study_migrate_images(text,uuid,text,jsonb) from public;
grant execute on function public.study_migrate_images(text,uuid,text,jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
