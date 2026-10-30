/** Idempotent schema, applied on the first request of every server instance. */
export const SCHEMA = `
create table if not exists draft (
  id int primary key default 1 check (id = 1),
  source text not null,
  updated_at timestamptz not null default now()
);

create table if not exists version (
  id serial primary key,
  source text not null,
  published_at timestamptz not null default now()
);

create table if not exists location (
  id int primary key check (id > 0),
  name text not null,
  kind text not null check (kind in ('progress', 'end'))
);

create table if not exists team (
  id serial primary key,
  name text not null,
  start_node text not null,
  node text,
  state jsonb not null default '{}',
  step int not null default 0,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists step_log (
  id bigserial primary key,
  team_id int not null references team (id) on delete cascade,
  at timestamptz not null default now(),
  action text not null,
  from_node text,
  to_node text,
  state jsonb not null
);
create index if not exists step_log_at on step_log (at desc);

create table if not exists session (
  id text primary key,
  team_id int not null references team (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists session_last_seen on session (last_seen_at);
`
