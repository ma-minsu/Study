-- Validate the existing shared PIN at personal-study entry without exposing protected data.
create or replace function study_private.personal_study_verify(p_password text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare err text;
begin
 err:=study_private.check_password(p_password);
 if err is not null then return jsonb_build_object('ok',false,'error',err);end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function study_private.personal_study_verify(text) from public;
grant execute on function study_private.personal_study_verify(text) to anon,authenticated;
create function public.study_personal_study_verify(p_password text)
returns jsonb language sql security invoker set search_path='' as $$
 select study_private.personal_study_verify(p_password)
$$;
revoke all on function public.study_personal_study_verify(text) from public;
grant execute on function public.study_personal_study_verify(text) to anon,authenticated;
notify pgrst,'reload schema';
