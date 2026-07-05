-- Function to auto-generate matricula for customers
CREATE OR REPLACE FUNCTION public.set_customer_matricula()
 RETURNS trigger AS $function$
DECLARE
  next_val INT;
BEGIN
  IF NEW.matricula IS NULL OR NEW.matricula = '' OR NEW.matricula = 'AUTO' THEN
    SELECT MAX(NULLIF(regexp_replace(matricula, '\D', '', 'g'), '')::INT) 
    INTO next_val 
    FROM public.customers;
    
    IF next_val IS NULL THEN
      NEW.matricula := '0001';
    ELSE
      NEW.matricula := LPAD((next_val + 1)::text, 4, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

-- Trigger to execute before insert
DROP TRIGGER IF EXISTS trg_set_customer_matricula ON public.customers;
CREATE TRIGGER trg_set_customer_matricula
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_customer_matricula();
