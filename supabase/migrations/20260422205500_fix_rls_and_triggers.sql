-- Make set_customer_matricula SECURITY DEFINER to fix mobile signup errors
CREATE OR REPLACE FUNCTION public.set_customer_matricula()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

-- Ensure RLS allows the required access
DROP POLICY IF EXISTS "anon_insert" ON public.customers;
CREATE POLICY "anon_insert" ON public.customers FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select" ON public.customers;
CREATE POLICY "anon_select" ON public.customers FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "authenticated_insert" ON public.customers;
CREATE POLICY "authenticated_insert" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_select" ON public.customers;
CREATE POLICY "authenticated_select" ON public.customers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_update" ON public.customers;
CREATE POLICY "authenticated_update" ON public.customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete" ON public.customers;
CREATE POLICY "authenticated_delete" ON public.customers FOR DELETE TO authenticated USING (true);

-- Inventory RLS
DROP POLICY IF EXISTS "anon_select" ON public.inventory;
CREATE POLICY "anon_select" ON public.inventory FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "authenticated_all" ON public.inventory;
CREATE POLICY "authenticated_all" ON public.inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_insert" ON public.inventory;
CREATE POLICY "anon_insert" ON public.inventory FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update" ON public.inventory;
CREATE POLICY "anon_update" ON public.inventory FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Ensure settings, profiles, rentals have standard policies
DROP POLICY IF EXISTS "authenticated_all" ON public.settings;
CREATE POLICY "authenticated_all" ON public.settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select" ON public.settings;
CREATE POLICY "anon_select" ON public.settings FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "authenticated_all" ON public.profiles;
CREATE POLICY "authenticated_all" ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all" ON public.rentals;
CREATE POLICY "authenticated_all" ON public.rentals FOR ALL TO authenticated USING (true) WITH CHECK (true);
