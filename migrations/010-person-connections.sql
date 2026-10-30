-- Enable safely editing an existing person connection from either endpoint.
create or replace function public.study_connection_capabilities() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('symmetric_person_connections',true)
$$;
revoke all on function public.study_connection_capabilities() from public;
grant execute on function public.study_connection_capabilities() to anon,authenticated;
create or replace function public.study_connection_change(p_password text,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; rid uuid; old_kind text; new_source text;
begin
 err:=study_private.check_password(p_password); if err is not null then return jsonb_build_object('ok',false,'error',err); end if;
 if p_action='create' then
  insert into public.study_connections(kind,source,title,target,description) values(p_data->>'kind',trim(p_data->>'source'),trim(p_data->>'title'),trim(coalesce(p_data->>'target','')),trim(coalesce(p_data->>'description',''))) returning id into rid;
 elsif p_action='update' then
  rid:=(p_data->>'id')::uuid;
  select kind into old_kind from public.study_connections where id=rid for update;
  if not found then raise exception '항목을 찾을 수 없습니다.'; end if;
  new_source:=case when old_kind='person' then nullif(trim(coalesce(p_data->>'source','')),'') else null end;
  update public.study_connections set source=coalesce(new_source,source),title=trim(p_data->>'title'),target=trim(coalesce(p_data->>'target','')),description=trim(coalesce(p_data->>'description','')) where id=rid;
 elsif p_action='delete' then
  rid:=(p_data->>'id')::uuid; delete from public.study_connections where id=rid;
  if not found then raise exception '항목을 찾을 수 없습니다.'; end if;
 else raise exception '지원하지 않는 요청입니다.'; end if;
 return jsonb_build_object('ok',true,'id',rid);
end $$;
revoke all on function public.study_connection_change(text,text,jsonb) from public;
grant execute on function public.study_connection_change(text,text,jsonb) to anon,authenticated;
notify pgrst, 'reload schema';
