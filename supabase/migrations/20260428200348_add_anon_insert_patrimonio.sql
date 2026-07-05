DO $$
BEGIN
  DROP POLICY IF EXISTS "anon_insert" ON public.patrimonio;
  CREATE POLICY "anon_insert" ON public.patrimonio
    FOR INSERT TO anon WITH CHECK (true);
END $$;
