-- ============================================
-- Supabase Setup SQL
-- Run this in Supabase SQL Editor to create the
-- required tables. Seed data (roles, users) is
-- managed by the app:
--   pnpm seed        (idempotent)
--   pnpm seed:reset  (wipe + reseed)
-- Source of truth: server/modules/auth/seed-data.ts
-- ============================================

-- 1. Create tables first (IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS public.roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  permissions JSONB DEFAULT '[]',
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  name TEXT NOT NULL,
  avatar TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  password TEXT NOT NULL,
  platform TEXT DEFAULT 'web',
  last_login TIMESTAMPTZ,
  last_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  role_id TEXT REFERENCES public.roles(id) ON DELETE CASCADE,
  assigned_by UUID,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  platform TEXT DEFAULT 'web',
  user_agent TEXT,
  last_ip TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: add device columns if the table was created before they existed
ALTER TABLE public.refresh_tokens ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'web';
ALTER TABLE public.refresh_tokens ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.refresh_tokens ADD COLUMN IF NOT EXISTS last_ip TEXT;
