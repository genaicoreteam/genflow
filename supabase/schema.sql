-- ============================================================
-- GenFlow — Supabase schema (v2, safe to re-run any number of times).
-- Run the whole file in the SQL editor. Then create a private Storage
-- bucket named "recordings".
-- ============================================================
create extension if not exists "pgcrypto";

-- People -------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text not null default '',
  phone text default '',
  phone_verified boolean default false,
  role text not null default 'member'
    check (role in ('core_team','manager','team_lead','process_coordinator','admin','member')),
  reports_to uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists role_assignments (
  email text primary key,
  role text not null default 'member'
    check (role in ('core_team','manager','team_lead','process_coordinator','admin','member'))
);

-- Work ---------------------------------------------------------
create table if not exists portfolios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text default '#2F63F6',
  sort int default 0
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios(id) on delete cascade,
  name text not null,
  prefix text not null default 'PRJ',
  color text default '#1D4ED8',
  sort int default 0
);

-- Customisable pipeline stages, per project (Nifty "statuses")
create table if not exists stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  color text not null default '#2F63F6',
  sort int not null default 0
);

-- Portfolio access for Admins AND Members
create table if not exists portfolio_members (
  portfolio_id uuid references portfolios(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  primary key (portfolio_id, profile_id)
);

-- Project-level access grants (finer than portfolio)
create table if not exists project_members (
  project_id uuid references projects(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  primary key (project_id, profile_id)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  code text not null,
  title text not null,
  stage text not null,
  status text not null default 'open' check (status in ('open','completed')),
  due_at timestamptz,
  assignee uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  origin_task uuid references tasks(id) on delete set null,
  content_type text,
  completed_at timestamptz,
  created_at timestamptz default now()
);
alter table tasks drop constraint if exists tasks_stage_check;

-- Stage hand-off automation (existing feature)
create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  from_stage text not null,
  to_stage text not null,
  new_assignee uuid references profiles(id) on delete set null,
  due_offset_hours int not null default 24,
  active boolean default true,
  created_at timestamptz default now()
);
alter table automation_rules drop constraint if exists automation_rules_from_stage_check;
alter table automation_rules drop constraint if exists automation_rules_to_stage_check;

-- Nifty-style logic automations: When <trigger> → Then <actions[]>
create table if not exists logic_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,  -- null = workspace-wide
  trigger text not null check (trigger in
    ('task_created','task_completed','moved_to_stage','task_overdue','assignee_changed','task_unassigned')),
  trigger_stage text,
  actions jsonb not null default '[]',
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists discussions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  author uuid references profiles(id) on delete set null,
  body text not null,
  task_code text,
  created_at timestamptz default now()
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  target_date date,
  done boolean default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);
alter table goals add column if not exists scope text default 'org';         -- personal | org
alter table goals add column if not exists portfolio_id uuid references portfolios(id) on delete set null;
alter table goals add column if not exists project_id uuid references projects(id) on delete set null;

create table if not exists project_docs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  body text default '',
  created_by uuid references profiles(id) on delete set null,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  path text not null,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- Notifications (in-app inbox + unread bell) --------------------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text default '',
  link text,
  read boolean default false,
  created_at timestamptz default now()
);

-- People operations ---------------------------------------------
create table if not exists org_rules (
  id uuid primary key default gen_random_uuid(),
  cutoff_hours int not null default 2,
  monthly_limit int not null default 3
);

create table if not exists time_permissions (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('early_leave','late_coming')),
  for_date date not null,
  at_time text not null,
  reason text default '',
  status text not null default 'open' check (status in ('open','approved','rejected')),
  flag_late boolean default false,
  flag_over_limit boolean default false,
  decided_by uuid references profiles(id) on delete set null,
  lead_decided_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references profiles(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  reason text default '',
  proof_url text,
  admin_status text not null default 'open' check (admin_status in ('open','approved','rejected')),
  team_lead_status text not null default 'open' check (team_lead_status in ('open','approved','rejected')),
  created_at timestamptz default now()
);
alter table leave_requests add column if not exists leave_type text default 'full';  -- full | half
alter table leave_requests add column if not exists half_which text;                 -- first | second

create table if not exists warnings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'manual' check (kind in ('task_update','admin_assignment','manual')),
  level int not null default 1,
  note text default '',
  sent_via text default 'in-app',
  created_at timestamptz default now()
);

create table if not exists adhoc_requests (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references profiles(id) on delete cascade,
  routed_to uuid references profiles(id) on delete set null,
  message text not null,
  status text default 'open' check (status in ('open','approved','rejected')),
  created_at timestamptz default now()
);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

-- Meetings --------------------------------------------------------
create table if not exists recordus_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  day date not null,
  transcript text default '',
  audio_path text,
  folder text,
  meeting_type text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists midday_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  day date not null,
  transcript text default '',
  audio_path text,
  folder text,
  meeting_type text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists meeting_attendance (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  meeting_type text not null check (meeting_type in ('standup','learning_hour')),
  profile_id uuid not null references profiles(id) on delete cascade,
  marked_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- Clockify: link a GenFlow account to its identifier (email OR name)
-- in the external attendance database.
create table if not exists attendance_map (
  profile_id uuid primary key references profiles(id) on delete cascade,
  att_identifier text not null
);

-- Clockify fallback table (used only when the second Supabase project
-- is not configured).
create table if not exists office_punches (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  day date not null,
  in_time text,
  out_time text
);

-- Configurable approval routing per request type -------------------
create table if not exists approval_routes (
  request_type text primary key,     -- time_permission | leave_admin | leave_team_lead | adhoc_member | adhoc_admin
  mode text not null default 'reports_to' check (mode in ('reports_to','role','person')),
  role_target text,
  person_target uuid references profiles(id) on delete set null
);

-- Feature-access matrix (role → feature). Rows override built-in defaults.
create table if not exists feature_permissions (
  feature text not null,
  role text not null,
  allowed boolean not null default true,
  primary key (feature, role)
);

-- Saved filters for reporting: users can save named filter JSON
create table if not exists saved_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  filters jsonb not null,
  is_private boolean default true,
  created_at timestamptz default now()
);

-- Indexes useful for reporting queries
create index if not exists tasks_project_idx on tasks (project_id);
create index if not exists tasks_assignee_idx on tasks (assignee);
create index if not exists tasks_stage_idx on tasks (stage);

-- ============================================================
-- DE-DUPLICATION + UNIQUENESS (fixes repeated TELUGU / TAMIL)
-- ============================================================
do $$
declare r record; keep_id uuid;
begin
  for r in select name from portfolios group by name having count(*) > 1 loop
    select p.id into keep_id
      from portfolios p left join projects pr on pr.portfolio_id = p.id
      where p.name = r.name
      group by p.id order by count(pr.id) desc, p.id limit 1;
    update projects set portfolio_id = keep_id
      where portfolio_id in (select id from portfolios where name = r.name and id <> keep_id);
    delete from portfolio_members pm
      where pm.portfolio_id in (select id from portfolios where name = r.name and id <> keep_id)
        and exists (select 1 from portfolio_members k where k.portfolio_id = keep_id and k.profile_id = pm.profile_id);
    update portfolio_members set portfolio_id = keep_id
      where portfolio_id in (select id from portfolios where name = r.name and id <> keep_id);
    delete from portfolios where name = r.name and id <> keep_id;
  end loop;
end $$;

do $$
declare r record; keep_id uuid;
begin
  for r in select portfolio_id, name from projects group by portfolio_id, name having count(*) > 1 loop
    select id into keep_id from projects where portfolio_id = r.portfolio_id and name = r.name order by id limit 1;
    update tasks set project_id = keep_id
      where project_id in (select id from projects where portfolio_id = r.portfolio_id and name = r.name and id <> keep_id);
    delete from projects where portfolio_id = r.portfolio_id and name = r.name and id <> keep_id;
  end loop;
end $$;

create unique index if not exists portfolios_name_ux on portfolios (name);
create unique index if not exists projects_pf_name_ux on projects (portfolio_id, name);

-- ============================================================
-- RLS: authenticated users can read/write (app enforces role logic)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','role_assignments','portfolios','projects','stages','portfolio_members','project_members',
    'tasks','automation_rules','logic_rules','discussions','goals','project_docs','project_files',
    'notifications','org_rules','time_permissions','leave_requests','warnings','adhoc_requests','feedback',
    'recordus_meetings','midday_meetings','meeting_attendance','attendance_map','office_punches',
    'approval_routes','feature_permissions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "authenticated all" on %I', t);
    execute format('create policy "authenticated all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.role_assignments
  where email = lower(new.email)
  limit 1;

  insert into public.profiles (id, email, full_name, phone, phone_verified, role, reports_to)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(lower(new.email), '@', 1)),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    false,
    coalesce(v_role, 'member'),
    null
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(trim(profiles.full_name), ''), nullif(trim(excluded.full_name), ''), split_part(lower(excluded.email), '@', 1)),
        phone = coalesce(profiles.phone, excluded.phone),
        role = coalesce(profiles.role, excluded.role);

  update public.profiles
  set full_name = coalesce(nullif(trim(full_name), ''), split_part(lower(email), '@', 1))
  where id = new.id and trim(coalesce(full_name, '')) = '';

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================
-- SEEDS (idempotent)
-- ============================================================
update public.profiles
set full_name = coalesce(nullif(trim(full_name), ''), split_part(lower(email), '@', 1))
where trim(coalesce(full_name, '')) = '';

insert into org_rules (cutoff_hours, monthly_limit)
select 2, 3 where not exists (select 1 from org_rules);

insert into portfolios (name, sort)
select v.name, v.sort from (values ('TELUGU',0),('TAMIL',1)) v(name, sort)
where not exists (select 1 from portfolios p where p.name = v.name);

insert into projects (portfolio_id, name, prefix, sort)
select p.id, v.name, v.prefix, v.sort
from portfolios p
join (values
  ('TELUGU','College Dost Telugu','CDT',0),
  ('TELUGU','Gully College','GC',1),
  ('TELUGU','Pariksha TV','PTV',2),
  ('TELUGU','Voice of Students','VOS',3),
  ('TELUGU','Iconic Faculty','IF',4),
  ('TELUGU','Career Call','CC',5),
  ('TELUGU','IT Mentor Committee','ITM',6),
  ('TELUGU','demo','DMO',7),
  ('TAMIL','College Dost Tamil','CDTM',0)
) as v(pfname, name, prefix, sort) on p.name = v.pfname
where not exists (select 1 from projects pr where pr.portfolio_id = p.id and pr.name = v.name);

-- Default 4-stage pipeline for every project that has no stages yet
insert into stages (project_id, name, color, sort)
select p.id, s.name, s.color, s.sort
from projects p
cross join (values ('scripting','#D97706',0),('thumbnail','#059669',1),('editing','#7C3AED',2),('posting','#DB2777',3)) s(name, color, sort)
where not exists (select 1 from stages st where st.project_id = p.id);

-- Classic hand-off chain (workspace-wide)
insert into automation_rules (project_id, from_stage, to_stage, due_offset_hours, active)
select null, v.f, v.t, 24, true
from (values ('scripting','thumbnail'),('thumbnail','editing'),('editing','posting')) v(f, t)
where not exists (select 1 from automation_rules ar where ar.from_stage = v.f and ar.to_stage = v.t and ar.project_id is null);

-- Default approval routing (matches the built-in hierarchy behaviour)
insert into approval_routes (request_type, mode, role_target)
select v.rt, v.mode, v.role from (values
  ('time_permission','reports_to', null),
  ('leave_admin','reports_to', null),
  ('leave_team_lead','role','team_lead'),
  ('adhoc_member','reports_to', null),
  ('adhoc_admin','role','team_lead')
) v(rt, mode, role)
where not exists (select 1 from approval_routes r where r.request_type = v.rt);
