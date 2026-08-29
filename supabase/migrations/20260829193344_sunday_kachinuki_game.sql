create extension if not exists pgcrypto with schema extensions;

alter table sunday_private.kenshi_profiles
  add column invite_code_hash bytea unique;

drop function public.get_my_sunday_kenshi_profile();
alter table sunday_private.kenshi_profiles drop column auth_subject_id;

create table sunday_private.profile_sessions (
  profile_id uuid not null references sunday_private.kenshi_profiles(id) on delete cascade,
  auth_subject_id uuid not null unique references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (profile_id, auth_subject_id)
);

create table sunday_private.game_sessions (
  id uuid primary key,
  name text not null check (btrim(name) <> ''),
  state text not null check (state in ('lobby', 'live', 'stopping', 'completed')) default 'lobby',
  seed integer not null default 8312026,
  version integer not null default 1 check (version > 0),
  started_at timestamptz,
  target_ends_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index sunday_one_open_session
  on sunday_private.game_sessions ((true))
  where state in ('lobby', 'live', 'stopping');

create table sunday_private.session_entries (
  session_id uuid not null references sunday_private.game_sessions(id) on delete cascade,
  profile_id uuid not null references sunday_private.kenshi_profiles(id) on delete restrict,
  state text not null check (state in ('ready', 'waiting', 'assigned', 'playing')) default 'ready',
  tier text not null check (tier in ('unranked', 'upper', 'lower')) default 'unranked',
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  ready_at timestamptz not null default now(),
  waiting_since timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  primary key (session_id, profile_id)
);

create table sunday_private.operators (
  auth_subject_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role = 'host_recorder'),
  created_at timestamptz not null default now()
);

create table sunday_private.teams (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references sunday_private.game_sessions(id) on delete cascade,
  generation integer not null check (generation >= 0),
  label text not null,
  accent text not null check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  state text not null check (state in ('queued', 'active', 'disbanded')) default 'queued',
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table sunday_private.team_members (
  team_id uuid not null references sunday_private.teams(id) on delete cascade,
  profile_id uuid not null references sunday_private.kenshi_profiles(id) on delete restrict,
  position text not null check (position in ('senpo', 'chuken', 'taisho')),
  slot_index smallint not null check (slot_index between 0 and 2),
  primary key (team_id, profile_id),
  unique (team_id, slot_index)
);

create table sunday_private.team_matches (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references sunday_private.game_sessions(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  aka_team_id uuid not null references sunday_private.teams(id) on delete restrict,
  shiro_team_id uuid not null references sunday_private.teams(id) on delete restrict,
  state text not null check (state in ('queued', 'in_progress', 'tiebreak', 'final')) default 'queued',
  planned_start timestamptz not null default now(),
  winner_team_id uuid references sunday_private.teams(id) on delete restrict,
  started_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, sequence),
  check (aka_team_id <> shiro_team_id)
);

create unique index sunday_one_current_match
  on sunday_private.team_matches (session_id)
  where state in ('queued', 'in_progress', 'tiebreak');

create table sunday_private.bouts (
  id uuid primary key default extensions.gen_random_uuid(),
  team_match_id uuid not null references sunday_private.team_matches(id) on delete cascade,
  slot_index smallint not null check (slot_index between 0 and 3),
  position text not null check (position in ('senpo', 'chuken', 'taisho', 'daihyo')),
  aka_profile_id uuid not null references sunday_private.kenshi_profiles(id) on delete restrict,
  shiro_profile_id uuid not null references sunday_private.kenshi_profiles(id) on delete restrict,
  state text not null check (state in ('queued', 'in_progress', 'final')) default 'queued',
  aka_ippon smallint not null default 0 check (aka_ippon between 0 and 2),
  shiro_ippon smallint not null default 0 check (shiro_ippon between 0 and 2),
  aka_hansoku smallint not null default 0 check (aka_hansoku >= 0),
  shiro_hansoku smallint not null default 0 check (shiro_hansoku >= 0),
  winner_side text check (winner_side in ('aka', 'shiro')),
  version integer not null default 1 check (version > 0),
  started_at timestamptz,
  finalized_at timestamptz,
  unique (team_match_id, slot_index),
  check (aka_profile_id <> shiro_profile_id)
);

create table sunday_private.bout_events (
  id uuid primary key default extensions.gen_random_uuid(),
  bout_id uuid not null references sunday_private.bouts(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  kind text not null check (kind in ('point', 'hansoku')),
  side text not null check (side in ('aka', 'shiro')),
  waza text check (waza in ('men', 'kote', 'do', 'tsuki')),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  reversed_at timestamptz,
  unique (bout_id, sequence),
  check ((kind = 'point') = (waza is not null))
);

create table sunday_private.command_receipts (
  auth_subject_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (auth_subject_id, idempotency_key)
);

do $$
declare relation_name text;
begin
  foreach relation_name in array array['profile_sessions','game_sessions','session_entries','operators','teams','team_members','team_matches','bouts','bout_events','command_receipts'] loop
    execute format('alter table sunday_private.%I enable row level security', relation_name);
    execute format('alter table sunday_private.%I force row level security', relation_name);
  end loop;
end
$$;

create or replace function sunday_private.my_profile_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select profile_id from sunday_private.profile_sessions where auth_subject_id = auth.uid() limit 1
$$;

create or replace function sunday_private.is_host()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from sunday_private.operators where auth_subject_id = auth.uid() and role = 'host_recorder')
$$;

create or replace function sunday_private.profile_json(p_profile_id uuid, p_private boolean default false)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'profileId', id,
    'dojo', dojo,
    'name', name,
    'dan', case when p_private then dan else null end,
    'practiceYears', case when p_private then practice_years else null end
  )) from sunday_private.kenshi_profiles where id = p_profile_id
$$;

create or replace function sunday_private.current_session_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from sunday_private.game_sessions where state in ('lobby','live','stopping') order by created_at desc limit 1
$$;

create or replace function sunday_private.latest_session_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from sunday_private.game_sessions order by created_at desc limit 1
$$;

create or replace function sunday_private.session_json(p_session_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sessionId', session.id,
    'state', session.state,
    'readyCount', (select count(*) from sunday_private.session_entries entry where entry.session_id = session.id),
    'targetEndsAt', session.target_ends_at
  ) from sunday_private.game_sessions session where session.id = p_session_id
$$;

create or replace function sunday_private.team_json(p_team_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'teamId', team.id,
    'label', team.label,
    'accent', team.accent,
    'members', coalesce((select jsonb_agg(jsonb_build_object(
      'profileId', member.profile_id,
      'name', profile.name,
      'position', member.position
    ) order by member.slot_index) from sunday_private.team_members member join sunday_private.kenshi_profiles profile on profile.id = member.profile_id where member.team_id = team.id), '[]'::jsonb)
  ) from sunday_private.teams team where team.id = p_team_id
$$;

create or replace function sunday_private.match_json(p_match_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'matchId', match.id,
    'state', match.state,
    'plannedStart', match.planned_start,
    'akaTeam', sunday_private.team_json(match.aka_team_id),
    'shiroTeam', sunday_private.team_json(match.shiro_team_id),
    'bouts', coalesce((select jsonb_agg(jsonb_build_object(
      'boutId', bout.id,
      'version', bout.version,
      'position', bout.position,
      'state', bout.state,
      'aka', jsonb_build_object('profileId', bout.aka_profile_id, 'name', aka.name, 'ippon', bout.aka_ippon, 'hansoku', bout.aka_hansoku),
      'shiro', jsonb_build_object('profileId', bout.shiro_profile_id, 'name', shiro.name, 'ippon', bout.shiro_ippon, 'hansoku', bout.shiro_hansoku),
      'startedAt', bout.started_at,
      'finalizedAt', bout.finalized_at
    ) order by bout.slot_index) from sunday_private.bouts bout join sunday_private.kenshi_profiles aka on aka.id = bout.aka_profile_id join sunday_private.kenshi_profiles shiro on shiro.id = bout.shiro_profile_id where bout.team_match_id = match.id), '[]'::jsonb)
  ) from sunday_private.team_matches match where match.id = p_match_id
$$;

create or replace function sunday_private.redeem_invite_private(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_subject uuid := auth.uid(); v_profile uuid; v_existing uuid;
begin
  if v_subject is null or p_code !~ '^[a-z0-9]+_[a-z0-9]+$' then raise sqlstate '22023'; end if;
  select profile_id into v_existing from sunday_private.profile_sessions where auth_subject_id = v_subject;
  select id into v_profile from sunday_private.kenshi_profiles where invite_code_hash = extensions.digest(lower(btrim(p_code)), 'sha256');
  if v_profile is null then raise sqlstate 'P0002'; end if;
  if v_existing is not null and v_existing <> v_profile then raise sqlstate '42501'; end if;
  insert into sunday_private.profile_sessions(profile_id, auth_subject_id) values(v_profile, v_subject)
  on conflict (auth_subject_id) do update set last_seen_at = now();
  return sunday_private.profile_json(v_profile, true);
end
$$;

create or replace function sunday_private.get_profile_private()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_profile uuid := sunday_private.my_profile_id();
begin
  if v_profile is null then raise sqlstate 'P0002'; end if;
  return sunday_private.profile_json(v_profile, true);
end
$$;

create or replace function sunday_private.set_ready_private(p_ready boolean, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_subject uuid := auth.uid(); v_profile uuid := sunday_private.my_profile_id(); v_session uuid := sunday_private.current_session_id(); v_state text; v_result jsonb;
begin
  select result into v_result from sunday_private.command_receipts where auth_subject_id=v_subject and idempotency_key=p_idempotency_key;
  if v_result is not null then return v_result; end if;
  if v_profile is null or v_session is null then raise sqlstate 'P0002'; end if;
  select state into v_state from sunday_private.game_sessions where id=v_session for update;
  if not p_ready and v_state <> 'lobby' then raise sqlstate '25006'; end if;
  if p_ready then
    insert into sunday_private.session_entries(session_id,profile_id,state) values(v_session,v_profile,case when v_state='lobby' then 'ready' else 'waiting' end)
    on conflict (session_id,profile_id) do update set state=case when sunday_private.session_entries.state in ('assigned','playing') then sunday_private.session_entries.state when v_state='lobby' then 'ready' else 'waiting' end, version=sunday_private.session_entries.version+1;
  else
    delete from sunday_private.session_entries where session_id=v_session and profile_id=v_profile;
  end if;
  v_result:=jsonb_build_object('status','accepted','ready',p_ready);
  insert into sunday_private.command_receipts values(v_subject,p_idempotency_key,v_result,now());
  return v_result;
end
$$;

create or replace function sunday_private.get_lobby_private()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_profile uuid := sunday_private.my_profile_id(); v_session uuid := sunday_private.latest_session_id(); v_entry sunday_private.session_entries%rowtype;
begin
  if v_profile is null or v_session is null then raise sqlstate 'P0002'; end if;
  select * into v_entry from sunday_private.session_entries where session_id=v_session and profile_id=v_profile;
  return jsonb_build_object(
    'session', sunday_private.session_json(v_session),
    'me', jsonb_build_object('profileId',v_profile,'ready',v_entry.profile_id is not null,'state',coalesce(v_entry.state,'ready'),'tier',coalesce(v_entry.tier,'unranked')),
    'cards', coalesce((select jsonb_agg(sunday_private.profile_json(entry.profile_id,false) order by entry.ready_at) from sunday_private.session_entries entry where entry.session_id=v_session), '[]'::jsonb)
  );
end
$$;

create or replace function sunday_private.create_team(p_session uuid, p_profiles uuid[], p_generation integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_index integer; v_labels text[]:=array['Crimson Kitsune','Indigo Tora','Jade Ryū','Golden Tanuki','Moon Usagi','Sakura Karasu']; v_accents text[]:=array['#e4572e','#315c8a','#2a9d73','#d49b2f','#7656a8','#c83e78']; v_count integer;
begin
  if cardinality(p_profiles)<>3 then raise sqlstate '22023'; end if;
  select count(*)::integer into v_count from sunday_private.teams where session_id=p_session;
  insert into sunday_private.teams(session_id,generation,label,accent) values(p_session,p_generation,v_labels[(v_count%6)+1],v_accents[(v_count%6)+1]) returning id into v_team;
  for v_index in 1..3 loop
    insert into sunday_private.team_members(team_id,profile_id,position,slot_index) values(v_team,p_profiles[v_index],(array['senpo','chuken','taisho'])[v_index],v_index-1);
    update sunday_private.session_entries set state='assigned',version=version+1 where session_id=p_session and profile_id=p_profiles[v_index];
  end loop;
  return v_team;
end
$$;

create or replace function sunday_private.create_match(p_session uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_aka uuid; v_shiro uuid; v_match uuid; v_sequence integer; v_index integer; v_aka_profile uuid; v_shiro_profile uuid; v_start timestamptz;
begin
  if exists(select 1 from sunday_private.team_matches where session_id=p_session and state in ('queued','in_progress','tiebreak')) then return null; end if;
  select id into v_aka from sunday_private.teams where session_id=p_session and state='queued' order by created_at,id limit 1;
  select id into v_shiro from sunday_private.teams where session_id=p_session and state='queued' and id<>v_aka order by created_at,id limit 1;
  if v_aka is null or v_shiro is null then return null; end if;
  select greatest(aka.available_at,shiro.available_at) into v_start from sunday_private.teams aka,sunday_private.teams shiro where aka.id=v_aka and shiro.id=v_shiro;
  select coalesce(max(sequence),0)+1 into v_sequence from sunday_private.team_matches where session_id=p_session;
  insert into sunday_private.team_matches(session_id,sequence,aka_team_id,shiro_team_id,planned_start) values(p_session,v_sequence,v_aka,v_shiro,v_start) returning id into v_match;
  update sunday_private.teams set state='active' where id in (v_aka,v_shiro);
  for v_index in 0..2 loop
    select profile_id into v_aka_profile from sunday_private.team_members where team_id=v_aka and slot_index=v_index;
    select profile_id into v_shiro_profile from sunday_private.team_members where team_id=v_shiro and slot_index=v_index;
    insert into sunday_private.bouts(team_match_id,slot_index,position,aka_profile_id,shiro_profile_id) values(v_match,v_index,(array['senpo','chuken','taisho'])[v_index+1],v_aka_profile,v_shiro_profile);
  end loop;
  return v_match;
end
$$;

create or replace function sunday_private.start_session_private(p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_subject uuid:=auth.uid(); v_session uuid:=sunday_private.current_session_id(); v_profiles uuid[]; v_count integer; v_full integer; v_index integer; v_generation integer; v_result jsonb;
begin
  if not sunday_private.is_host() then raise sqlstate '42501'; end if;
  select result into v_result from sunday_private.command_receipts where auth_subject_id=v_subject and idempotency_key=p_idempotency_key;
  if v_result is not null then return v_result; end if;
  perform 1 from sunday_private.game_sessions where id=v_session and state='lobby' for update;
  if not found then raise sqlstate '25006'; end if;
  select array_agg(profile_id order by extensions.digest(profile_id::text||seed::text,'sha256')) into v_profiles from sunday_private.session_entries cross join sunday_private.game_sessions where session_id=v_session and game_sessions.id=v_session;
  v_count:=coalesce(cardinality(v_profiles),0); if v_count<6 then raise sqlstate 'P0001' using message='minimum_six_ready'; end if;
  v_full:=(v_count/3)*3; v_generation:=1;
  update sunday_private.game_sessions set state='live',started_at=now(),target_ends_at=now()+interval '60 minutes',version=version+1 where id=v_session;
  for v_index in 1..v_full by 3 loop perform sunday_private.create_team(v_session,v_profiles[v_index:v_index+2],v_generation); end loop;
  update sunday_private.session_entries set state='waiting',waiting_since=now(),version=version+1 where session_id=v_session and profile_id=any(v_profiles[v_full+1:v_count]);
  perform sunday_private.create_match(v_session);
  v_result:=jsonb_build_object('status','accepted','sessionId',v_session);
  insert into sunday_private.command_receipts values(v_subject,p_idempotency_key,v_result,now()); return v_result;
end
$$;

create or replace function sunday_private.get_game_private()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_profile uuid:=sunday_private.my_profile_id(); v_session uuid:=sunday_private.latest_session_id(); v_entry sunday_private.session_entries%rowtype; v_team uuid; v_match uuid;
begin
  if v_profile is null or v_session is null then raise sqlstate 'P0002'; end if;
  select * into v_entry from sunday_private.session_entries where session_id=v_session and profile_id=v_profile;
  select member.team_id into v_team from sunday_private.team_members member join sunday_private.teams team on team.id=member.team_id where member.profile_id=v_profile and team.session_id=v_session and team.state<>'disbanded' order by team.created_at desc limit 1;
  select id into v_match from sunday_private.team_matches where session_id=v_session and state in ('queued','in_progress','tiebreak') limit 1;
  return jsonb_build_object('session',sunday_private.session_json(v_session),'me',jsonb_build_object('profileId',v_profile,'state',coalesce(v_entry.state,'ready'),'tier',coalesce(v_entry.tier,'unranked'),'wins',coalesce(v_entry.wins,0),'losses',coalesce(v_entry.losses,0)),'team',case when v_team is null then null else sunday_private.team_json(v_team) end,'currentMatch',case when v_match is null then null else sunday_private.match_json(v_match) end);
end
$$;

create or replace function sunday_private.get_host_console_private()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_session uuid:=sunday_private.latest_session_id(); v_match uuid;
begin
  if not sunday_private.is_host() then raise sqlstate '42501'; end if;
  select id into v_match from sunday_private.team_matches where session_id=v_session and state in ('queued','in_progress','tiebreak') limit 1;
  return jsonb_build_object('session',sunday_private.session_json(v_session),'waitingCount',(select count(*) from sunday_private.session_entries where session_id=v_session and state in ('ready','waiting')),'currentMatch',case when v_match is null then null else sunday_private.match_json(v_match) end);
end
$$;

create or replace function sunday_private.start_bout_private(p_bout uuid,p_expected_version integer,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_subject uuid:=auth.uid(); v_result jsonb; v_match uuid;
begin
  if not sunday_private.is_host() then raise sqlstate '42501'; end if;
  select result into v_result from sunday_private.command_receipts where auth_subject_id=v_subject and idempotency_key=p_idempotency_key; if v_result is not null then return v_result; end if;
  update sunday_private.bouts set state='in_progress',started_at=now(),version=version+1 where id=p_bout and version=p_expected_version and state='queued' and exists(select 1 from sunday_private.team_matches match where match.id=team_match_id and (match.planned_start<=now() or sunday_private.bouts.position='daihyo')) returning team_match_id into v_match;
  if v_match is null then raise sqlstate '40001'; end if;
  update sunday_private.team_matches set state='in_progress' where id=v_match and state='queued';
  update sunday_private.session_entries set state='playing',version=version+1 where profile_id in (select profile_id from sunday_private.team_members where team_id in (select aka_team_id from sunday_private.team_matches where id=v_match union all select shiro_team_id from sunday_private.team_matches where id=v_match)) and session_id=(select session_id from sunday_private.team_matches where id=v_match);
  update sunday_private.team_matches set state='in_progress',started_at=coalesce(started_at,now()) where id=v_match;
  update sunday_private.session_entries set state='playing',version=version+1 where profile_id in (select aka_profile_id from sunday_private.bouts where id=p_bout union select shiro_profile_id from sunday_private.bouts where id=p_bout);
  v_result:=jsonb_build_object('status','accepted'); insert into sunday_private.command_receipts values(v_subject,p_idempotency_key,v_result,now()); return v_result;
end
$$;

create or replace function sunday_private.recompute_bout(p_bout uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_aka_points integer; v_shiro_points integer; v_aka_hansoku integer; v_shiro_hansoku integer;
begin
  select count(*) filter(where kind='point' and side='aka'),count(*) filter(where kind='point' and side='shiro'),count(*) filter(where kind='hansoku' and side='aka'),count(*) filter(where kind='hansoku' and side='shiro') into v_aka_points,v_shiro_points,v_aka_hansoku,v_shiro_hansoku from sunday_private.bout_events where bout_id=p_bout and reversed_at is null;
  update sunday_private.bouts set aka_ippon=least(2,v_aka_points+(v_shiro_hansoku/2)),shiro_ippon=least(2,v_shiro_points+(v_aka_hansoku/2)),aka_hansoku=v_aka_hansoku,shiro_hansoku=v_shiro_hansoku,version=version+1 where id=p_bout;
end
$$;

create or replace function sunday_private.record_event_private(p_bout uuid,p_expected_version integer,p_idempotency_key uuid,p_kind text,p_side text,p_waza text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_subject uuid:=auth.uid(); v_result jsonb; v_sequence integer;
begin
  if not sunday_private.is_host() then raise sqlstate '42501'; end if;
  select result into v_result from sunday_private.command_receipts where auth_subject_id=v_subject and idempotency_key=p_idempotency_key; if v_result is not null then return v_result; end if;
  if p_kind not in ('point','hansoku') or p_side not in ('aka','shiro') or ((p_kind='point')<>(p_waza is not null)) or (p_waza is not null and p_waza not in ('men','kote','do','tsuki')) then raise sqlstate '22023'; end if;
  perform 1 from sunday_private.bouts where id=p_bout and version=p_expected_version and state='in_progress' and ((position='daihyo' and aka_ippon<1 and shiro_ippon<1) or (position<>'daihyo' and aka_ippon<2 and shiro_ippon<2 and started_at+interval '2 minutes'>now())) for update; if not found then raise sqlstate '40001'; end if;
  select coalesce(max(sequence),0)+1 into v_sequence from sunday_private.bout_events where bout_id=p_bout;
  insert into sunday_private.bout_events(bout_id,sequence,kind,side,waza,recorded_by) values(p_bout,v_sequence,p_kind,p_side,p_waza,v_subject);
  perform sunday_private.recompute_bout(p_bout);
  v_result:=jsonb_build_object('status','accepted'); insert into sunday_private.command_receipts values(v_subject,p_idempotency_key,v_result,now()); return v_result;
end
$$;

create or replace function sunday_private.undo_event_private(p_bout uuid,p_expected_version integer,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_subject uuid:=auth.uid(); v_result jsonb; v_event uuid;
begin
  if not sunday_private.is_host() then raise sqlstate '42501'; end if;
  select result into v_result from sunday_private.command_receipts where auth_subject_id=v_subject and idempotency_key=p_idempotency_key; if v_result is not null then return v_result; end if;
  perform 1 from sunday_private.bouts where id=p_bout and version=p_expected_version and state='in_progress' for update; if not found then raise sqlstate '40001'; end if;
  select id into v_event from sunday_private.bout_events where bout_id=p_bout and reversed_at is null order by sequence desc limit 1 for update; if v_event is null then raise sqlstate 'P0002'; end if;
  update sunday_private.bout_events set reversed_at=now() where id=v_event; perform sunday_private.recompute_bout(p_bout);
  v_result:=jsonb_build_object('status','accepted'); insert into sunday_private.command_receipts values(v_subject,p_idempotency_key,v_result,now()); return v_result;
end
$$;

create or replace function sunday_private.form_challenger(p_session uuid,p_generation integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_profiles uuid[];
begin
  select array_agg(profile_id order by waiting_since,extensions.digest(profile_id::text||p_generation::text,'sha256')) into v_profiles from (select profile_id,waiting_since from sunday_private.session_entries where session_id=p_session and state='waiting' order by waiting_since limit 3) candidates;
  if cardinality(v_profiles)<>3 then return null; end if;
  return sunday_private.create_team(p_session,v_profiles,p_generation);
end
$$;

create or replace function sunday_private.complete_match(p_match uuid,p_winner_side text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_match sunday_private.team_matches%rowtype; v_winner uuid; v_loser uuid; v_count integer; v_generation integer; v_profiles uuid[];
begin
  select * into v_match from sunday_private.team_matches where id=p_match for update;
  v_winner:=case when p_winner_side='aka' then v_match.aka_team_id else v_match.shiro_team_id end; v_loser:=case when p_winner_side='aka' then v_match.shiro_team_id else v_match.aka_team_id end;
  update sunday_private.team_matches set state='final',winner_team_id=v_winner,finalized_at=now() where id=p_match;
  update sunday_private.session_entries set tier='upper',wins=wins+1,state='assigned',version=version+1 where profile_id in (select profile_id from sunday_private.team_members where team_id=v_winner) and session_id=v_match.session_id;
  update sunday_private.session_entries set tier='lower',losses=losses+1,state='waiting',waiting_since=now(),version=version+1 where profile_id in (select profile_id from sunday_private.team_members where team_id=v_loser) and session_id=v_match.session_id;
  update sunday_private.teams set state='queued',available_at=now()+interval '2 minutes' where id=v_winner;
  update sunday_private.teams set state='disbanded' where id=v_loser;
  if (select state from sunday_private.game_sessions where id=v_match.session_id)='stopping' then update sunday_private.game_sessions set state='completed',completed_at=now(),version=version+1 where id=v_match.session_id; return; end if;
  if (select target_ends_at<=now()+interval '5 minutes' from sunday_private.game_sessions where id=v_match.session_id) then return; end if;
  select count(*) into v_count from sunday_private.session_entries where session_id=v_match.session_id;
  select coalesce(max(generation),0)+1 into v_generation from sunday_private.teams where session_id=v_match.session_id;
  if v_count=6 then
    update sunday_private.teams set state='disbanded' where session_id=v_match.session_id and state<>'disbanded';
    update sunday_private.session_entries set state='waiting',waiting_since=now(),version=version+1 where session_id=v_match.session_id;
    select array_agg(profile_id order by extensions.digest(profile_id::text||v_generation::text,'sha256')) into v_profiles from sunday_private.session_entries where session_id=v_match.session_id;
    perform sunday_private.create_team(v_match.session_id,v_profiles[1:3],v_generation); perform sunday_private.create_team(v_match.session_id,v_profiles[4:6],v_generation);
  elsif (select count(*) from sunday_private.session_entries where session_id=v_match.session_id and state='waiting')>=4 then
    perform sunday_private.form_challenger(v_match.session_id,v_generation);
  end if;
  perform sunday_private.create_match(v_match.session_id);
end
$$;

create or replace function sunday_private.finalize_bout_private(p_bout uuid,p_expected_version integer,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_subject uuid:=auth.uid(); v_result jsonb; v_bout sunday_private.bouts%rowtype; v_match sunday_private.team_matches%rowtype; v_aka_wins integer; v_shiro_wins integer; v_aka_ippon integer; v_shiro_ippon integer; v_side text;
begin
  if not sunday_private.is_host() then raise sqlstate '42501'; end if;
  select result into v_result from sunday_private.command_receipts where auth_subject_id=v_subject and idempotency_key=p_idempotency_key; if v_result is not null then return v_result; end if;
  select * into v_bout from sunday_private.bouts where id=p_bout and version=p_expected_version and state='in_progress' and (position='daihyo' or aka_ippon>=2 or shiro_ippon>=2 or started_at+interval '2 minutes'<=now()) for update; if not found then raise sqlstate '40001'; end if;
  if v_bout.position='daihyo' and v_bout.aka_ippon=v_bout.shiro_ippon then raise sqlstate 'P0001' using message='daihyo_requires_ippon'; end if;
  v_side:=case when v_bout.aka_ippon>v_bout.shiro_ippon then 'aka' when v_bout.shiro_ippon>v_bout.aka_ippon then 'shiro' else null end;
  update sunday_private.bouts set state='final',winner_side=v_side,finalized_at=now(),version=version+1 where id=p_bout;
  select * into v_match from sunday_private.team_matches where id=v_bout.team_match_id;
  if v_bout.position='daihyo' then perform sunday_private.complete_match(v_match.id,v_side);
  elsif not exists(select 1 from sunday_private.bouts where team_match_id=v_match.id and position<>'daihyo' and state<>'final') then
    select count(*) filter(where aka_ippon>shiro_ippon),count(*) filter(where shiro_ippon>aka_ippon),sum(aka_ippon),sum(shiro_ippon) into v_aka_wins,v_shiro_wins,v_aka_ippon,v_shiro_ippon from sunday_private.bouts where team_match_id=v_match.id and position<>'daihyo';
    v_side:=case when v_aka_wins>v_shiro_wins then 'aka' when v_shiro_wins>v_aka_wins then 'shiro' when v_aka_ippon>v_shiro_ippon then 'aka' when v_shiro_ippon>v_aka_ippon then 'shiro' else null end;
    if v_side is null then update sunday_private.team_matches set state='tiebreak' where id=v_match.id; else perform sunday_private.complete_match(v_match.id,v_side); end if;
  end if;
  v_result:=jsonb_build_object('status','accepted'); insert into sunday_private.command_receipts values(v_subject,p_idempotency_key,v_result,now()); return v_result;
end
$$;

create or replace function sunday_private.create_daihyo_private(p_match uuid,p_aka_profile uuid,p_shiro_profile uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_subject uuid:=auth.uid(); v_result jsonb; v_match sunday_private.team_matches%rowtype;
begin
  if not sunday_private.is_host() then raise sqlstate '42501'; end if;
  select result into v_result from sunday_private.command_receipts where auth_subject_id=v_subject and idempotency_key=p_idempotency_key; if v_result is not null then return v_result; end if;
  select * into v_match from sunday_private.team_matches where id=p_match and state='tiebreak' for update; if not found then raise sqlstate '40001'; end if;
  if not exists(select 1 from sunday_private.team_members where team_id=v_match.aka_team_id and profile_id=p_aka_profile) or not exists(select 1 from sunday_private.team_members where team_id=v_match.shiro_team_id and profile_id=p_shiro_profile) then raise sqlstate '22023'; end if;
  insert into sunday_private.bouts(team_match_id,slot_index,position,aka_profile_id,shiro_profile_id) values(p_match,3,'daihyo',p_aka_profile,p_shiro_profile);
  v_result:=jsonb_build_object('status','accepted'); insert into sunday_private.command_receipts values(v_subject,p_idempotency_key,v_result,now()); return v_result;
end
$$;

create or replace function sunday_private.stop_session_private(p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_subject uuid:=auth.uid(); v_session uuid:=sunday_private.current_session_id(); v_result jsonb;
begin
  if not sunday_private.is_host() then raise sqlstate '42501'; end if;
  select result into v_result from sunday_private.command_receipts where auth_subject_id=v_subject and idempotency_key=p_idempotency_key; if v_result is not null then return v_result; end if;
  update sunday_private.game_sessions set state=case when exists(select 1 from sunday_private.team_matches where session_id=v_session and state in ('queued','in_progress','tiebreak')) then 'stopping' else 'completed' end,completed_at=case when exists(select 1 from sunday_private.team_matches where session_id=v_session and state in ('queued','in_progress','tiebreak')) then null else now() end,version=version+1 where id=v_session;
  v_result:=jsonb_build_object('status','accepted'); insert into sunday_private.command_receipts values(v_subject,p_idempotency_key,v_result,now()); return v_result;
end
$$;

create or replace function public.redeem_sunday_invite(p_code text) returns jsonb language sql security invoker set search_path='' as $$ select sunday_private.redeem_invite_private(p_code) $$;
create or replace function public.get_my_sunday_profile() returns jsonb language sql stable security invoker set search_path='' as $$ select sunday_private.get_profile_private() $$;
create or replace function public.set_sunday_ready(p_ready boolean,p_idempotency_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select sunday_private.set_ready_private(p_ready,p_idempotency_key) $$;
create or replace function public.get_sunday_lobby() returns jsonb language sql stable security invoker set search_path='' as $$ select sunday_private.get_lobby_private() $$;
create or replace function public.get_sunday_game() returns jsonb language sql stable security invoker set search_path='' as $$ select sunday_private.get_game_private() $$;
create or replace function public.get_sunday_host_console() returns jsonb language sql stable security invoker set search_path='' as $$ select sunday_private.get_host_console_private() $$;
create or replace function public.start_sunday_session(p_idempotency_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select sunday_private.start_session_private(p_idempotency_key) $$;
create or replace function public.stop_sunday_session(p_idempotency_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select sunday_private.stop_session_private(p_idempotency_key) $$;
create or replace function public.start_sunday_bout(p_bout uuid,p_expected_version integer,p_idempotency_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select sunday_private.start_bout_private(p_bout,p_expected_version,p_idempotency_key) $$;
create or replace function public.record_sunday_event(p_bout uuid,p_expected_version integer,p_idempotency_key uuid,p_kind text,p_side text,p_waza text) returns jsonb language sql security invoker set search_path='' as $$ select sunday_private.record_event_private(p_bout,p_expected_version,p_idempotency_key,p_kind,p_side,p_waza) $$;
create or replace function public.undo_sunday_event(p_bout uuid,p_expected_version integer,p_idempotency_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select sunday_private.undo_event_private(p_bout,p_expected_version,p_idempotency_key) $$;
create or replace function public.finalize_sunday_bout(p_bout uuid,p_expected_version integer,p_idempotency_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select sunday_private.finalize_bout_private(p_bout,p_expected_version,p_idempotency_key) $$;
create or replace function public.create_sunday_daihyo(p_match uuid,p_aka_profile uuid,p_shiro_profile uuid,p_idempotency_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select sunday_private.create_daihyo_private(p_match,p_aka_profile,p_shiro_profile,p_idempotency_key) $$;

do $$
declare routine regprocedure;
begin
  foreach routine in array array[
    'sunday_private.redeem_invite_private(text)'::regprocedure,'sunday_private.get_profile_private()'::regprocedure,'sunday_private.set_ready_private(boolean,uuid)'::regprocedure,'sunday_private.get_lobby_private()'::regprocedure,'sunday_private.get_game_private()'::regprocedure,'sunday_private.get_host_console_private()'::regprocedure,'sunday_private.start_session_private(uuid)'::regprocedure,'sunday_private.stop_session_private(uuid)'::regprocedure,'sunday_private.start_bout_private(uuid,integer,uuid)'::regprocedure,'sunday_private.record_event_private(uuid,integer,uuid,text,text,text)'::regprocedure,'sunday_private.undo_event_private(uuid,integer,uuid)'::regprocedure,'sunday_private.finalize_bout_private(uuid,integer,uuid)'::regprocedure,'sunday_private.create_daihyo_private(uuid,uuid,uuid,uuid)'::regprocedure
  ] loop execute format('revoke all on function %s from public,anon; grant execute on function %s to authenticated',routine,routine); end loop;
end
$$;

grant usage on schema sunday_private to authenticated;

revoke all on function public.redeem_sunday_invite(text),public.get_my_sunday_profile(),public.set_sunday_ready(boolean,uuid),public.get_sunday_lobby(),public.get_sunday_game(),public.get_sunday_host_console(),public.start_sunday_session(uuid),public.stop_sunday_session(uuid),public.start_sunday_bout(uuid,integer,uuid),public.record_sunday_event(uuid,integer,uuid,text,text,text),public.undo_sunday_event(uuid,integer,uuid),public.finalize_sunday_bout(uuid,integer,uuid),public.create_sunday_daihyo(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.redeem_sunday_invite(text),public.get_my_sunday_profile(),public.set_sunday_ready(boolean,uuid),public.get_sunday_lobby(),public.get_sunday_game(),public.get_sunday_host_console(),public.start_sunday_session(uuid),public.stop_sunday_session(uuid),public.start_sunday_bout(uuid,integer,uuid),public.record_sunday_event(uuid,integer,uuid,text,text,text),public.undo_sunday_event(uuid,integer,uuid),public.finalize_sunday_bout(uuid,integer,uuid),public.create_sunday_daihyo(uuid,uuid,uuid,uuid) to authenticated;
