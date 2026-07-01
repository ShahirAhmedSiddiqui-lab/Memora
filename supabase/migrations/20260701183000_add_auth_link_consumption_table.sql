create table if not exists public.auth_link_consumption (
  id uuid primary key default gen_random_uuid(),
  link_hash text not null,
  link_type text not null check (link_type in ('confirmation', 'recovery')),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists auth_link_consumption_link_hash_type_key
  on public.auth_link_consumption (link_hash, link_type);

create index if not exists auth_link_consumption_created_at_idx
  on public.auth_link_consumption (created_at desc);

alter table public.auth_link_consumption enable row level security;

grant select, insert on public.auth_link_consumption to anon;
grant select, insert on public.auth_link_consumption to authenticated;

drop policy if exists "auth_link_consumption_select" on public.auth_link_consumption;
create policy "auth_link_consumption_select"
on public.auth_link_consumption
for select
to anon, authenticated
using (true);

drop policy if exists "auth_link_consumption_insert" on public.auth_link_consumption;
create policy "auth_link_consumption_insert"
on public.auth_link_consumption
for insert
to anon, authenticated
with check (true);
