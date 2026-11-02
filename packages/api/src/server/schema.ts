/** Idempotent schema, applied on the first request of every server instance. */
export const SCHEMA = `
create table if not exists team (
  id int primary key,
  node text,
  state jsonb not null default '{}',
  step int not null default 0,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Teams used to be created in the admin with a name and a start; now both come from the story.
alter table team drop column if exists name;
alter table team drop column if exists start_node;
alter table team alter column id drop default;
alter table team add column if not exists started_at timestamptz;

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

create table if not exists reading (
  id bigserial primary key,
  team_id int not null references team (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null
);
create index if not exists reading_team on reading (team_id);
`;
