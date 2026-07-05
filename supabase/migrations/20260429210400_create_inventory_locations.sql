CREATE TABLE IF NOT EXISTS public.inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID REFERENCES public.inventory(id) ON DELETE CASCADE NOT NULL,
  location_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  rented_qty INTEGER NOT NULL DEFAULT 0,
  available_qty INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(inventory_id, location_id)
);

ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select" ON public.inventory_locations;
CREATE POLICY "anon_select" ON public.inventory_locations FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "authenticated_all" ON public.inventory_locations;
CREATE POLICY "authenticated_all" ON public.inventory_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);
