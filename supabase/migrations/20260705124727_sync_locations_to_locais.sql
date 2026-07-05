ALTER TABLE public.locais ADD COLUMN IF NOT EXISTS endereco TEXT;

DO $$
DECLARE
  v_settings_record RECORD;
  v_loc JSONB;
  v_existing_id UUID;
  v_loc_name TEXT;
  v_loc_address TEXT;
BEGIN
  FOR v_settings_record IN SELECT locations FROM public.settings WHERE locations IS NOT NULL
  LOOP
    IF jsonb_typeof(v_settings_record.locations) = 'array' THEN
      FOR v_loc IN SELECT * FROM jsonb_array_elements(v_settings_record.locations)
      LOOP
        v_loc_name := v_loc->>'name';
        v_loc_address := v_loc->>'address';

        IF v_loc_name IS NULL OR v_loc_name = '' THEN
          CONTINUE;
        END IF;

        SELECT id INTO v_existing_id FROM public.locais WHERE nome = v_loc_name LIMIT 1;

        IF v_existing_id IS NULL THEN
          INSERT INTO public.locais (nome, ativo, endereco)
          VALUES (v_loc_name, true, v_loc_address)
          ON CONFLICT (nome) DO NOTHING;
        ELSE
          UPDATE public.locais
          SET endereco = COALESCE(endereco, v_loc_address)
          WHERE id = v_existing_id;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;
