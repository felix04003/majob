-- Migration tracker: keeps record of which migrations have been applied.
-- This is the FIRST migration to run. It creates the tracking table itself.

CREATE TABLE IF NOT EXISTS _migrations (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT now()
);
