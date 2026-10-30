-- Run once in the Supabase SQL editor after resuming the project.
-- Only the server-side service role can access these synthetic records.
begin;

create table if not exists public.database_healthchecks (
  check_date date primary key,
  random_value uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.database_healthchecks enable row level security;
revoke all on table public.database_healthchecks from public, anon, authenticated;
grant select, insert, delete on table public.database_healthchecks to service_role;

create or replace function public.record_database_healthcheck()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  -- A retry or manual run on the same date cannot create duplicate entries.
  insert into public.database_healthchecks (check_date)
  values (today)
  on conflict (check_date) do nothing;

  -- Retain only the most recent 30 calendar days of synthetic entries.
  delete from public.database_healthchecks
  where check_date < today - 29;
end;
$$;

revoke all on function public.record_database_healthcheck() from public, anon, authenticated;
grant execute on function public.record_database_healthcheck() to service_role;

commit;
