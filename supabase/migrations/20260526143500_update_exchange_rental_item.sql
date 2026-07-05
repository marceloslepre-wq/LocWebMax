CREATE OR REPLACE FUNCTION public.exchange_rental_item(
  p_rental_id uuid,
  p_old_inventory_id uuid,
  p_new_inventory_id uuid,
  p_quantity integer,
  p_new_expected_return_date date,
  p_difference_to_pay numeric,
  p_exchange_history_data jsonb
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_rental record;
  v_items jsonb;
  v_new_items jsonb;
  v_item jsonb;
  v_found boolean := false;
  v_new_inventory record;
  v_location_id text;
BEGIN
  -- 1. Get Rental
  SELECT * INTO v_rental FROM public.rentals WHERE id = p_rental_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Locação não encontrada'; END IF;
  
  v_location_id := v_rental.pickup_location_id;

  -- 2. Update Inventory (Old)
  UPDATE public.inventory 
  SET available_qty = available_qty + p_quantity,
      rented_qty = GREATEST(0, rented_qty - p_quantity)
  WHERE id = p_old_inventory_id;
  
  IF v_location_id IS NOT NULL THEN
    UPDATE public.inventory_locations
    SET available_qty = available_qty + p_quantity,
        rented_qty = GREATEST(0, rented_qty - p_quantity)
    WHERE inventory_id = p_old_inventory_id AND location_id = v_location_id;
  END IF;

  -- 3. Update Inventory (New)
  SELECT * INTO v_new_inventory FROM public.inventory WHERE id = p_new_inventory_id FOR UPDATE;
  IF v_new_inventory.available_qty < p_quantity THEN
    RAISE EXCEPTION 'Quantidade indisponível para o novo produto';
  END IF;
  
  UPDATE public.inventory 
  SET available_qty = GREATEST(0, available_qty - p_quantity),
      rented_qty = rented_qty + p_quantity
  WHERE id = p_new_inventory_id;
  
  IF v_location_id IS NOT NULL THEN
    UPDATE public.inventory_locations
    SET available_qty = GREATEST(0, available_qty - p_quantity),
        rented_qty = rented_qty + p_quantity
    WHERE inventory_id = p_new_inventory_id AND location_id = v_location_id;
  END IF;

  -- 4. Update items JSON in rental
  v_items := v_rental.items;
  v_new_items := '[]'::jsonb;
  
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    IF ((v_item->>'inventoryId' IS NOT NULL AND (v_item->>'inventoryId')::uuid = p_old_inventory_id) 
        OR 
        (v_item->>'inventory_id' IS NOT NULL AND (v_item->>'inventory_id')::uuid = p_old_inventory_id) 
        OR 
        (v_item->>'itemId' IS NOT NULL AND (v_item->>'itemId')::uuid = p_old_inventory_id) 
        OR 
        (v_item->>'id' IS NOT NULL AND (v_item->>'id')::uuid = p_old_inventory_id)) 
       AND NOT v_found THEN
      
      v_item := jsonb_build_object(
        'itemId', p_new_inventory_id,
        'inventoryId', p_new_inventory_id,
        'inventory_id', p_new_inventory_id,
        'id', p_new_inventory_id,
        'name', v_new_inventory.name,
        'quantity', p_quantity,
        'dailyPrice', v_new_inventory.daily_price,
        'monthlyPrice', v_new_inventory.monthly_price
      );
      v_found := true;
    END IF;
    v_new_items := v_new_items || v_item;
  END LOOP;
  
  IF NOT v_found THEN RAISE EXCEPTION 'Produto antigo não encontrado na locação'; END IF;
  
  -- 5. Update Rental
  UPDATE public.rentals
  SET items = v_new_items,
      expected_return_date = p_new_expected_return_date,
      total = total + p_difference_to_pay
  WHERE id = p_rental_id;
  
  -- 6. Insert History
  INSERT INTO public.exchange_history (
    rental_id, old_inventory_id, new_inventory_id, 
    exchange_date, days_used, days_remaining, 
    available_credit, new_cost, difference_to_pay, extra_days
  ) VALUES (
    p_rental_id, p_old_inventory_id, p_new_inventory_id,
    NOW(),
    (p_exchange_history_data->>'days_used')::int,
    (p_exchange_history_data->>'days_remaining')::int,
    (p_exchange_history_data->>'available_credit')::numeric,
    (p_exchange_history_data->>'new_cost')::numeric,
    p_difference_to_pay,
    (p_exchange_history_data->>'extra_days')::int
  );
END;
$$;
