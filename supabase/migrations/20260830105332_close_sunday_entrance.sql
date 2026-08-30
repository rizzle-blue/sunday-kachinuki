create or replace function sunday_private.redeem_invite_private(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := auth.uid();
  v_profile uuid;
  v_existing uuid;
begin
  if v_subject is null or p_code !~ '^[a-z0-9]+_[a-z0-9]+$' then
    raise sqlstate '22023';
  end if;

  select profile_id
  into v_existing
  from sunday_private.profile_sessions
  where auth_subject_id = v_subject;

  if sunday_private.current_session_id() is null then
    if v_existing is null then
      raise sqlstate '25006' using message = 'session_ended';
    end if;

    update sunday_private.profile_sessions
    set last_seen_at = now()
    where auth_subject_id = v_subject;

    return sunday_private.profile_json(v_existing, true);
  end if;

  select id
  into v_profile
  from sunday_private.kenshi_profiles
  where invite_code_hash = extensions.digest(lower(btrim(p_code)), 'sha256');

  if v_profile is null then
    raise sqlstate 'P0002';
  end if;
  if v_existing is not null and v_existing <> v_profile then
    raise sqlstate '42501';
  end if;

  insert into sunday_private.profile_sessions(profile_id, auth_subject_id)
  values(v_profile, v_subject)
  on conflict (auth_subject_id) do update set last_seen_at = now();

  return sunday_private.profile_json(v_profile, true);
end
$$;

create or replace function sunday_private.register_profile_private(
  p_name text,
  p_nickname text,
  p_dojo text,
  p_practice_years integer,
  p_dan text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := auth.uid();
  v_profile uuid;
  v_name text := btrim(p_name);
  v_nickname text := btrim(p_nickname);
  v_dojo text := btrim(p_dojo);
begin
  if v_subject is null then
    raise sqlstate '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_subject::text, 8312026));
  select profile_id
  into v_profile
  from sunday_private.profile_sessions
  where auth_subject_id = v_subject;

  if v_profile is not null then
    update sunday_private.profile_sessions
    set last_seen_at = now()
    where auth_subject_id = v_subject;
    return sunday_private.profile_json(v_profile, true);
  end if;

  if sunday_private.current_session_id() is null then
    raise sqlstate '25006' using message = 'session_ended';
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
  values(v_profile, v_subject);

  return sunday_private.profile_json(v_profile, true);
end
$$;
