-- Applied to project pytbtuzeeguqgrhszmpr on 2026-09-21 as migration "to_scans_and_overview".
-- QR scans, written by the r edge function. One row per scan.
create table if not exists public.to_scans (
  id uuid primary key default gen_random_uuid(),
  agent_slug text not null default '',
  marker text not null default '',
  dest text not null default '',
  user_agent text not null default '',
  scanned_at timestamptz not null default now()
);
create index if not exists to_scans_slug_idx on public.to_scans (agent_slug, scanned_at desc);

alter table public.to_scans enable row level security;

drop policy if exists to_scans_own on public.to_scans;
create policy to_scans_own on public.to_scans
  for select using (
    exists (select 1 from public.to_agents a where a.id = auth.uid() and a.slug <> '' and a.slug = to_scans.agent_slug)
  );

drop policy if exists to_scans_admin_read on public.to_scans;
create policy to_scans_admin_read on public.to_scans
  for select using (public.to_is_admin());

-- One row per associate for the admin dashboard. Counts only, never contact rows, and it answers
-- nothing at all unless the caller is an admin.
create or replace function public.to_admin_overview()
returns table (
  agent_id uuid, name text, email text, slug text,
  contacts bigint, pieces bigint, email_pieces bigint, text_pieces bigint, social_pieces bigint,
  scans bigint, unsubscribed bigint, last_activity timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select
    a.id, a.name, a.email, a.slug,
    (select count(*) from public.to_contacts c where c.agent_id = a.id),
    (select count(*) from public.to_sends s where s.agent_id = a.id),
    (select count(*) from public.to_sends s where s.agent_id = a.id and s.channel like 'Email%'),
    (select count(*) from public.to_sends s where s.agent_id = a.id and s.channel = 'Text'),
    (select count(*) from public.to_sends s where s.agent_id = a.id and s.channel = 'Social'),
    (select count(*) from public.to_scans k where a.slug <> '' and k.agent_slug = a.slug),
    (select count(*) from public.to_contacts c where c.agent_id = a.id and c.unsubscribed_at is not null),
    greatest(
      (select max(s.sent_at) from public.to_sends s where s.agent_id = a.id),
      (select max(c.created_at) from public.to_contacts c where c.agent_id = a.id)
    )
  from public.to_agents a
  where public.to_is_admin()
  order by 6 desc, 2;
$$;

revoke all on function public.to_admin_overview() from public, anon;
grant execute on function public.to_admin_overview() to authenticated;
