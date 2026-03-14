-- Migration: Plan de table interactif
-- Tables pour gérer le placement des invités

-- Tables physiques (rondes, rectangulaires, etc.)
CREATE TABLE IF NOT EXISTS seating_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Table',
  shape text NOT NULL DEFAULT 'round',  -- round | rectangle | long
  capacity int NOT NULL DEFAULT 8,
  pos_x float NOT NULL DEFAULT 50,      -- position X en % du canvas (0-100)
  pos_y float NOT NULL DEFAULT 50,      -- position Y en % du canvas (0-100)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seating_tables_event ON seating_tables(event_id);

-- Assignation d'un invité à une table
CREATE TABLE IF NOT EXISTS seat_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES seating_tables(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  seat_number int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(guest_id)  -- un invité ne peut être assigné qu'à une seule table
);

CREATE INDEX IF NOT EXISTS idx_seat_assignments_table ON seat_assignments(table_id);
CREATE INDEX IF NOT EXISTS idx_seat_assignments_guest ON seat_assignments(guest_id);
