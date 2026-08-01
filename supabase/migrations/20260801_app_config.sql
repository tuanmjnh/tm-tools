-- Migration: app_config table for unified system config storage
-- Run this in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.app_config (
  id text PRIMARY KEY,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Seed the default row so getSystemConfig can always return a value
INSERT INTO public.app_config (id, values, updated_at)
VALUES ('main', '{}'::jsonb, now())
ON CONFLICT (id) DO NOTHING;
