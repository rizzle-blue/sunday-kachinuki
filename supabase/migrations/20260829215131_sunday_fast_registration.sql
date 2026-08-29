alter table sunday_private.kenshi_profiles
  add column nickname text,
  add column registration_source text not null default 'roster';

update sunday_private.kenshi_profiles
set nickname = name
where nickname is null;

alter table sunday_private.kenshi_profiles
  alter column nickname set not null,
  alter column source_roster_id drop not null,
  drop constraint if exists kenshi_profiles_source_roster_id_check,
  add constraint kenshi_profiles_source_roster_id_check
    check (source_roster_id is null or source_roster_id ~ '^SUNDAY-[0-9]{3}$'),
  add constraint kenshi_profiles_nickname_check
    check (btrim(nickname) <> '' and char_length(nickname) <= 40),
  add constraint kenshi_profiles_registration_source_check
    check (registration_source in ('roster', 'fast'));

create or replace function sunday_private.profile_json(p_profile_id uuid, p_private boolean default false)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'profileId', id,
    'dojo', dojo,
    'name', name,
    'nickname', nickname,
    'dan', case when p_private then dan else null end,
    'practiceYears', case when p_private then practice_years else null end
  )) from sunday_private.kenshi_profiles where id = p_profile_id
$$;

create or replace function sunday_private.register_profile_private(
  p_name text,
  p_nickname text,
  p_dojo text,
  p_practice_years integer,
  p_dan text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_subject uuid := auth.uid();
  v_profile uuid;
  v_name text := btrim(p_name);
  v_nickname text := btrim(p_nickname);
  v_dojo text := btrim(p_dojo);
begin
  if v_subject is null then raise sqlstate '42501'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_subject::text, 8312026));
  select profile_id into v_profile
  from sunday_private.profile_sessions
  where auth_subject_id = v_subject;

  if v_profile is not null then
    update sunday_private.profile_sessions set last_seen_at = now() where auth_subject_id = v_subject;
    return sunday_private.profile_json(v_profile, true);
  end if;

  if v_name = '' or char_length(v_name) > 120
    or v_nickname = '' or char_length(v_nickname) > 40
    or v_dojo = '' or char_length(v_dojo) > 120
    or p_practice_years is null or p_practice_years not between 0 and 100
    or p_dan not in ('under_1_dan', '1_dan', '2_dan', '3_dan', '4_dan', '5_dan', '6_dan', '7_dan', '8_dan')
  then
    raise sqlstate '22023';
  end if;

  insert into sunday_private.kenshi_profiles(
    id,
    source_roster_id,
    dojo,
    name,
    nickname,
    dan,
    practice_years,
    registration_source
  ) values (
    extensions.gen_random_uuid(),
    null,
    v_dojo,
    v_name,
    v_nickname,
    p_dan,
    p_practice_years,
    'fast'
  ) returning id into v_profile;

  insert into sunday_private.profile_sessions(profile_id, auth_subject_id)
  values (v_profile, v_subject);

  return sunday_private.profile_json(v_profile, true);
end
$$;

create or replace function public.register_sunday_profile(
  p_name text,
  p_nickname text,
  p_dojo text,
  p_practice_years integer,
  p_dan text
)
returns jsonb language sql security invoker set search_path = '' as $$
  select sunday_private.register_profile_private(p_name, p_nickname, p_dojo, p_practice_years, p_dan)
$$;

revoke all on function sunday_private.register_profile_private(text, text, text, integer, text) from public, anon;
grant execute on function sunday_private.register_profile_private(text, text, text, integer, text) to authenticated;

revoke all on function public.register_sunday_profile(text, text, text, integer, text) from public, anon;
grant execute on function public.register_sunday_profile(text, text, text, integer, text) to authenticated;
