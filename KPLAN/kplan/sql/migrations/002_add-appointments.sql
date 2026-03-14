-- Migration: appointments table (run in Supabase SQL Editor if not already applied)
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
