DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public) 
  VALUES ('documentos_clientes', 'documentos_clientes', true)
  ON CONFLICT (id) DO UPDATE SET public = true;
END $$;

DROP POLICY IF EXISTS "public_read_documentos" ON storage.objects;
CREATE POLICY "public_read_documentos" ON storage.objects 
  FOR SELECT USING (bucket_id = 'documentos_clientes');

DROP POLICY IF EXISTS "anon_insert_documentos" ON storage.objects;
CREATE POLICY "anon_insert_documentos" ON storage.objects 
  FOR INSERT WITH CHECK (bucket_id = 'documentos_clientes');

DROP POLICY IF EXISTS "anon_delete_documentos" ON storage.objects;
CREATE POLICY "anon_delete_documentos" ON storage.objects 
  FOR DELETE USING (bucket_id = 'documentos_clientes');
