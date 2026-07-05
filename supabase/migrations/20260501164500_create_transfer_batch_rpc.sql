CREATE OR REPLACE FUNCTION public.transfer_inventory_batch(
  p_origin_location_id text,
  p_destination_location_id text,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_item jsonb;
  v_inventory_id uuid;
  v_quantity integer;
  v_origin_qty integer;
  v_timestamp timestamp with time zone := NOW();
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_inventory_id := (v_item->>'inventory_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    -- Check origin qty
    SELECT available_qty INTO v_origin_qty
    FROM public.inventory_locations
    WHERE inventory_id = v_inventory_id AND location_id = p_origin_location_id;

    IF v_origin_qty IS NULL OR v_origin_qty < v_quantity THEN
      RAISE EXCEPTION 'Quantidade indisponível no local de origem para o produto %', v_inventory_id;
    END IF;

    -- Update origin
    UPDATE public.inventory_locations
    SET available_qty = available_qty - v_quantity,
        quantity = quantity - v_quantity
    WHERE inventory_id = v_inventory_id AND location_id = p_origin_location_id;

    -- Update destination
    IF EXISTS (SELECT 1 FROM public.inventory_locations WHERE inventory_id = v_inventory_id AND location_id = p_destination_location_id) THEN
      UPDATE public.inventory_locations
      SET available_qty = available_qty + v_quantity,
          quantity = quantity + v_quantity
      WHERE inventory_id = v_inventory_id AND location_id = p_destination_location_id;
    ELSE
      INSERT INTO public.inventory_locations (inventory_id, location_id, quantity, available_qty, rented_qty)
      VALUES (v_inventory_id, p_destination_location_id, v_quantity, v_quantity, 0);
    END IF;

    -- Insert transfer log
    INSERT INTO public.inventory_transfers (inventory_id, origin_location_id, destination_location_id, quantity, status, created_at)
    VALUES (v_inventory_id, p_origin_location_id, p_destination_location_id, v_quantity, 'completed', v_timestamp);
  END LOOP;
END;
$function$;
