create or replace function sunday_private.redeem_invite_private(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_subject uuid := auth.uid();
  v_profile uuid;
begin
  if v_subject is null or p_code !~ '^[a-z0-9]+_[a-z0-9]+$' then
    raise sqlstate '22023';
  end if;

  select id into v_profile
  from sunday_private.kenshi_profiles
  where invite_code_hash = extensions.digest(lower(btrim(p_code)), 'sha256');

  if v_profile is null then
    raise sqlstate 'P0002';
  end if;

  insert into sunday_private.profile_sessions(profile_id, auth_subject_id)
  values(v_profile, v_subject)
  on conflict (auth_subject_id) do update
  set profile_id = excluded.profile_id,
      last_seen_at = now();

  return sunday_private.profile_json(v_profile, true);
end
$$;
