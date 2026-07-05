CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matricula TEXT NOT NULL,
  name TEXT NOT NULL,
  document TEXT NOT NULL,
  phone_res TEXT,
  phone_cell TEXT,
  phone_com TEXT,
  email TEXT,
  address JSONB,
  has_different_delivery_address BOOLEAN DEFAULT false,
  delivery_address JSONB,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fix RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select" ON public.customers;
CREATE POLICY "authenticated_select" ON public.customers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert" ON public.customers;
CREATE POLICY "authenticated_insert" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update" ON public.customers;
CREATE POLICY "authenticated_update" ON public.customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete" ON public.customers;
CREATE POLICY "authenticated_delete" ON public.customers FOR DELETE TO authenticated USING (true);

-- Allow anonymous inserts for the public customer form
DROP POLICY IF EXISTS "anon_insert" ON public.customers;
CREATE POLICY "anon_insert" ON public.customers FOR INSERT TO anon WITH CHECK (true);
