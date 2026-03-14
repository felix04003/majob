-- ============================================================
-- ASSISTANT PLANNER — 6 TABLES
-- ============================================================
--
-- À FAIRE : Copie-colle TOUT le contenu de ce fichier dans le
--           SQL Editor de ton dashboard Supabase, puis clique Run.
--           Les 6 tables seront créées d'un coup.
--
-- Lien : Supabase → ton projet → SQL Editor → New query
-- ============================================================

-- 1/6 APPOINTMENTS (rendez-vous liés à un événement)
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  title text not null,
  start_at timestamptz not null,
  duration_minutes int not null default 60,
  location text,
  notes text,
  appointment_type text not null default 'other',
  attendees text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_appointments_event_start on appointments(event_id, start_at);

-- 2/6 MILESTONES (jalons / phases pour regrouper les tâches)
create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  description text,
  target_date timestamptz,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_milestones_event on milestones(event_id);

-- 3/6 TASKS (tâches liées à un événement)
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  milestone_id uuid references milestones(id) on delete set null,
  title text not null,
  description text,
  due_at timestamptz,
  priority text not null default 'medium',
  status text not null default 'todo',
  category text,
  requires_client_validation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tasks_event_status on tasks(event_id, status);
create index if not exists idx_tasks_milestone on tasks(milestone_id);

-- 4/6 TASK COMMENTS (commentaires planner/client sur une tâche)
create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  author_type text not null,
  author_name text,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_comments_task on task_comments(task_id);

-- 5/6 TASK VALIDATIONS (validation client des tâches clés)
create table if not exists task_validations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  status text not null default 'pending',
  client_comment text,
  validated_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_validations_task on task_validations(task_id);
create index if not exists idx_task_validations_event_status on task_validations(event_id, status);

-- 6/6 NOTIFICATIONS (notifications in-app)
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  recipient_type text not null,
  type text not null,
  title text not null,
  message text,
  related_id uuid,
  is_read boolean not null default false,
  email_sent boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_recipient_read on notifications(recipient_type, is_read);
create index if not exists idx_notifications_event on notifications(event_id);

-- Vérification : lister les tables créées
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;
