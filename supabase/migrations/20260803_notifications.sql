-- Migration: user_push_subscriptions and notifications tables
-- Run this in your Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  fcm_token text,
  endpoint text,
  keys jsonb,
  device_type text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  sender jsonb DEFAULT '{"name": "System"}'::jsonb,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);
