create or replace function sunday_private.get_host_console_private()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_session uuid := sunday_private.latest_session_id();
  v_match uuid;
begin
  if not sunday_private.is_host() then raise sqlstate '42501'; end if;
  select id into v_match
  from sunday_private.team_matches
  where session_id = v_session and state in ('queued', 'in_progress', 'tiebreak')
  limit 1;

  return jsonb_build_object(
    'session', sunday_private.session_json(v_session),
    'waitingCount', (
      select count(*)
      from sunday_private.session_entries
      where session_id = v_session and state in ('ready', 'waiting')
    ),
    'readyEntries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profileId', entry.profile_id,
        'name', profile.name,
        'nickname', profile.nickname,
        'dojo', profile.dojo,
        'state', entry.state,
        'version', entry.version
      ) order by entry.ready_at, entry.profile_id)
      from sunday_private.session_entries entry
      join sunday_private.kenshi_profiles profile on profile.id = entry.profile_id
      where entry.session_id = v_session and entry.state in ('ready', 'waiting')
    ), '[]'::jsonb),
    'currentMatch', case when v_match is null then null else sunday_private.match_json(v_match) end
  );
end
$$;

create or replace function sunday_private.kick_ready_entry_private(
  p_profile uuid,
  p_expected_version integer,
  p_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_subject uuid := auth.uid();
  v_session uuid := sunday_private.current_session_id();
  v_entry sunday_private.session_entries%rowtype;
  v_result jsonb;
begin
  if not sunday_private.is_host() then raise sqlstate '42501'; end if;

  select result into v_result
  from sunday_private.command_receipts
  where auth_subject_id = v_subject and idempotency_key = p_idempotency_key;
  if v_result is not null then return v_result; end if;

  if v_session is null or p_expected_version is null or p_expected_version < 1 then
    raise sqlstate '22023';
  end if;

  select * into v_entry
  from sunday_private.session_entries
  where session_id = v_session
    and profile_id = p_profile
    and version = p_expected_version
    and state in ('ready', 'waiting')
  for update;

  if not found then raise sqlstate '40001'; end if;

  delete from sunday_private.session_entries
  where session_id = v_entry.session_id and profile_id = v_entry.profile_id;

  v_result := jsonb_build_object('status', 'accepted', 'profileId', p_profile);
  insert into sunday_private.command_receipts(auth_subject_id, idempotency_key, result, created_at)
  values(v_subject, p_idempotency_key, v_result, now());
  return v_result;
end
$$;

create or replace function public.kick_sunday_ready(
  p_profile uuid,
  p_expected_version integer,
  p_idempotency_key uuid
)
returns jsonb language sql security invoker set search_path = '' as $$
  select sunday_private.kick_ready_entry_private(p_profile, p_expected_version, p_idempotency_key)
$$;

revoke all on function sunday_private.kick_ready_entry_private(uuid, integer, uuid) from public, anon;
grant execute on function sunday_private.kick_ready_entry_private(uuid, integer, uuid) to authenticated;

revoke all on function public.kick_sunday_ready(uuid, integer, uuid) from public, anon;
grant execute on function public.kick_sunday_ready(uuid, integer, uuid) to authenticated;
