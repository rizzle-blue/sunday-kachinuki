create table sunday_private.result_excluded_matches (
  match_id uuid primary key references sunday_private.team_matches(id) on delete cascade,
  reason text not null check (btrim(reason) <> ''),
  excluded_at timestamptz not null default now()
);

alter table sunday_private.result_excluded_matches enable row level security;
alter table sunday_private.result_excluded_matches force row level security;

insert into sunday_private.result_excluded_matches(match_id, reason)
select distinct match.id, '31/08 recording error'
from sunday_private.team_matches match
join sunday_private.bouts bout on bout.team_match_id = match.id
join sunday_private.bout_events event on event.bout_id = bout.id
where match.session_id = '83000000-0000-4000-8000-000000000001'
  and event.kind = 'point'
  and event.waza = 'tsuki'
  and event.reversed_at is null
on conflict (match_id) do nothing;

create or replace function sunday_private.get_result_private()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile uuid := sunday_private.my_profile_id();
  v_session uuid;
  v_result jsonb;
begin
  if v_profile is null then
    raise sqlstate 'P0002';
  end if;

  select session.id
  into v_session
  from sunday_private.game_sessions session
  join sunday_private.session_entries entry
    on entry.session_id = session.id
   and entry.profile_id = v_profile
  where session.state = 'completed'
  order by session.completed_at desc nulls last, session.created_at desc
  limit 1;

  if v_session is null then
    raise sqlstate 'P0002';
  end if;

  with invalid_matches as (
    select excluded.match_id as id
    from sunday_private.result_excluded_matches excluded
    join sunday_private.team_matches match on match.id = excluded.match_id
    where match.session_id = v_session
  ),
  participant_matches as (
    select
      match.*,
      case
        when exists (
          select 1
          from sunday_private.team_members member
          where member.team_id = match.aka_team_id
            and member.profile_id = v_profile
        ) then match.aka_team_id
        else match.shiro_team_id
      end as team_id,
      case
        when exists (
          select 1
          from sunday_private.team_members member
          where member.team_id = match.aka_team_id
            and member.profile_id = v_profile
        ) then match.shiro_team_id
        else match.aka_team_id
      end as opponent_team_id
    from sunday_private.team_matches match
    where match.session_id = v_session
      and match.state = 'final'
      and not exists (select 1 from invalid_matches invalid where invalid.id = match.id)
      and exists (
        select 1
        from sunday_private.team_members member
        where member.profile_id = v_profile
          and member.team_id in (match.aka_team_id, match.shiro_team_id)
      )
  ),
  participant_bouts as (
    select
      bout.*,
      match.sequence as match_sequence,
      match.winner_team_id,
      match.team_id,
      match.opponent_team_id,
      case when bout.aka_profile_id = v_profile then 'aka' else 'shiro' end as participant_side
    from sunday_private.bouts bout
    join participant_matches match on match.id = bout.team_match_id
    where bout.state = 'final'
      and v_profile in (bout.aka_profile_id, bout.shiro_profile_id)
  )
  select jsonb_build_object(
    'session', (
      select jsonb_build_object(
        'sessionId', session.id,
        'name', session.name,
        'startedAt', session.started_at,
        'completedAt', session.completed_at,
        'durationMinutes', round((extract(epoch from (session.completed_at - session.started_at)) / 60.0)::numeric, 1)
      )
      from sunday_private.game_sessions session
      where session.id = v_session
    ),
    'summary', jsonb_build_object(
      'matchesPlayed', (select count(*) from participant_matches),
      'formationCount', (select count(distinct match.team_id) from participant_matches match),
      'teamWins', (select count(*) from participant_matches match where match.winner_team_id = match.team_id),
      'teamLosses', (select count(*) from participant_matches match where match.winner_team_id is not null and match.winner_team_id <> match.team_id),
      'winRate', coalesce(round(
        (select count(*) from participant_matches match where match.winner_team_id = match.team_id)::numeric * 100.0
        / nullif((select count(*) from participant_matches), 0),
        1
      ), 0),
      'boutsFought', (select count(*) from participant_bouts),
      'boutWins', (
        select count(*)
        from participant_bouts bout
        where (bout.participant_side = 'aka' and bout.aka_ippon > bout.shiro_ippon)
           or (bout.participant_side = 'shiro' and bout.shiro_ippon > bout.aka_ippon)
      ),
      'boutLosses', (
        select count(*)
        from participant_bouts bout
        where (bout.participant_side = 'aka' and bout.aka_ippon < bout.shiro_ippon)
           or (bout.participant_side = 'shiro' and bout.shiro_ippon < bout.aka_ippon)
      ),
      'boutDraws', (select count(*) from participant_bouts bout where bout.aka_ippon = bout.shiro_ippon),
      'ipponScored', (
        select coalesce(sum(case when bout.participant_side = 'aka' then bout.aka_ippon else bout.shiro_ippon end), 0)
        from participant_bouts bout
      ),
      'ipponConceded', (
        select coalesce(sum(case when bout.participant_side = 'aka' then bout.shiro_ippon else bout.aka_ippon end), 0)
        from participant_bouts bout
      ),
      'hansoku', (
        select coalesce(sum(case when bout.participant_side = 'aka' then bout.aka_hansoku else bout.shiro_hansoku end), 0)
        from participant_bouts bout
      ),
      'pointsByWaza', jsonb_build_object(
        'men', (
          select count(*) from sunday_private.bout_events event join participant_bouts bout on bout.id = event.bout_id
          where event.kind = 'point' and event.side = bout.participant_side and event.waza = 'men' and event.reversed_at is null
        ),
        'kote', (
          select count(*) from sunday_private.bout_events event join participant_bouts bout on bout.id = event.bout_id
          where event.kind = 'point' and event.side = bout.participant_side and event.waza = 'kote' and event.reversed_at is null
        ),
        'do', (
          select count(*) from sunday_private.bout_events event join participant_bouts bout on bout.id = event.bout_id
          where event.kind = 'point' and event.side = bout.participant_side and event.waza = 'do' and event.reversed_at is null
        ),
        'tsuki', (
          select count(*) from sunday_private.bout_events event join participant_bouts bout on bout.id = event.bout_id
          where event.kind = 'point' and event.side = bout.participant_side and event.waza = 'tsuki' and event.reversed_at is null
        )
      ),
      'excludedMatches', (select count(*) from invalid_matches)
    ),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'matchSequence', bout.match_sequence,
        'teamLabel', team.label,
        'opponentTeamLabel', opponent_team.label,
        'teamResult', case when bout.winner_team_id = bout.team_id then 'win' else 'loss' end,
        'position', bout.position,
        'opponentName', opponent.name,
        'boutResult', case
          when bout.aka_ippon = bout.shiro_ippon then 'draw'
          when (bout.participant_side = 'aka' and bout.aka_ippon > bout.shiro_ippon)
            or (bout.participant_side = 'shiro' and bout.shiro_ippon > bout.aka_ippon) then 'win'
          else 'loss'
        end,
        'ipponFor', case when bout.participant_side = 'aka' then bout.aka_ippon else bout.shiro_ippon end,
        'ipponAgainst', case when bout.participant_side = 'aka' then bout.shiro_ippon else bout.aka_ippon end,
        'hansoku', case when bout.participant_side = 'aka' then bout.aka_hansoku else bout.shiro_hansoku end,
        'pointsByWaza', jsonb_build_object(
          'men', (select count(*) from sunday_private.bout_events event where event.bout_id = bout.id and event.kind = 'point' and event.side = bout.participant_side and event.waza = 'men' and event.reversed_at is null),
          'kote', (select count(*) from sunday_private.bout_events event where event.bout_id = bout.id and event.kind = 'point' and event.side = bout.participant_side and event.waza = 'kote' and event.reversed_at is null),
          'do', (select count(*) from sunday_private.bout_events event where event.bout_id = bout.id and event.kind = 'point' and event.side = bout.participant_side and event.waza = 'do' and event.reversed_at is null),
          'tsuki', (select count(*) from sunday_private.bout_events event where event.bout_id = bout.id and event.kind = 'point' and event.side = bout.participant_side and event.waza = 'tsuki' and event.reversed_at is null)
        )
      ) order by bout.match_sequence, bout.slot_index)
      from participant_bouts bout
      join sunday_private.teams team on team.id = bout.team_id
      join sunday_private.teams opponent_team on opponent_team.id = bout.opponent_team_id
      join sunday_private.kenshi_profiles opponent on opponent.id = case
        when bout.participant_side = 'aka' then bout.shiro_profile_id
        else bout.aka_profile_id
      end
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end
$$;

create or replace function public.get_my_sunday_result()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select sunday_private.get_result_private()
$$;

revoke all on function sunday_private.get_result_private() from public, anon;
grant execute on function sunday_private.get_result_private() to authenticated;

revoke all on function public.get_my_sunday_result() from public, anon;
grant execute on function public.get_my_sunday_result() to authenticated;
