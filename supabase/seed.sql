with demo_profiles(source_number, dojo, name, dan, practice_years) as (
  values
    (1, 'Demo Dojo', 'Demo Kenshi One', '1_dan', 2),
    (2, 'Demo Dojo', 'Demo Kenshi Two', '2_dan', 4),
    (3, 'Demo Dojo', 'Demo Kenshi Three', 'under_1_dan', 1),
    (4, 'Demo Dojo', 'Demo Kenshi Four', '3_dan', 7),
    (5, 'Demo Dojo', 'Demo Kenshi Five', '1_dan', 3),
    (6, 'Demo Dojo', 'Demo Kenshi Six', '2_dan', 5),
    (7, 'Demo Dojo', 'Demo Kenshi Seven', 'under_1_dan', 1),
    (8, 'Demo Dojo', 'Demo Kenshi Eight', '1_dan', 2)
)
insert into sunday_private.kenshi_profiles(
  id,
  source_roster_id,
  dojo,
  name,
  nickname,
  dan,
  practice_years
)
select
  ('91000000-0000-4000-8000-' || lpad(source_number::text, 12, '0'))::uuid,
  'SUNDAY-' || lpad(source_number::text, 3, '0'),
  dojo,
  name,
  name,
  dan,
  practice_years
from demo_profiles
on conflict (source_roster_id) do update set
  dojo = excluded.dojo,
  name = excluded.name,
  nickname = excluded.nickname,
  dan = excluded.dan,
  practice_years = excluded.practice_years,
  updated_at = now();

with demo_invites(source_roster_id, invite_code) as (
  values
    ('SUNDAY-001', 'one_demo'),
    ('SUNDAY-002', 'two_demo'),
    ('SUNDAY-003', 'three_demo'),
    ('SUNDAY-004', 'four_demo'),
    ('SUNDAY-005', 'five_demo'),
    ('SUNDAY-006', 'six_demo'),
    ('SUNDAY-007', 'seven_demo'),
    ('SUNDAY-008', 'eight_demo')
)
update sunday_private.kenshi_profiles profile
set invite_code_hash = extensions.digest(invite.invite_code, 'sha256')
from demo_invites invite
where profile.source_roster_id = invite.source_roster_id;

insert into sunday_private.game_sessions(id, name, seed)
values('83000000-0000-4000-8000-000000000001', 'Sunday Kachinuki Demo', 8312026)
on conflict (id) do nothing;
