-- Keep the category catalog and the age-group membership alongside its existing order.
alter table public.toolbox_category_order
  add column if not exists age_tags text[] not null default array['어린이','청소년','청년','중장년','어르신']::text[];

-- Seed once, retaining the order and any custom tags already used by existing materials.
update public.toolbox_category_order o set tags = (
  select coalesce(array_agg(name order by first_position), '{}'::text[])
  from (
    select name, min(position) first_position
    from unnest(o.tags || array['어린이','청소년','청년','중장년','어르신','창조','자연','가족','행복','미래와 희망']::text[] ||
      coalesce((select array_agg(tag) from public.toolbox_items i cross join lateral unnest(i.tags) tag), '{}'::text[]))
      with ordinality as src(original, position)
    cross join lateral unnest(case when original='창조와 자연' then array['창조','자연']::text[] else array[original] end) as expanded(name)
    where name <> '모든 연령' and btrim(name) <> ''
    group by name
  ) categories
), updated_at=clock_timestamp() where id=true;

-- One transaction updates the catalog and all affected materials under their existing RLS rules.
create or replace function public.toolbox_change_category(
 p_action text, p_old text, p_new text, p_expected_order timestamptz,
 p_editing_item uuid default null, p_expected_item timestamptz default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 catalog public.toolbox_category_order%rowtype;
 next_tags text[];
 next_age_tags text[];
 edit_time timestamptz;
 new_time timestamptz := clock_timestamp();
 target text := btrim(coalesce(p_new,''));
begin
 if not exists (select 1 from public.toolbox_admins where user_id = (select auth.uid())) then
   raise exception '관리 권한이 필요해요.' using errcode='42501';
 end if;
 select * into catalog from public.toolbox_category_order where id=true for update;
 if not found or catalog.updated_at is distinct from p_expected_order then
   raise exception '다른 기기에서 분류가 변경됐어요. 다시 열어 주세요.' using errcode='40001';
 end if;
 if p_editing_item is not null then
   select updated_at into edit_time from public.toolbox_items where id=p_editing_item for update;
   if not found or edit_time is distinct from p_expected_item then
     raise exception '자료가 다른 기기에서 변경됐어요. 다시 열어 주세요.' using errcode='40001';
   end if;
 end if;
 if p_action is null or p_action not in ('create','rename','delete') then raise exception '분류 작업을 확인해 주세요.'; end if;
 if p_action <> 'create' and (p_old is null or not p_old=any(catalog.tags)) then
   raise exception '분류를 찾을 수 없어요. 다시 열어 주세요.';
 end if;
 if p_action in ('create','rename') then
   if char_length(target) not between 1 and 30 or target in ('전체','즐겨찾기','모든 연령','창조와 자연') then
     raise exception '분류 이름을 확인해 주세요.';
   end if;
   if exists(select 1 from unnest(catalog.tags) t where lower(t)=lower(target) and (p_action='create' or t<>p_old)) then
     raise exception '같은 이름의 분류가 이미 있어요.';
   end if;
 end if;
 if p_action='create' then
   next_tags := array_append(catalog.tags,target); next_age_tags := catalog.age_tags;
   update public.toolbox_category_order set tags=next_tags,age_tags=next_age_tags,updated_at=new_time where id=true;
 else
   select coalesce(array_agg(v order by ord),'{}'::text[]) into next_tags
   from (select case when x=p_old then target else x end v, ord from unnest(catalog.tags) with ordinality a(x,ord) where p_action<>'delete' or x<>p_old) q;
   select coalesce(array_agg(v order by ord),'{}'::text[]) into next_age_tags
   from (select case when x=p_old then target else x end v, ord from unnest(catalog.age_tags) with ordinality a(x,ord) where p_action<>'delete' or x<>p_old) q;
   update public.toolbox_category_order set tags=next_tags,age_tags=next_age_tags,updated_at=new_time where id=true;
   update public.toolbox_items i set tags=(
     select coalesce(array_agg(name order by pos, subpos),'{}'::text[]) from (
       select name, min(pos) pos, min(subpos) subpos from (
         select case when expanded=p_old then target else expanded end as name, pos, subpos
         from unnest(i.tags) with ordinality as original(tag,pos)
         cross join lateral unnest(case
           when tag='창조와 자연' and p_old in ('창조','자연') then array['창조','자연']::text[]
           when tag='모든 연령' and p_old=any(catalog.age_tags) then catalog.age_tags
           else array[tag] end) with ordinality as parts(expanded,subpos)
         where p_action<>'delete' or expanded<>p_old
       ) mapped group by name
     ) unique_names
   ), updated_at=new_time
   where p_old=any(i.tags) or (p_old in ('창조','자연') and '창조와 자연'=any(i.tags))
     or (p_old=any(catalog.age_tags) and '모든 연령'=any(i.tags));
 end if;
 if p_editing_item is not null then select updated_at into edit_time from public.toolbox_items where id=p_editing_item; end if;
 return jsonb_build_object('tags',next_tags,'age_tags',next_age_tags,'updated_at',new_time,'editing_item_updated_at',edit_time);
end;
$$;
revoke all on function public.toolbox_change_category(text,text,text,timestamptz,uuid,timestamptz) from public,anon;
grant execute on function public.toolbox_change_category(text,text,text,timestamptz,uuid,timestamptz) to authenticated;

-- Reject a stale editor that tries to reintroduce a deleted category.
create or replace function public.toolbox_check_item_categories()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare catalog public.toolbox_category_order%rowtype; tag text;
begin
 select * into catalog from public.toolbox_category_order where id=true for share;
 if not found then raise exception '분류를 불러오지 못했어요.'; end if;
 foreach tag in array new.tags loop
   if tag='모든 연령' then continue; end if;
   if tag='창조와 자연' and '창조'=any(catalog.tags) and '자연'=any(catalog.tags) then continue; end if;
   if not tag=any(catalog.tags) then
     raise exception '분류가 변경됐어요. 자료를 다시 열어 주세요.' using errcode='40001';
   end if;
 end loop;
 return new;
end;
$$;
revoke all on function public.toolbox_check_item_categories() from public,anon,authenticated;
drop trigger if exists toolbox_validate_item_categories on public.toolbox_items;
create trigger toolbox_validate_item_categories before insert or update of tags on public.toolbox_items
for each row execute function public.toolbox_check_item_categories();
