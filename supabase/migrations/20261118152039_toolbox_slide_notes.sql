-- Notes remain in the existing administrator-only table; image paths keep them attached when reordered.
alter table public.toolbox_private_notes
 add column if not exists slide_notes jsonb not null default '{}'::jsonb;
alter table public.toolbox_private_notes
 add constraint toolbox_slide_notes_object check (jsonb_typeof(slide_notes)='object');

-- The previous save function remains available to older clients and leaves slide notes untouched.
create or replace function public.toolbox_save_with_slide_notes(
 p_id uuid,p_create boolean,p_expected_updated_at timestamptz,p_title text,p_description text,
 p_tags text[],p_images text[],p_cover text,p_reference_url text,p_landscape_enabled boolean,
 p_published boolean,p_sort_order bigint,p_legacy_summary text default null,p_slide_notes jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved jsonb;
begin
 if not exists(select 1 from public.toolbox_admins where user_id=(select auth.uid())) then
  raise exception '관리 권한이 필요해요.' using errcode='42501';
 end if;
 if p_slide_notes is null or jsonb_typeof(p_slide_notes)<>'object' or octet_length(p_slide_notes::text)>1048576 then
  raise exception '삽화 메모를 확인해 주세요.';
 end if;
 if exists(select 1 from jsonb_each(p_slide_notes) as n(path,note)
   where length(n.path)=0 or length(n.path)>2048 or jsonb_typeof(n.note)<>'object'
    or jsonb_typeof(n.note->'ops') is distinct from 'array' or octet_length(n.note::text)>81920) then
  raise exception '삽화 메모와 사진을 확인해 주세요.';
 end if;
 if exists(select 1 from jsonb_each(p_slide_notes) as n(path,note)
   cross join lateral jsonb_array_elements(case when jsonb_typeof(n.note->'ops')='array' then n.note->'ops' else '[]'::jsonb end) as op
   where jsonb_typeof(op)<>'object' or jsonb_typeof(op->'insert') is distinct from 'string') then
  raise exception '지원하지 않는 삽화 메모 형식이에요.';
 end if;
 saved:=public.toolbox_save_with_notes(p_id,p_create,p_expected_updated_at,p_title,p_description,p_tags,p_images,p_cover,p_reference_url,p_landscape_enabled,p_published,p_sort_order,p_legacy_summary);
 update public.toolbox_private_notes set slide_notes=p_slide_notes where item_id=p_id;
 if not found then raise exception '삽화 메모를 저장하지 못했어요.';end if;
 return saved;
end;
$$;
revoke all on function public.toolbox_save_with_slide_notes(uuid,boolean,timestamptz,text,text,text[],text[],text,text,boolean,boolean,bigint,text,jsonb) from public,anon;
grant execute on function public.toolbox_save_with_slide_notes(uuid,boolean,timestamptz,text,text,text[],text[],text,text,boolean,boolean,bigint,text,jsonb) to authenticated;
