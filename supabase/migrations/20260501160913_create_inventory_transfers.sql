CREATE TABLE IF NOT EXISTS public.inventory_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  origin_location_id TEXT NOT NULL,
  destination_location_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select" ON public.inventory_transfers;
CREATE POLICY "anon_select" ON public.inventory_transfers FOR SELECT USING (true);

DROP POLICY IF EXISTS "authenticated_all" ON public.inventory_transfers;
CREATE POLICY "authenticated_all" ON public.inventory_transfers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create transfer function
CREATE OR REPLACE FUNCTION public.transfer_inventory(
  p_inventory_id UUID,
  p_origin_location_id TEXT,
  p_destination_location_id TEXT,
  p_quantity INTEGER
) RETURNS void AS $function$
DECLARE
  v_origin_qty INTEGER;
BEGIN
  -- Check origin qty
  SELECT available_qty INTO v_origin_qty
  FROM public.inventory_locations
  WHERE inventory_id = p_inventory_id AND location_id = p_origin_location_id;

  IF v_origin_qty IS NULL OR v_origin_qty < p_quantity THEN
    RAISE EXCEPTION 'Quantidade indisponível no local de origem.';
  END IF;

  -- Update origin
  UPDATE public.inventory_locations
  SET available_qty = available_qty - p_quantity,
      quantity = quantity - p_quantity
  WHERE inventory_id = p_inventory_id AND location_id = p_origin_location_id;

  -- Update destination
  IF EXISTS (SELECT 1 FROM public.inventory_locations WHERE inventory_id = p_inventory_id AND location_id = p_destination_location_id) THEN
    UPDATE public.inventory_locations
    SET available_qty = available_qty + p_quantity,
        quantity = quantity + p_quantity
    WHERE inventory_id = p_inventory_id AND location_id = p_destination_location_id;
  ELSE
    INSERT INTO public.inventory_locations (inventory_id, location_id, quantity, available_qty, rented_qty)
    VALUES (p_inventory_id, p_destination_location_id, p_quantity, p_quantity, 0);
  END IF;

  -- Insert transfer log
  INSERT INTO public.inventory_transfers (inventory_id, origin_location_id, destination_location_id, quantity, status)
  VALUES (p_inventory_id, p_origin_location_id, p_destination_location_id, p_quantity, 'completed');
END;
$function$ LANGUAGE plpgsql SECURITY DEFINER;
