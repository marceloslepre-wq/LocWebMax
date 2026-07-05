ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS assets JSONB DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'rental_contract_seq') THEN
    CREATE SEQUENCE public.rental_contract_seq START 1;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_contract_number()
RETURNS trigger AS $$
BEGIN
  IF NEW.contract_number IS NULL THEN
    NEW.contract_number := 'LC' || LPAD(nextval('public.rental_contract_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_contract_number ON public.rentals;
CREATE TRIGGER trg_set_contract_number BEFORE INSERT ON public.rentals FOR EACH ROW EXECUTE FUNCTION public.set_contract_number();
