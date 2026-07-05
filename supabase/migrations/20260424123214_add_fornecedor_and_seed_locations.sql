ALTER TABLE public.patrimonio ADD COLUMN IF NOT EXISTS fornecedor TEXT;

DO $$
DECLARE
  v_id uuid;
  v_locs jsonb;
BEGIN
  SELECT id, locations INTO v_id, v_locs FROM public.settings LIMIT 1;
  
  IF v_id IS NOT NULL AND (v_locs IS NULL OR jsonb_array_length(v_locs) = 0) THEN
    UPDATE public.settings
    SET locations = '[
      {"id": "loc-1", "name": "Galpão", "address": "Galpão Principal"},
      {"id": "loc-2", "name": "Loja Vitória", "address": "Vitória/ES"},
      {"id": "loc-3", "name": "Loja Cariacica", "address": "Cariacica/ES"},
      {"id": "loc-4", "name": "Loja Vila Velha", "address": "Vila Velha/ES"}
    ]'::jsonb
    WHERE id = v_id;
  END IF;
END $$;
