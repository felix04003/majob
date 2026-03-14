-- Migration: Add Canva/custom image support to events table
-- Run this in the Supabase SQL editor

-- Store the Canva design ID (if created via Canva)
ALTER TABLE events ADD COLUMN IF NOT EXISTS canva_design_id text;

-- Store the exported image URL for the invitation header
ALTER TABLE events ADD COLUMN IF NOT EXISTS invitation_image_url text;

-- Create storage bucket for invitation images (run once)
INSERT INTO storage.buckets (id, name, public)
VALUES ('invitation-images', 'invitation-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to invitation images
CREATE POLICY IF NOT EXISTS "Public read invitation images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'invitation-images');

-- Allow authenticated uploads to invitation images
CREATE POLICY IF NOT EXISTS "Authenticated upload invitation images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invitation-images');

-- Allow authenticated deletes
CREATE POLICY IF NOT EXISTS "Authenticated delete invitation images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'invitation-images');
