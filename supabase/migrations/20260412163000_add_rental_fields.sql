DO $DO_BLOCK$
BEGIN
  ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS monthly_price NUMERIC DEFAULT 0;
  ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS daily_price NUMERIC DEFAULT 0;
  
  ALTER TABLE public.rentals ADD COLUMN IF NOT EXISTS contract_number TEXT;
  
  CREATE SEQUENCE IF NOT EXISTS public.rental_contract_seq START 1;
END $DO_BLOCK$;

CREATE OR REPLACE FUNCTION public.set_contract_number()
RETURNS TRIGGER AS $FUNC$
BEGIN
  IF NEW.contract_number IS NULL THEN
    NEW.contract_number := 'LC' || LPAD(nextval('public.rental_contract_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$FUNC$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_contract_number ON public.rentals;
CREATE TRIGGER trg_set_contract_number
BEFORE INSERT ON public.rentals
FOR EACH ROW EXECUTE FUNCTION public.set_contract_number();

-- Update existing rentals with contract number if they don't have one
DO $DO_BLOCK$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.rentals WHERE contract_number IS NULL ORDER BY created_at ASC LOOP
    UPDATE public.rentals SET contract_number = 'LC' || LPAD(nextval('public.rental_contract_seq')::text, 3, '0') WHERE id = r.id;
  END LOOP;
END $DO_BLOCK$;
