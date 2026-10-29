-- Allow clearing a monthly goal without changing checks or other settings.
create or replace function public.study_routine_clear_goal(p_password text,p_person text,p_month text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text;
begin
 err:=study_private.check_password(p_password);
 if err is not null then return jsonb_build_object('ok',false,'error',err); end if;
 if p_person not in ('mine','bora') or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception '이름과 월을 확인해 주세요.'; end if;
 update study_private.routine_settings set goal=null where person=p_person and month=p_month;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.study_routine_clear_goal(text,text,text) from public;
grant execute on function public.study_routine_clear_goal(text,text,text) to anon,authenticated;
notify pgrst, 'reload schema';
