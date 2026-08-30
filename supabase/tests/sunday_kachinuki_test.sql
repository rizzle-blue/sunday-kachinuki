begin;
select plan(69);

select has_table('sunday_private', 'kenshi_profiles', 'Sunday profiles use standalone private storage');
select has_table('sunday_private', 'game_sessions', 'Sunday owns an isolated game session');
select has_table('sunday_private', 'team_matches', 'Sunday owns isolated TeamMatches');
select has_table('sunday_private', 'result_excluded_matches', 'achievement report exclusions are explicit and session-scoped');
select has_column('sunday_private', 'kenshi_profiles', 'nickname', 'profiles retain the on-site nickname');
select is((select count(*) from sunday_private.kenshi_profiles), 8::bigint, 'synthetic seed keeps eight demo profile cards');
select is((select count(*) from sunday_private.kenshi_profiles where invite_code_hash is not null), 8::bigint, 'every demo profile receives an invite code');
select is((select count(distinct invite_code_hash) from sunday_private.kenshi_profiles where invite_code_hash is not null), 8::bigint, 'demo invite codes have no collision');
select is((select count(*) from sunday_private.game_sessions where state='lobby'), 1::bigint, 'seed creates one Sunday lobby');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='sunday_private.team_matches'::regclass), 'game storage enables and forces RLS');
select ok(not has_table_privilege('authenticated','sunday_private.kenshi_profiles','select'), 'authenticated callers cannot bypass profile RPCs');
select ok(not has_function_privilege('anon','public.redeem_sunday_invite(text)'::regprocedure,'execute'), 'unauthenticated callers cannot redeem an invite');
select ok(to_regprocedure('public.register_sunday_profile(text,text,text,integer,text)') is not null, 'fast registration is exposed through one narrow RPC');
select ok(to_regprocedure('public.kick_sunday_ready(uuid,integer,uuid)') is not null, 'host kick-ready is exposed through one narrow RPC');
select ok(to_regprocedure('public.get_my_sunday_result()') is not null, 'individual result is exposed through one narrow RPC');
select ok(not has_function_privilege('anon','public.register_sunday_profile(text,text,text,integer,text)'::regprocedure,'execute'), 'unauthenticated callers cannot fast register');
select ok(not has_function_privilege('anon','public.get_my_sunday_result()'::regprocedure,'execute'), 'unauthenticated callers cannot read a result');
select hasnt_table('public','kenshi_profiles','profile storage is not exposed as a public table');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,is_anonymous)
select
  ('93000000-0000-4000-8000-'||lpad(number::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated',
  case when number=99 then 'host@sunday.test' else null end,
  '',now(),now(),now(),number<>99
from unnest(array[1,2,3,4,5,6,7,8,99]) number;

insert into sunday_private.operators(auth_subject_id,role)
values('93000000-0000-4000-8000-000000000099','host_recorder');

select throws_ok(
  $$ insert into sunday_private.profile_sessions(profile_id,auth_subject_id) values('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000099') $$,
  '23514',
  '23514',
  'host Auth subject cannot link to a Kenshi profile'
);

select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(public.redeem_sunday_invite('one_demo')->>'name','Demo Kenshi One','invite redirects to the matching profile');
select lives_ok($$ select public.set_sunday_ready(true,'94000000-0000-4000-8000-000000000001') $$,'first Kenshi becomes Ready');
reset role;

select throws_ok(
  $$ insert into sunday_private.operators(auth_subject_id,role) values('93000000-0000-4000-8000-000000000001','host_recorder') $$,
  '23514',
  '23514',
  'Kenshi Auth subject cannot become a host operator'
);

select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000008',true);
set local role authenticated;
select throws_ok($$ select public.register_sunday_profile('Walkin Kenshi','Walkin','Shakaijin',1,'9_dan') $$,'22023','22023','fast registration rejects an unknown Dan');
select is(public.register_sunday_profile('Walkin Kenshi','Walkin','Shakaijin',1,'under_1_dan')->>'nickname','Walkin','fast registration creates a private profile');
select is(public.register_sunday_profile('Changed Name','Changed','Other Dojo',9,'3_dan')->>'name','Walkin Kenshi','retry returns the already-linked profile');
reset role;

select is((select count(*) from sunday_private.kenshi_profiles where registration_source='fast'),1::bigint,'one fast-registration profile is stored');

select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000007',true);
set local role authenticated;
select is(public.redeem_sunday_invite('one_demo')->>'profileId','91000000-0000-4000-8000-000000000001','reusable code links another phone to the same profile');
select lives_ok($$ select public.set_sunday_ready(true,'94000000-0000-4000-8000-000000000007') $$,'duplicate phone Ready is profile-idempotent');
select is(public.redeem_sunday_invite('two_demo')->>'name','Demo Kenshi Two','a phone can switch to another valid invite');
reset role;
select is((select count(*) from sunday_private.profile_sessions where auth_subject_id='93000000-0000-4000-8000-000000000007'),1::bigint,'invite switch reuses one phone session link');
set local role authenticated;
select is(public.redeem_sunday_invite('one_demo')->>'name','Demo Kenshi One','a phone can switch back without a new Auth session');
reset role;

do $$
declare item record; codes text[]:=array['two_demo','three_demo','four_demo','five_demo','six_demo'];
begin
  for item in select number from generate_series(2,6) number loop
    perform set_config('request.jwt.claim.sub','93000000-0000-4000-8000-'||lpad(item.number::text,12,'0'),true);
    execute 'set local role authenticated';
    perform public.redeem_sunday_invite(codes[item.number-1]);
    perform public.set_sunday_ready(true,('94000000-0000-4000-8000-'||lpad(item.number::text,12,'0'))::uuid);
    execute 'reset role';
  end loop;
end
$$;

select is((select count(*) from sunday_private.profile_sessions),8::bigint,'eight phone sessions link to seven profiles');
select is((select count(*) from sunday_private.session_entries),6::bigint,'Ready remains unique per profile');

select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000099',true);
set local role authenticated;
select is(jsonb_array_length(public.get_sunday_host_console()->'readyEntries'),6,'host console lists six removable Ready entries');
select set_config('sunday.kick_profile',public.get_sunday_host_console()->'readyEntries'->0->>'profileId',true);
select set_config('sunday.kick_version',public.get_sunday_host_console()->'readyEntries'->0->>'version',true);
reset role;
select set_config('sunday.kick_subject',(select auth_subject_id::text from sunday_private.profile_sessions where profile_id=current_setting('sunday.kick_profile')::uuid limit 1),true);

select set_config('request.jwt.claim.sub',current_setting('sunday.kick_subject'),true);
set local role authenticated;
select throws_ok(format($$ select public.kick_sunday_ready(%L,%s,'96000000-0000-4000-8000-000000000001') $$,current_setting('sunday.kick_profile'),current_setting('sunday.kick_version')),'42501','42501','participant cannot kick a Ready Kenshi');
reset role;

select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000099',true);
set local role authenticated;
select lives_ok(format($$ select public.kick_sunday_ready(%L,%s,'96000000-0000-4000-8000-000000000002') $$,current_setting('sunday.kick_profile'),current_setting('sunday.kick_version')),'host kicks a Ready Kenshi');
select lives_ok(format($$ select public.kick_sunday_ready(%L,%s,'96000000-0000-4000-8000-000000000002') $$,current_setting('sunday.kick_profile'),current_setting('sunday.kick_version')),'kick retry returns the original receipt');
reset role;
select is((select count(*) from sunday_private.session_entries),5::bigint,'kick removes exactly one session entry');

select set_config('request.jwt.claim.sub',current_setting('sunday.kick_subject'),true);
set local role authenticated;
select lives_ok($$ select public.set_sunday_ready(true,'96000000-0000-4000-8000-000000000003') $$,'kicked Kenshi can become Ready again');
reset role;
select is((select count(*) from sunday_private.session_entries),6::bigint,'Ready count returns to six after rejoin');

select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000099',true);
set local role authenticated;
select throws_ok($$ select public.redeem_sunday_invite('one_demo') $$,'23514','23514','host cannot redeem a participant invite');
select lives_ok($$ select public.start_sunday_session('95000000-0000-4000-8000-000000000001') $$,'host starts exact-six formation');
select throws_ok(format($$ select public.kick_sunday_ready(%L,1,'96000000-0000-4000-8000-000000000004') $$,public.get_sunday_host_console()->'currentMatch'->'akaTeam'->'members'->0->>'profileId'),'40001','40001','host cannot kick an assigned Kenshi');
reset role;

select is((select count(*) from sunday_private.teams where state='active'),2::bigint,'exact-six start creates two active Team-3 rosters');
select is((select count(*) from sunday_private.team_members),6::bigint,'each Kenshi appears once in initial formation');
select is((select count(*) from sunday_private.team_matches where state='queued'),1::bigint,'one court receives one current match');

select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000099',true);
set local role authenticated;
select lives_ok(format($$ select public.start_sunday_bout(%L,1,'95000000-0000-4000-8000-000000000002') $$,public.get_sunday_host_console()->'currentMatch'->'bouts'->0->>'boutId'),'host starts the first Bout');
select lives_ok(format($$ select public.record_sunday_event(%L,2,'95000000-0000-4000-8000-000000000003','hansoku','aka',null) $$,public.get_sunday_host_console()->'currentMatch'->'bouts'->0->>'boutId'),'host records hansoku');
select lives_ok(format($$ select public.record_sunday_event(%L,3,'95000000-0000-4000-8000-000000000004','hansoku','aka',null) $$,public.get_sunday_host_console()->'currentMatch'->'bouts'->0->>'boutId'),'second hansoku is accepted');
select lives_ok(format($$ select public.record_sunday_event(%L,4,'95000000-0000-4000-8000-000000000005','point','shiro','men') $$,public.get_sunday_host_console()->'currentMatch'->'bouts'->0->>'boutId'),'point reaches first-to-two');
select lives_ok(format($$ select public.record_sunday_event(%L,4,'95000000-0000-4000-8000-000000000005','point','shiro','men') $$,public.get_sunday_host_console()->'currentMatch'->'bouts'->0->>'boutId'),'same idempotency key returns the original receipt');
reset role;

select is((select shiro_ippon from sunday_private.bouts where state='in_progress'),2::smallint,'hansoku plus Men reaches first-to-two');

select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000099',true);
set local role authenticated;
select throws_ok(format($$ select public.record_sunday_event(%L,5,'95000000-0000-4000-8000-000000000006','point','shiro','kote') $$,public.get_sunday_host_console()->'currentMatch'->'bouts'->0->>'boutId'),'40001','40001','third ippon is rejected');
select lives_ok(format($$ select public.finalize_sunday_bout(%L,5,'95000000-0000-4000-8000-000000000007') $$,public.get_sunday_host_console()->'currentMatch'->'bouts'->0->>'boutId'),'first-to-two bout finalizes');
reset role;

select is((select state from sunday_private.bouts where slot_index=0),'final','finalized bout is immutable');
select set_config('sunday.test_bout',(select id::text from sunday_private.bouts where slot_index=0),true);

select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000099',true);
set local role authenticated;
select throws_ok($$ select public.record_sunday_event(current_setting('sunday.test_bout')::uuid,6,'95000000-0000-4000-8000-000000000008','point','aka','men') $$,'40001','40001','point after finalize is rejected');
select throws_ok($$ select public.undo_sunday_event(current_setting('sunday.test_bout')::uuid,6,'95000000-0000-4000-8000-000000000009') $$,'40001','40001','undo after finalize is rejected');
reset role;

select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok($$ select public.record_sunday_event(current_setting('sunday.test_bout')::uuid,1,'95000000-0000-4000-8000-000000000010','point','aka','men') $$,'42501','42501','participant cannot score');
reset role;

insert into sunday_private.game_sessions(id,name,state,started_at,target_ends_at,completed_at,created_at)
values(
  '97000000-0000-4000-8000-000000000001',
  'Completed result fixture',
  'completed',
  '2026-08-30 03:00:00+00',
  '2026-08-30 04:00:00+00',
  '2026-08-30 04:06:00+00',
  '2026-08-30 03:00:00+00'
);

insert into sunday_private.session_entries(session_id,profile_id,state)
select '97000000-0000-4000-8000-000000000001',('91000000-0000-4000-8000-'||lpad(number::text,12,'0'))::uuid,'playing'
from generate_series(1,6) number;

insert into sunday_private.teams(id,session_id,generation,label,accent,state)
values
  ('97100000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001',1,'Indigo Tora','#315C8A','disbanded'),
  ('97100000-0000-4000-8000-000000000002','97000000-0000-4000-8000-000000000001',1,'Crimson Kitsune','#C1272D','disbanded');

insert into sunday_private.team_members(team_id,profile_id,position,slot_index)
values
  ('97100000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','senpo',0),
  ('97100000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','chuken',1),
  ('97100000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003','taisho',2),
  ('97100000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000004','senpo',0),
  ('97100000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000005','chuken',1),
  ('97100000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000006','taisho',2);

insert into sunday_private.team_matches(id,session_id,sequence,aka_team_id,shiro_team_id,state,winner_team_id,started_at,finalized_at)
values
  ('97200000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001',1,'97100000-0000-4000-8000-000000000001','97100000-0000-4000-8000-000000000002','final','97100000-0000-4000-8000-000000000001','2026-08-30 03:05:00+00','2026-08-30 03:11:00+00'),
  ('97200000-0000-4000-8000-000000000002','97000000-0000-4000-8000-000000000001',2,'97100000-0000-4000-8000-000000000001','97100000-0000-4000-8000-000000000002','final','97100000-0000-4000-8000-000000000002','2026-08-30 03:15:00+00','2026-08-30 03:16:00+00');

insert into sunday_private.bouts(id,team_match_id,slot_index,position,aka_profile_id,shiro_profile_id,state,aka_ippon,shiro_ippon,winner_side,started_at,finalized_at)
values
  ('97300000-0000-4000-8000-000000000001','97200000-0000-4000-8000-000000000001',0,'senpo','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000004','final',2,1,'aka','2026-08-30 03:05:00+00','2026-08-30 03:07:00+00'),
  ('97300000-0000-4000-8000-000000000002','97200000-0000-4000-8000-000000000001',1,'chuken','91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000005','final',0,1,'shiro','2026-08-30 03:07:00+00','2026-08-30 03:09:00+00'),
  ('97300000-0000-4000-8000-000000000003','97200000-0000-4000-8000-000000000001',2,'taisho','91000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000006','final',1,0,'aka','2026-08-30 03:09:00+00','2026-08-30 03:11:00+00'),
  ('97300000-0000-4000-8000-000000000004','97200000-0000-4000-8000-000000000002',0,'senpo','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000004','final',1,2,'shiro','2026-08-30 03:15:00+00','2026-08-30 03:15:20+00'),
  ('97300000-0000-4000-8000-000000000005','97200000-0000-4000-8000-000000000002',1,'chuken','91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000005','final',0,2,'shiro','2026-08-30 03:15:20+00','2026-08-30 03:15:40+00'),
  ('97300000-0000-4000-8000-000000000006','97200000-0000-4000-8000-000000000002',2,'taisho','91000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000006','final',0,2,'shiro','2026-08-30 03:15:40+00','2026-08-30 03:16:00+00');

insert into sunday_private.bout_events(bout_id,sequence,kind,side,waza,recorded_by)
values
  ('97300000-0000-4000-8000-000000000001',1,'point','aka','men','93000000-0000-4000-8000-000000000099'),
  ('97300000-0000-4000-8000-000000000001',2,'point','aka','kote','93000000-0000-4000-8000-000000000099'),
  ('97300000-0000-4000-8000-000000000001',3,'point','shiro','do','93000000-0000-4000-8000-000000000099'),
  ('97300000-0000-4000-8000-000000000004',1,'point','aka','men','93000000-0000-4000-8000-000000000099'),
  ('97300000-0000-4000-8000-000000000004',2,'point','shiro','tsuki','93000000-0000-4000-8000-000000000099'),
  ('97300000-0000-4000-8000-000000000004',3,'point','shiro','tsuki','93000000-0000-4000-8000-000000000099');

insert into sunday_private.result_excluded_matches(match_id,reason)
values('97200000-0000-4000-8000-000000000002','fixture recording error');

select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((public.get_my_sunday_result()->'summary'->>'matchesPlayed')::integer,1,'result counts only the valid TeamMatch');
select is((public.get_my_sunday_result()->'summary'->>'formationCount')::integer,1,'result counts distinct valid Team-3 formations');
select is((public.get_my_sunday_result()->'summary'->>'winRate')::numeric,100.0::numeric,'result derives win rate from valid matches');
select is((public.get_my_sunday_result()->'summary'->>'excludedMatches')::integer,1,'result reports the Tsuki match exclusion');
select is((public.get_my_sunday_result()->'summary'->>'ipponScored')::integer,2,'result excludes ippon from the invalid match');
select is(public.get_my_sunday_result()->'summary'->'pointsByWaza','{"men": 1, "kote": 1, "do": 0, "tsuki": 0}'::jsonb,'result exposes all Kendo waza while invalid Tsuki stays zero');
select is(jsonb_array_length(public.get_my_sunday_result()->'history'),1,'result history omits the entire Tsuki match');
select is(public.get_my_sunday_result()->'history'->0->>'opponentName','Demo Kenshi Four','result history is scoped to the signed-in profile');
reset role;

delete from sunday_private.result_excluded_matches where match_id='97200000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select is((public.get_my_sunday_result()->'summary'->'pointsByWaza'->>'tsuki')::integer,2,'valid Tsuki remains countable outside the event-specific exclusion');
reset role;
insert into sunday_private.result_excluded_matches(match_id,reason)
values('97200000-0000-4000-8000-000000000002','fixture recording error');

select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000099',true);
set local role authenticated;
select throws_ok($$ select public.get_my_sunday_result() $$,'P0002','P0002','host cannot read a participant result');
reset role;

select is((select count(*) from pg_proc join pg_namespace on pg_namespace.oid=pg_proc.pronamespace where nspname='sunday_private' and proname like '%recover%'),0::bigint,'Sunday has no recovery function');

select * from finish();
rollback;
