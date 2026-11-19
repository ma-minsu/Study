-- Shared manual ordering for other traits and prophecies.
create table public.study_personal_order (
 field text primary key check(field in ('traits','prophecy')),
 revision bigint not null default 0 check(revision>=0),
 items jsonb not null default '[]'::jsonb check(jsonb_typeof(items)='array'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
insert into public.study_personal_order(field) values('traits'),('prophecy') on conflict do nothing;
alter table public.study_personal_order enable row level security;
revoke all on public.study_personal_order from public,anon,authenticated;
grant select on public.study_personal_order to anon,authenticated;
create policy "Personal study order readable" on public.study_personal_order for select to anon,authenticated using(true);
create or replace function study_private.personal_order_save(p_password text,p_field text,p_items jsonb,p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; next_revision bigint;
begin
 err:=study_private.check_password(p_password);if err is not null then return jsonb_build_object('ok',false,'error',err);end if;
 if coalesce(p_field,'') not in ('traits','prophecy') or p_revision is null or p_revision<0 or jsonb_typeof(p_items) is distinct from 'array' then return jsonb_build_object('ok',false,'error','순서를 확인해 주세요.');end if;
 if jsonb_array_length(p_items)>5000 or exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x) is distinct from 'string' or length(btrim(x#>>'{}')) not between 1 and 75) or (select count(*)<>count(distinct x#>>'{}') from jsonb_array_elements(p_items) x) then return jsonb_build_object('ok',false,'error','순서를 확인해 주세요.');end if;
 update public.study_personal_order set items=p_items,revision=revision+1,updated_at=now() where field=p_field and revision=p_revision returning revision into next_revision;
 if next_revision is null then return jsonb_build_object('ok',false,'conflict',true,'error','다른 기기에서 순서가 바뀌었어요. 다시 열어 주세요.');end if;
 return jsonb_build_object('ok',true,'revision',next_revision);
end $$;
create or replace function study_private.personal_subject_unhide(p_password text,p_field text,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text;
begin
 err:=study_private.check_password(p_password);if err is not null then return jsonb_build_object('ok',false,'error',err);end if;
 if coalesce(p_field,'') not in ('traits','history','prophecy') or length(btrim(coalesce(p_name,''))) not between 1 and 75 then return jsonb_build_object('ok',false,'error','항목을 확인해 주세요.');end if;
 update public.study_subject_catalog set hidden=false,updated_at=now() where field=p_field and name=p_name and hidden=true;
 if not found then return jsonb_build_object('ok',false,'error','지운 항목을 찾을 수 없어요. 다시 열어 주세요.');end if;
 return jsonb_build_object('ok',true);
end $$;
create or replace function study_private.personal_order_restore(p_password text,p_orders jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; item jsonb; n integer; total integer:=0;
begin
 err:=study_private.check_password(p_password);if err is not null then return jsonb_build_object('ok',false,'error',err);end if;
 if jsonb_typeof(p_orders) is distinct from 'array' then raise exception '개인 연구 순서를 확인해 주세요.';end if;
 if jsonb_array_length(p_orders)>2 then raise exception '개인 연구 순서를 확인해 주세요.';end if;
 if (select count(*)<>count(distinct x->>'field') from jsonb_array_elements(p_orders) x) then raise exception '개인 연구 순서를 확인해 주세요.';end if;
 for item in select value from jsonb_array_elements(p_orders) loop
  if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'field','') not in ('traits','prophecy') or jsonb_typeof(item->'items') is distinct from 'array' then raise exception '개인 연구 순서를 확인해 주세요.';end if;
  if jsonb_array_length(item->'items')>5000 or exists(select 1 from jsonb_array_elements(item->'items') x where jsonb_typeof(x) is distinct from 'string' or length(btrim(x#>>'{}')) not between 1 and 75) or (select count(*)<>count(distinct x#>>'{}') from jsonb_array_elements(item->'items') x) then raise exception '개인 연구 순서를 확인해 주세요.';end if;
  update public.study_personal_order set items=item->'items',revision=revision+1,updated_at=now() where field=item->>'field' and items='[]'::jsonb and item->'items'<>'[]'::jsonb;
  get diagnostics n=row_count;total:=total+n;
 end loop;
 return jsonb_build_object('ok',true,'orders_added',total);
end $$;
revoke all on function study_private.personal_order_save(text,text,jsonb,bigint),study_private.personal_subject_unhide(text,text,text),study_private.personal_order_restore(text,jsonb) from public;
grant execute on function study_private.personal_order_save(text,text,jsonb,bigint),study_private.personal_subject_unhide(text,text,text),study_private.personal_order_restore(text,jsonb) to anon,authenticated;
create function public.study_personal_order_save(p_password text,p_field text,p_items jsonb,p_revision bigint) returns jsonb language sql security invoker set search_path='' as $$ select study_private.personal_order_save(p_password,p_field,p_items,p_revision) $$;
create function public.study_personal_subject_unhide(p_password text,p_field text,p_name text) returns jsonb language sql security invoker set search_path='' as $$ select study_private.personal_subject_unhide(p_password,p_field,p_name) $$;
create function public.study_personal_order_restore(p_password text,p_orders jsonb) returns jsonb language sql security invoker set search_path='' as $$ select study_private.personal_order_restore(p_password,p_orders) $$;
revoke all on function public.study_personal_order_save(text,text,jsonb,bigint),public.study_personal_subject_unhide(text,text,text),public.study_personal_order_restore(text,jsonb) from public;
grant execute on function public.study_personal_order_save(text,text,jsonb,bigint),public.study_personal_subject_unhide(text,text,text),public.study_personal_order_restore(text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
