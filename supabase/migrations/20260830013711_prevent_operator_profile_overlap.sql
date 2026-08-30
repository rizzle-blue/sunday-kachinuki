delete from sunday_private.profile_sessions profile_session
using sunday_private.operators operator
where operator.auth_subject_id = profile_session.auth_subject_id;

create or replace function sunday_private.reject_auth_role_overlap()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'profile_sessions' then
    if exists (
      select 1
      from sunday_private.operators
      where auth_subject_id = new.auth_subject_id
    ) then
      raise sqlstate '23514';
    end if;
  elsif exists (
    select 1
    from sunday_private.profile_sessions
    where auth_subject_id = new.auth_subject_id
  ) then
    raise sqlstate '23514';
  end if;

  return new;
end
$$;

create trigger sunday_profile_session_auth_role_guard
before insert or update of auth_subject_id on sunday_private.profile_sessions
for each row execute function sunday_private.reject_auth_role_overlap();

create trigger sunday_operator_auth_role_guard
before insert or update of auth_subject_id on sunday_private.operators
for each row execute function sunday_private.reject_auth_role_overlap();
