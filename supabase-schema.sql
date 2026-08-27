-- Studio Hub schema — isolated in its own Postgres schema so it never
-- touches the tables your weed tracker or ledger app already use in this
-- same Supabase project. See SUPABASE_MULTI_APP.md for why this is safe.

create schema if not exists studio_hub;

create table if not exists studio_hub.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists studio_hub.entries (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null default 'app' check (entry_type in ('app', 'project', 'note')),
  title text not null,
  url text,
  category_id uuid references studio_hub.categories(id) on delete set null,
  status text,
  tags text[] not null default '{}',
  custom_fields jsonb not null default '{}'::jsonb,
  pinned boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists studio_hub.linked_docs (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references studio_hub.entries(id) on delete cascade,
  title text not null,
  url text not null,
  doc_type text not null default 'link',
  created_at timestamptz not null default now()
);

-- Row Level Security, scoped only to these three tables in this schema.
alter table studio_hub.categories enable row level security;
alter table studio_hub.entries enable row level security;
alter table studio_hub.linked_docs enable row level security;

-- No login for this dashboard (personal use) — anon key gets full access,
-- but ONLY to studio_hub tables. Nothing outside this schema is touched.
drop policy if exists "anon full access" on studio_hub.categories;
drop policy if exists "anon full access" on studio_hub.entries;
drop policy if exists "anon full access" on studio_hub.linked_docs;
create policy "anon full access" on studio_hub.categories for all using (true) with check (true);
create policy "anon full access" on studio_hub.entries for all using (true) with check (true);
create policy "anon full access" on studio_hub.linked_docs for all using (true) with check (true);

grant usage on schema studio_hub to anon, authenticated;
grant all on all tables in schema studio_hub to anon, authenticated;
alter default privileges in schema studio_hub grant all on tables to anon, authenticated;

-- Storage bucket for uploaded files on linked docs — its own bucket, its
-- own policy scoped by bucket_id, so it never touches files belonging to
-- any other app using this same Supabase project.
insert into storage.buckets (id, name, public)
values ('studio-hub-files', 'studio-hub-files', true)
on conflict (id) do nothing;

drop policy if exists "studio hub files anon access" on storage.objects;
create policy "studio hub files anon access"
on storage.objects for all
using (bucket_id = 'studio-hub-files')
with check (bucket_id = 'studio-hub-files');

-- This whole file is safe to re-run any time (idempotent) — do that
-- whenever it changes rather than hand-picking new lines.
--
-- After running this file in the Supabase SQL editor, one manual step:
-- Settings -> API -> Data API -> "Exposed schemas" -> add studio_hub.
-- The REST API only serves schemas listed there.
