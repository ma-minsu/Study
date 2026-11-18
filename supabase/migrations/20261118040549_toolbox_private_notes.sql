-- Private descriptions and references must never be selectable from public items.
create table public.toolbox_private_notes (
 item_id uuid primary key references public.toolbox_items(id) on delete cascade,
 description text not null default '' check (char_length(description)<=5000),
 reference_url text,
 legacy_summary text not null default ''
);
alter table public.toolbox_private_notes enable row level security;
revoke all on public.toolbox_private_notes from public,anon,authenticated;
grant select,insert,update,delete on public.toolbox_private_notes to authenticated;
create policy toolbox_notes_admin_read on public.toolbox_private_notes for select to authenticated
 using (exists(select 1 from public.toolbox_admins where user_id=(select auth.uid())));
create policy toolbox_notes_admin_insert on public.toolbox_private_notes for insert to authenticated
 with check (exists(select 1 from public.toolbox_admins where user_id=(select auth.uid())));
create policy toolbox_notes_admin_update on public.toolbox_private_notes for update to authenticated
 using (exists(select 1 from public.toolbox_admins where user_id=(select auth.uid())))
 with check (exists(select 1 from public.toolbox_admins where user_id=(select auth.uid())));
create policy toolbox_notes_admin_delete on public.toolbox_private_notes for delete to authenticated
 using (exists(select 1 from public.toolbox_admins where user_id=(select auth.uid())));

insert into public.toolbox_private_notes(item_id,description,reference_url,legacy_summary)
 select id,description,reference_url,summary from public.toolbox_items;
alter table public.toolbox_items drop column description, drop column reference_url, drop column summary;

-- Save the item and its private notes in one transaction, respecting RLS and edit conflicts.
create or replace function public.toolbox_save_with_notes(
 p_id uuid,p_create boolean,p_expected_updated_at timestamptz,p_title text,p_description text,
 p_tags text[],p_images text[],p_cover text,p_reference_url text,p_landscape_enabled boolean,
 p_published boolean,p_sort_order bigint,p_legacy_summary text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.toolbox_items%rowtype;
begin
 if not exists(select 1 from public.toolbox_admins where user_id=(select auth.uid())) then
  raise exception '관리 권한이 필요해요.' using errcode='42501';
 end if;
 if p_id is null or p_create is null or p_title is null or length(btrim(p_title))=0 or length(p_title)>120
   or p_description is null or length(p_description)>5000 or p_tags is null or p_images is null
   or p_published is null or p_landscape_enabled is null then
  raise exception '자료 내용을 확인해 주세요.';
 end if;
 if p_create then
  insert into public.toolbox_items(id,title,tags,images,cover,landscape_enabled,published,sort_order,updated_at)
   values(p_id,p_title,p_tags,p_images,p_cover,p_landscape_enabled,p_published,coalesce(p_sort_order,0),clock_timestamp())
   returning * into saved;
 else
  if p_expected_updated_at is null then raise exception '자료를 다시 열어 주세요.' using errcode='40001'; end if;
  update public.toolbox_items set title=p_title,tags=p_tags,images=p_images,
   cover_thumbnail=case when cover is distinct from p_cover then null else cover_thumbnail end,
   cover=p_cover,landscape_enabled=p_landscape_enabled,published=p_published,updated_at=clock_timestamp()
   where id=p_id and updated_at=p_expected_updated_at returning * into saved;
  if not found then raise exception '다른 기기에서 변경되었어요. 새로고침 후 다시 수정해 주세요.' using errcode='40001';end if;
 end if;
 insert into public.toolbox_private_notes(item_id,description,reference_url,legacy_summary)
  values(p_id,p_description,p_reference_url,coalesce(p_legacy_summary,''))
  on conflict(item_id) do update set description=excluded.description,reference_url=excluded.reference_url,
   legacy_summary=coalesce(p_legacy_summary,public.toolbox_private_notes.legacy_summary);
 return jsonb_build_object('id',saved.id,'updated_at',saved.updated_at);
end;
$$;
revoke all on function public.toolbox_save_with_notes(uuid,boolean,timestamptz,text,text,text[],text[],text,text,boolean,boolean,bigint,text) from public,anon;
grant execute on function public.toolbox_save_with_notes(uuid,boolean,timestamptz,text,text,text[],text[],text,text,boolean,boolean,bigint,text) to authenticated;
