-- Preserve a plain-text copy for existing clients, search and exports.
alter table public.study_notes add column if not exists body_delta jsonb;
alter table public.study_notes add constraint study_notes_body_delta_shape check (body_delta is null or (jsonb_typeof(body_delta) = 'object' and jsonb_typeof(body_delta->'ops') = 'array' and pg_column_size(body_delta) <= 250000));

-- Older clients write plain text; invalidate stale formatting only if that text changes.
create or replace function study_private.clear_stale_note_format() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.body is distinct from old.body then new.body_delta := null; end if;
 return new;
end $$;
create trigger study_notes_clear_stale_format before update of body on public.study_notes
for each row execute function study_private.clear_stale_note_format();

-- The existing PIN-protected change and optional formatting are one transaction.
create or replace function study_private.study_note_change_v2(p_password text,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare err text; result jsonb; delta jsonb; op jsonb; attrs jsonb; plain text;
begin
 err:=study_private.check_password(p_password); if err is not null then return jsonb_build_object('ok',false,'error',err); end if;
 if p_action not in ('create','update','restore') then raise exception '지원하지 않는 요청입니다.'; end if;
 delta:=nullif(p_data->'body_delta','null'::jsonb);
 if delta is not null then
  if jsonb_typeof(delta) is distinct from 'object' or jsonb_typeof(delta->'ops') is distinct from 'array' or pg_column_size(delta)>250000 then raise exception '글 서식을 확인해 주세요.'; end if;
  plain:='';
  for op in select value from jsonb_array_elements(delta->'ops') loop
   if jsonb_typeof(op) is distinct from 'object' or jsonb_typeof(op->'insert') is distinct from 'string' or (op - 'insert' - 'attributes') <> '{}'::jsonb then raise exception '지원하지 않는 글 서식입니다.'; end if;
   attrs:=op->'attributes';
   if attrs is not null and (jsonb_typeof(attrs)<>'object' or (attrs - 'bold' - 'italic' - 'list' - 'blockquote' - 'link') <> '{}'::jsonb) then raise exception '지원하지 않는 글 서식입니다.'; end if;
   if attrs ? 'bold' and jsonb_typeof(attrs->'bold')<>'boolean' or attrs ? 'italic' and jsonb_typeof(attrs->'italic')<>'boolean' or attrs ? 'blockquote' and jsonb_typeof(attrs->'blockquote')<>'boolean' or attrs ? 'list' and coalesce(attrs->>'list','') not in ('ordered','bullet') or attrs ? 'link' and (jsonb_typeof(attrs->'link')<>'string' or length(attrs->>'link')>2000 or (attrs->>'link') !~ '^https?://') then raise exception '지원하지 않는 글 서식입니다.'; end if;
   plain:=plain || (op->>'insert');
  end loop;
  if btrim(plain,E' \t\n\r')<>btrim(coalesce(p_data->>'body',''),E' \t\n\r') then raise exception '글 내용과 서식이 일치하지 않아요.'; end if;
 end if;
 result:=public.study_change(p_password,p_action,p_data);
 if coalesce((result->>'ok')::boolean,false) then
  update public.study_notes set body_delta=delta where id=(result->>'id')::uuid;
 end if;
 return result;
end $$;
revoke all on function study_private.study_note_change_v2(text,text,jsonb) from public;
grant execute on function study_private.study_note_change_v2(text,text,jsonb) to anon,authenticated;
create or replace function public.study_note_change_v2(p_password text,p_action text,p_data jsonb)
returns jsonb language sql security invoker set search_path = '' as $$ select study_private.study_note_change_v2(p_password,p_action,p_data) $$;
revoke all on function public.study_note_change_v2(text,text,jsonb) from public;
grant execute on function public.study_note_change_v2(text,text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
