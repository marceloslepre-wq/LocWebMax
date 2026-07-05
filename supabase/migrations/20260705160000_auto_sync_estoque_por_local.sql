-- Ensure endereco column exists on locais
ALTER TABLE public.locais ADD COLUMN IF NOT EXISTS endereco TEXT;

-- Backfill missing estoque_por_local entries for all inventory x location combinations
INSERT INTO public.estoque_por_local (inventory_id, local_id, quantidade_total, quantidade_locada)
SELECT i.id, l.id, 0, 0
FROM public.inventory i
CROSS JOIN public.locais l
WHERE NOT EXISTS (
  SELECT 1 FROM public.estoque_por_local e
  WHERE e.inventory_id = i.id AND e.local_id = l.id
)
ON CONFLICT (inventory_id, local_id) DO NOTHING;

-- Trigger: auto-create estoque_por_local entries when new location is added
CREATE OR REPLACE FUNCTION public.auto_create_stock_for_new_location()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.estoque_por_local (inventory_id, local_id, quantidade_total, quantidade_locada)
  SELECT id, NEW.id, 0, 0 FROM public.inventory
  ON CONFLICT (inventory_id, local_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_locais_insert_create_stock ON public.locais;
CREATE TRIGGER on_locais_insert_create_stock
AFTER INSERT ON public.locais
FOR EACH ROW EXECUTE FUNCTION public.auto_create_stock_for_new_location();

-- Trigger: auto-create estoque_por_local entries when new inventory is created
CREATE OR REPLACE FUNCTION public.auto_create_stock_for_new_inventory()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.estoque_por_local (inventory_id, local_id, quantidade_total, quantidade_locada)
  SELECT NEW.id, l.id, 0, 0 FROM public.locais l
  ON CONFLICT (inventory_id, local_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_inventory_insert_create_stock ON public.inventory;
CREATE TRIGGER on_inventory_insert_create_stock
AFTER INSERT ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.auto_create_stock_for_new_inventory();

-- Ensure RLS policies allow authenticated users full access and anon read
DROP POLICY IF EXISTS "authenticated_all" ON public.estoque_por_local;
CREATE POLICY "authenticated_all" ON public.estoque_por_local
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_estoque" ON public.estoque_por_local;
CREATE POLICY "anon_select_estoque" ON public.estoque_por_local
  FOR SELECT TO anon USING (true);
