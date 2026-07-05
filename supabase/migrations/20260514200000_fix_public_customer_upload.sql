-- Allow anonymous users to update the customer record they just created 
-- This is necessary to attach the document URLs to the customer record after the upload finishes
DROP POLICY IF EXISTS "anon_update" ON public.customers;
CREATE POLICY "anon_update" ON public.customers 
  FOR UPDATE TO anon 
  USING (created_at > NOW() - INTERVAL '2 hours') 
  WITH CHECK (created_at > NOW() - INTERVAL '2 hours');

-- Ensure anonymous users have UPDATE access to their storage objects in case of upsert retries
DROP POLICY IF EXISTS "anon_update_documentos" ON storage.objects;
CREATE POLICY "anon_update_documentos" ON storage.objects 
  FOR UPDATE TO anon 
  USING (bucket_id = 'documentos_clientes');
