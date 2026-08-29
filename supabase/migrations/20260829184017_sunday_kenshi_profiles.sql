-- Standalone Sunday-test storage. This migration belongs only to the Supabase
-- project and must not be mixed with another application's database objects.
-- migration manifest.
create schema sunday_private;
revoke all on schema sunday_private from public, anon, authenticated;

create table sunday_private.kenshi_profiles (
  id uuid primary key,
  source_roster_id text not null unique check (source_roster_id ~ '^SUNDAY-[0-9]{3}$'),
  dojo text not null check (btrim(dojo) <> '' and char_length(dojo) <= 120),
  name text not null check (btrim(name) <> '' and char_length(name) <= 120),
  dan text not null check (dan in ('under_1_dan', '1_dan', '2_dan', '3_dan', '4_dan', '5_dan', '6_dan', '7_dan', '8_dan')),
  practice_years smallint not null check (practice_years between 0 and 100),
  auth_subject_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table sunday_private.kenshi_profiles enable row level security;
alter table sunday_private.kenshi_profiles force row level security;

-- The private table is not exposed or granted to API roles. This narrowly
-- scoped RPC returns at most the profile already claimed by the current Auth
-- subject; unclaimed seed rows remain unreadable through the Data API.
create or replace function public.get_my_sunday_kenshi_profile()
returns table (
  profile_id uuid,
  dojo text,
  name text,
  dan text,
  practice_years smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id, profile.dojo, profile.name, profile.dan, profile.practice_years
  from sunday_private.kenshi_profiles profile
  where profile.auth_subject_id = auth.uid()
$$;

revoke all on function public.get_my_sunday_kenshi_profile() from public, anon;
grant execute on function public.get_my_sunday_kenshi_profile() to authenticated;
