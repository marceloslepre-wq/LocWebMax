DO $$
BEGIN
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS documento_url JSONB DEFAULT '[]'::jsonb;
END $$;

INSERT INTO storage.buckets (id, name, public) VALUES ('clientes', 'clientes', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'clientes');

DROP POLICY IF EXISTS "Authenticated All" ON storage.objects;
CREATE POLICY "Authenticated All" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'clientes') WITH CHECK (bucket_id = 'clientes');
