/**
 * Idempotent schema, applied on the first request of every server instance. The lock first: two
 * instances starting at once would otherwise race on `create table if not exists`.
 */
export const SCHEMA = `
select pg_advisory_xact_lock(727364001);

create table if not exists team (
  id int primary key,
  node text,
  state jsonb not null default '{}',
  revision int not null default 0,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

-- The count of a team's moves used to be its "step", which said nothing of what it counts. Each
-- statement stays on one line, as the schema is split at a semicolon ending a line.
do $$ begin if exists (select from information_schema.columns where table_schema = current_schema() and table_name = 'team' and column_name = 'step') then alter table team rename column step to revision; end if; end $$;

-- Teams used to be created in the admin with a name and a start; now both come from the story.
alter table team drop column if exists name;
alter table team drop column if exists start_node;
alter table team alter column id drop default;
alter table team add column if not exists started_at timestamptz;

-- The log of the teams' actions used to be the "step_log"; it keeps its rows under the new name.
alter table if exists step_log rename to action_log;
alter sequence if exists step_log_id_seq rename to action_log_id_seq;
alter index if exists step_log_pkey rename to action_log_pkey;
alter index if exists step_log_at rename to action_log_at;
alter index if exists step_log_team rename to action_log_team;
do $$ begin if exists (select from pg_constraint where conname = 'step_log_team_id_fkey') then alter table action_log rename constraint step_log_team_id_fkey to action_log_team_id_fkey; end if; end $$;

create table if not exists action_log (
  id bigserial primary key,
  team_id int not null references team (id) on delete cascade,
  at timestamptz not null default now(),
  action text not null,
  from_node text,
  to_node text,
  state jsonb not null
);
create index if not exists action_log_at on action_log (at desc);
-- The teams' times read each team's moves from its last move to the start on.
create index if not exists action_log_team on action_log (team_id, id);

create table if not exists session (
  id text primary key,
  team_id int not null references team (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists session_last_seen on session (last_seen_at);
alter table session add column if not exists ip text;
alter table session add column if not exists user_agent text;
alter table session add column if not exists device_id text;
create index if not exists session_device on session (device_id);

-- Phones used to report how long a text was on ("reading", later "story_interval"); the times are
-- measured by chapters now, from the action log alone.
drop table if exists story_interval;
drop table if exists reading;

-- One row: when the organisers started the game; null until then and after a new game.
create table if not exists game (
  id int primary key check (id = 1),
  started_at timestamptz
);
-- Whether the admin closed the game, a pause at any time that keeps every team's progress.
alter table game add column if not exists closed boolean not null default false;
alter table game add column if not exists closed_changed_at timestamptz;

-- The times the game was closed, so the teams' clocks can leave them out; an open one has no end.
create table if not exists game_pause (
  id bigserial primary key,
  started_at timestamptz not null,
  ended_at timestamptz
);
-- A game closed before the pauses were recorded gets its running pause, from when it closed.
insert into game_pause (started_at) select coalesce(closed_changed_at, now()) from game where closed and not exists (select from game_pause where ended_at is null);

create table if not exists admin_login (
  key text primary key,
  failures int not null default 0,
  last_at timestamptz not null default now()
);

-- Devices the admin banned, by the device's own long-lived cookie.
create table if not exists device_ban (
  device_id text primary key,
  team_id int not null,
  ip text,
  user_agent text,
  banned_at timestamptz not null default now()
);
`;
