-- Migration: dynamic menu system (system_routes + role.allowed_routes)
-- Run this in the Supabase SQL Editor.

-- 1. Add allowed_routes column to roles (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'allowed_routes') THEN
    ALTER TABLE public.roles ADD COLUMN allowed_routes text[] DEFAULT '{}';
  END IF;
END $$;

-- 2. Create system_routes table
CREATE TABLE IF NOT EXISTS public.system_routes (
  id text PRIMARY KEY,
  path text NOT NULL,
  name text NOT NULL,
  label text NOT NULL DEFAULT '',
  icon text DEFAULT '',
  sort integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  parent_id text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS system_routes_name_unique ON public.system_routes (name);
CREATE INDEX IF NOT EXISTS system_routes_parent_id_idx ON public.system_routes (parent_id);
CREATE INDEX IF NOT EXISTS system_routes_sort_idx ON public.system_routes (sort);
