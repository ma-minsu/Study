-- Return visits are private and can only be accessed through PIN-checked functions.
create table if not exists study_private.return_visit_books (
 person text primary key check (person in ('mine','bora')),
 entries jsonb not null default '[]'::jsonb check (jsonb_typeof(entries)='array'),
 revision bigint not null default 0
);
alter table study_private.return_visit_books enable row level security;
revoke all on study_private.return_visit_books from public, anon, authenticated;

create or replace function public.study_visits_read(p_password text,p_person text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; b study_private.return_visit_books%rowtype;
begin
 err:=study_private.check_password(p_password);if err is not null then return jsonb_build_object('ok',false,'error',err);end if;
 if p_person is null or p_person not in ('mine','bora') then return jsonb_build_object('ok',false,'error','사용자를 확인해 주세요.');end if;
 select * into b from study_private.return_visit_books where person=p_person;
 return jsonb_build_object('ok',true,'entries',coalesce(b.entries,'[]'::jsonb),'revision',coalesce(b.revision,0));
end $$;

create or replace function public.study_visits_write(p_password text,p_person text,p_revision bigint,p_entries jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text; new_revision bigint;
begin
 err:=study_private.check_password(p_password);if err is not null then return jsonb_build_object('ok',false,'error',err);end if;
 if p_person is null or p_person not in ('mine','bora') or p_revision is null or p_revision<0 or p_entries is null or jsonb_typeof(p_entries)<>'array' or octet_length(p_entries::text)>1048576 or jsonb_array_length(p_entries)>1000 then return jsonb_build_object('ok',false,'error','재방문 기록을 확인해 주세요.');end if;
 insert into study_private.return_visit_books(person) values(p_person) on conflict do nothing;
 update study_private.return_visit_books set entries=p_entries,revision=revision+1 where person=p_person and revision=p_revision returning revision into new_revision;
 if new_revision is null then return jsonb_build_object('ok',false,'conflict',true,'error','다른 기기에서 기록이 바뀌었어요. 최신 내용을 확인해 주세요.');end if;
 return jsonb_build_object('ok',true,'revision',new_revision);
end $$;

create or replace function public.study_visits_backup(p_password text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text;
begin
 err:=study_private.check_password(p_password);if err is not null then return jsonb_build_object('ok',false,'error',err);end if;
 return jsonb_build_object('ok',true,'books',coalesce((select jsonb_agg(jsonb_build_object('person',person,'entries',entries)) from study_private.return_visit_books),'[]'::jsonb));
end $$;

create or replace function public.study_visits_restore(p_password text,p_books jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text;b jsonb;item jsonb;existing jsonb;merged jsonb;owner text;
begin
 err:=study_private.check_password(p_password);if err is not null then return jsonb_build_object('ok',false,'error',err);end if;
 if p_books is null or jsonb_typeof(p_books)<>'array' or jsonb_array_length(p_books)>2 or octet_length(p_books::text)>2097152 then return jsonb_build_object('ok',false,'error','재방문 백업을 확인해 주세요.');end if;
 for b in select value from jsonb_array_elements(p_books) loop
  owner:=b->>'person';if owner is null or owner not in ('mine','bora') or jsonb_typeof(b->'entries') is distinct from 'array' or jsonb_array_length(b->'entries')>1000 then raise exception '재방문 백업을 확인해 주세요.';end if;
  insert into study_private.return_visit_books(person) values(owner) on conflict do nothing;
  select entries into existing from study_private.return_visit_books where person=owner for update;merged:=existing;
  for item in select value from jsonb_array_elements(b->'entries') loop
   if jsonb_typeof(item)<>'object' or coalesce(item->>'id','')='' then raise exception '재방문 백업 항목을 확인해 주세요.';end if;
   if not exists(select 1 from jsonb_array_elements(merged) e where e->>'id'=item->>'id') then merged:=merged||jsonb_build_array(item);end if;
  end loop;
  if jsonb_array_length(merged)>1000 or octet_length(merged::text)>1048576 then raise exception '재방문 백업이 너무 큽니다.';end if;
  update study_private.return_visit_books set entries=merged,revision=revision+1 where person=owner;
 end loop;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.study_visits_read(text,text), public.study_visits_write(text,text,bigint,jsonb), public.study_visits_backup(text), public.study_visits_restore(text,jsonb) from public;
grant execute on function public.study_visits_read(text,text), public.study_visits_write(text,text,bigint,jsonb), public.study_visits_backup(text), public.study_visits_restore(text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
