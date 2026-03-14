-- Kplan schema (v1) — Next.js + Supabase

-- EVENTS
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null default 'other',
  start_at timestamptz not null,
  venue_name text,
  venue_address text,
  status text not null default 'draft',
  invitation_template text not null default 'elegant-classic',
  invitation_custom jsonb default '{}'::jsonb,
  canva_design_id text,
  invitation_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CLIENT ACCESS (user-based auth per event)
create table if not exists client_access (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  is_revoked boolean not null default false,
  invited_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
-- Partial unique index: allows multiple NULL user_id rows (pending invitations)
create unique index if not exists client_access_user_event_idx
  on client_access(user_id, event_id)
  where user_id is not null;
create index if not exists client_access_user_id_idx on client_access(user_id);

-- GUESTS (liste officielle)
create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text,
  email text,
  category text default 'other',
  rsvp_status text not null default 'pending',
  rsvp_updated_at timestamptz,
  plus_one_count int not null default 0,
  allergies text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- DEMANDES CLIENT (workflow)
create table if not exists guest_changes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  guest_id uuid references guests(id) on delete set null,
  action text not null, -- create/update/delete
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending', -- pending/approved/rejected
  requested_by text not null default 'client',
  reviewed_by text,
  comment text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- INVITATIONS
create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  guest_id uuid not null references guests(id) on delete cascade,
  invite_token text not null unique,
  sent_at timestamptz,
  channel text,
  status text not null default 'created',
  created_at timestamptz not null default now()
);

-- QR PASSES
create table if not exists qr_passes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  guest_id uuid not null references guests(id) on delete cascade,
  qr_token text not null unique,
  is_active boolean not null default true,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- CHECKINS
create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  guest_id uuid references guests(id) on delete set null,
  qr_token text not null,
  result text not null, -- valid/already_checked_in/invalid/revoked
  scanned_at timestamptz not null default now()
);

-- SEATING (plan de table)
create table if not exists seating_tables (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  label text not null default 'Table',
  shape text not null default 'round',
  capacity int not null default 8,
  pos_x float not null default 50,
  pos_y float not null default 50,
  created_at timestamptz not null default now()
);

create table if not exists seat_assignments (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references seating_tables(id) on delete cascade,
  guest_id uuid not null references guests(id) on delete cascade,
  seat_number int,
  created_at timestamptz not null default now(),
  unique(guest_id)
);

-- ============================================================
-- ASSISTANT PLANNER MODULE
-- ============================================================

-- APPOINTMENTS (rendez-vous liés à un événement)
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  title text not null,
  start_at timestamptz not null,
  duration_minutes int not null default 60,
  location text,
  notes text,
  appointment_type text not null default 'other', -- rdv_client/prestataire/visite_lieu/degustation/other
  attendees text, -- texte libre (noms séparés par virgules)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_appointments_event_start on appointments(event_id, start_at);

-- MILESTONES (jalons / phases pour regrouper les tâches)
create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  description text,
  target_date timestamptz,
  position int not null default 0, -- pour l'ordre d'affichage
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_milestones_event on milestones(event_id);

-- TASKS (tâches liées à un événement)
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  milestone_id uuid references milestones(id) on delete set null,
  title text not null,
  description text,
  due_at timestamptz,
  priority text not null default 'medium', -- low/medium/high/urgent
  status text not null default 'todo', -- todo/in_progress/done
  category text, -- texte libre (ex: Traiteur, Décoration, Photo…)
  requires_client_validation boolean not null default false,
  scheduled_time time,                    -- heure prévue le jour-J (ex: 09:00)
  assigned_to text,                       -- responsable (texte libre)
  is_dayof boolean not null default false, -- flag tâche jour-J
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tasks_event_status on tasks(event_id, status);
create index if not exists idx_tasks_milestone on tasks(milestone_id);
create index if not exists idx_tasks_dayof on tasks(event_id, is_dayof) where is_dayof = true;

-- TASK COMMENTS (commentaires planner/client sur une tâche)
create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  author_type text not null, -- planner/client
  author_name text,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_comments_task on task_comments(task_id);

-- TASK VALIDATIONS (validation client des tâches clés)
create table if not exists task_validations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  status text not null default 'pending', -- pending/validated/refused
  client_comment text,
  validated_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_validations_task on task_validations(task_id);
create index if not exists idx_task_validations_event_status on task_validations(event_id, status);

-- NOTIFICATIONS (notifications in-app)
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  recipient_type text not null, -- planner/client
  type text not null, -- task_overdue/client_commented/client_validated/client_refused/appointment_reminder/task_needs_validation
  title text not null,
  message text,
  related_id uuid, -- task_id ou appointment_id concerné
  is_read boolean not null default false,
  email_sent boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_recipient_read on notifications(recipient_type, is_read);
create index if not exists idx_notifications_event on notifications(event_id);

-- ============================================================
-- INVITATION TEMPLATES (colonnes ajoutées à events)
-- ============================================================
-- À exécuter sur une base existante :
-- ALTER TABLE events ADD COLUMN IF NOT EXISTS invitation_template text NOT NULL DEFAULT 'elegant-classic';
-- ALTER TABLE events ADD COLUMN IF NOT EXISTS invitation_custom jsonb DEFAULT '{}'::jsonb;
-- ALTER TABLE events ADD COLUMN IF NOT EXISTS canva_design_id text;
-- ALTER TABLE events ADD COLUMN IF NOT EXISTS invitation_image_url text;
