-- Migration: Add invitation template columns to events table
-- Run this in the Supabase SQL editor

ALTER TABLE events ADD COLUMN IF NOT EXISTS invitation_template text NOT NULL DEFAULT 'elegant-classic';
ALTER TABLE events ADD COLUMN IF NOT EXISTS invitation_custom jsonb DEFAULT '{}'::jsonb;
