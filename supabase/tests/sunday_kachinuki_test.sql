begin;
select plan(41);

select has_table('sunday_private', 'kenshi_profiles', 'Sunday profiles use standalone private storage');
select has_table('sunday_private', 'game_sessions', 'Sunday owns an isolated game session');
select has_table('sunday_private', 'team_matches', 'Sunday owns isolated TeamMatches');
select has_column('sunday_private', 'kenshi_profiles', 'nickname', 'profiles retain the on-site nickname');
select is((select count(*) from sunday_private.kenshi_profiles), 8::bigint, 'synthetic seed keeps eight demo profile cards');
select is((select count(*) from sunday_private.kenshi_profiles where invite_code_hash is not null), 8::bigint, 'every demo profile receives an invite code');
select is((select count(distinct invite_code_hash) from sunday_private.kenshi_profiles where invite_code_hash is not null), 8::bigint, 'demo invite codes have no collision');
select is((select count(*) from sunday_private.game_sessions where state='lobby'), 1::bigint, 'seed creates one Sunday lobby');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='sunday_private.team_matches'::regclass), 'game storage enables and forces RLS');
select ok(not has_table_privilege('authenticated','sunday_private.kenshi_profiles','select'), 'authenticated callers cannot bypass profile RPCs');
select ok(not has_function_privilege('anon','public.redeem_sunday_invite(text)'::regprocedure,'execute'), 'unauthenticated callers cannot redeem an invite');
select ok(to_regprocedure('public.register_sunday_profile(text,text,text,integer,text)') is not null, 'fast registration is exposed through one narrow RPC');
select ok(not has_function_privilege('anon','public.register_sunday_profile(text,text,text,integer,text)'::regprocedure,'execute'), 'unauthenticated callers cannot fast register');
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

select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(public.redeem_sunday_invite('one_demo')->>'name','Demo Kenshi One','invite redirects to the matching profile');
select lives_ok($$ select public.set_sunday_ready(true,'94000000-0000-4000-8000-000000000001') $$,'first Kenshi becomes Ready');
reset role;

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
select lives_ok($$ select public.start_sunday_session('95000000-0000-4000-8000-000000000001') $$,'host starts exact-six formation');
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

select is((select count(*) from pg_proc join pg_namespace on pg_namespace.oid=pg_proc.pronamespace where nspname='sunday_private' and proname like '%recover%'),0::bigint,'Sunday has no recovery function');

select * from finish();
rollback;
