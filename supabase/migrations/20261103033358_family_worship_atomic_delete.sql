-- Delete a family session and its photos in a single transaction.
create or replace function public.study_change(p_password text, p_action text, p_data jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare err text; note_id uuid; img jsonb; imgs jsonb; files jsonb; file_path text; upload_token text; u text; idx integer; family_anchor text; family_person text; family_expected text[]; family_actual text[];
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
    if p_action='create' and p_data->>'book'='family-photo-v1' and coalesce(p_data->>'person','') ~ '^@family-photo:[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      family_anchor:=substring(p_data->>'person' from 15);
      perform 1 from public.study_notes where person='@family-session:'||family_anchor and book='family-session-v1' for key share;
      if not found then raise exception '가족 숭배 회차를 찾을 수 없습니다.'; end if;
    end if;
    if p_action in ('create','restore') then
      insert into public.study_notes(person,author,title,body,verse,book,topic,reference_url,created_at) values (btrim(p_data->>'person'),p_data->>'author',btrim(p_data->>'title'),btrim(p_data->>'body'),coalesce(p_data->>'verse',''),coalesce(p_data->>'book',''),coalesce(p_data->>'topic',''),u,case when p_action='restore' then coalesce((p_data->>'created_at')::timestamptz,now()) else now() end) returning id into note_id;
    else
      note_id:=(p_data->>'id')::uuid;
      update public.study_notes set author=p_data->>'author',title=btrim(p_data->>'title'),body=btrim(p_data->>'body'),verse=coalesce(p_data->>'verse',''),book=coalesce(p_data->>'book',''),topic=coalesce(p_data->>'topic',''),reference_url=u,updated_at=now() where id=note_id and (not (p_data ? 'expected_updated_at') or updated_at is not distinct from (p_data->>'expected_updated_at')::timestamptz);
      if not found then if p_data ? 'expected_updated_at' and exists(select 1 from public.study_notes n where n.id=note_id) then raise exception '다른 기기에서 변경됐어요. 다시 열고 확인해 주세요.'; else raise exception '기록을 찾을 수 없습니다.'; end if; end if;
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
  elsif p_action='delete_family' then
    note_id:=(p_data->>'id')::uuid;
    select person into family_person from public.study_notes
      where id=note_id and book='family-session-v1'
        and person ~ '^@family-session:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and updated_at is not distinct from (p_data->>'expected_updated_at')::timestamptz for update;
    if not found then raise exception '회차가 없거나 다른 기기에서 변경됐어요. 다시 열어 확인해 주세요.'; end if;
    if jsonb_typeof(p_data->'photo_ids') is distinct from 'array' then raise exception '사진 목록을 확인해 주세요.'; end if;
    family_anchor:=substring(family_person from 17);
    select coalesce(array_agg(v order by v),array[]::text[]) into family_expected from jsonb_array_elements_text(p_data->'photo_ids') v;
    perform 1 from public.study_notes where person='@family-photo:'||family_anchor and book='family-photo-v1' for update;
    select coalesce(array_agg(id::text order by id::text),array[]::text[]) into family_actual from public.study_notes where person='@family-photo:'||family_anchor and book='family-photo-v1';
    if family_actual<>family_expected then raise exception '사진이 다른 기기에서 변경됐어요. 다시 열어 확인해 주세요.'; end if;
    insert into study_private.cleanup_paths(path)
      select sf.path from public.study_files sf join public.study_notes n on n.id=sf.note_id
      where n.id=(p_data->>'id')::uuid or (n.person='@family-photo:'||family_anchor and n.book='family-photo-v1') on conflict do nothing;
    delete from public.study_notes where person='@family-photo:'||family_anchor and book='family-photo-v1';
    delete from public.study_notes where id=note_id;
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

notify pgrst, 'reload schema';
