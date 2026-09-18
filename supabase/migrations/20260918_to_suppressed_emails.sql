-- Applied to project pytbtuzeeguqgrhszmpr on 2026-09-18 as migration "to_suppressed_emails".
-- Generic unsubscribe list for Tier One Outreach. One row per email address, lowercased.
-- Written only by the unsub-email edge function with the service role.
create table if not exists public.to_suppressed_emails (
  email text primary key check (email = lower(btrim(email)) and email <> ''),
  suppressed_at timestamptz not null default now()
);

alter table public.to_suppressed_emails enable row level security;

-- Admins can read the list. Agents cannot read it directly.
drop policy if exists to_suppressed_admin_read on public.to_suppressed_emails;
create policy to_suppressed_admin_read on public.to_suppressed_emails
  for select using (public.to_is_admin());

-- Agents ask about their own contacts only: returns the suppressed addresses among the emails
-- passed in, and only where the address belongs to one of the caller's contacts.
create or replace function public.to_suppressed_among(emails text[])
returns setof text
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.email
  from public.to_suppressed_emails s
  where s.email = any (select lower(btrim(e)) from unnest(emails) e)
    and exists (
      select 1 from public.to_contacts c
      where c.agent_id = auth.uid() and lower(btrim(c.email)) = s.email
    );
$$;

revoke all on function public.to_suppressed_among(text[]) from public, anon;
grant execute on function public.to_suppressed_among(text[]) to authenticated;
