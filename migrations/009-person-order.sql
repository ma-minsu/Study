-- Shared person order. Run after 008. Existing people and notes are unchanged.
create table if not exists public.study_person_order (
 id boolean primary key default true check (id),
 revision bigint not null default 0,
 items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
 updated_at timestamptz not null default now()
);
insert into public.study_person_order(id) values(true) on conflict(id) do nothing;
alter table public.study_person_order enable row level security;
grant select on public.study_person_order to anon, authenticated;
revoke insert, update, delete on public.study_person_order from anon, authenticated;
drop policy if exists "Public can read person order" on public.study_person_order;
create policy "Public can read person order" on public.study_person_order for select to anon, authenticated using (true);

create or replace function public.study_person_order_save(p_password text, p_items jsonb, p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; next_revision bigint;
begin
 err:=study_private.check_password(p_password);
 if err is not null then return jsonb_build_object('ok',false,'error',err); end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>5000 then
  return jsonb_build_object('ok',false,'error','인물 순서를 확인해 주세요.');
 end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x) is distinct from 'object' or jsonb_typeof(x->'name') is distinct from 'string' or length(trim(x->>'name')) not between 1 and 100 or coalesce(x->>'era','') not in ('처음과 하늘','태초부터 노아까지','족장 시대','이집트와 광야','사사 시대','왕국 시대','유배와 귀환','예수와 초기 그리스도인'))
 or exists(select 1 from jsonb_array_elements(p_items) x group by x->>'name' having count(*)>1) then
  return jsonb_build_object('ok',false,'error','인물 순서를 확인해 주세요.');
 end if;
 update public.study_person_order set items=p_items,revision=revision+1,updated_at=now()
 where id=true and revision=p_revision returning revision into next_revision;
 if next_revision is null then return jsonb_build_object('ok',false,'error','다른 기기에서 순서가 변경됐어요. 새로고침하고 다시 시도해 주세요.','conflict',true); end if;
 return jsonb_build_object('ok',true,'revision',next_revision);
end $$;
revoke all on function public.study_person_order_save(text,jsonb,bigint) from public;
grant execute on function public.study_person_order_save(text,jsonb,bigint) to anon,authenticated;
notify pgrst, 'reload schema';
