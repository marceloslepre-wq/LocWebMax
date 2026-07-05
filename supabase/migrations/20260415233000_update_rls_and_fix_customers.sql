-- Fix RLS for customers table to allow anon select for matricula generation
DROP POLICY IF EXISTS "anon_select" ON public.customers;
CREATE POLICY "anon_select" ON public.customers FOR SELECT TO anon USING (true);
