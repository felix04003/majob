-- Migration: Checklist Jour-J
-- Ajouter colonnes pour les tâches opérationnelles du jour de l'événement

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_time time;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_dayof boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tasks_dayof ON tasks(event_id, is_dayof) WHERE is_dayof = true;
