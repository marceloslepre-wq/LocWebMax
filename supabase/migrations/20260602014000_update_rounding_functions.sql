DO $$
BEGIN
  -- Empty DO block, just for safety pattern as per instructions.
END $$;

CREATE OR REPLACE FUNCTION public.create_rental_atomic(
  p_customer_id uuid,
  p_local_retirada_id uuid,
  p_start_date date,
  p_expected_return_date date,
  p_items jsonb,
  p_payment_method text,
  p_total numeric,
  p_custom_contract_html text,
  p_contract_number text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_item jsonb;
    v_inventory_id uuid;
    v_qty int;
    v_available int;
    v_local_nome text;
    v_rental_id uuid;
    v_rounded_total numeric;
BEGIN
    -- Apply strict rounding rule: decimals < 0.5 round down, >= 0.5 round up.
    v_rounded_total := ROUND(p_total);

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        IF v_item->>'itemId' = 'freight' THEN CONTINUE; END IF;

        v_inventory_id := (v_item->>'itemId')::uuid;
        v_qty := (v_item->>'qty')::int;

        IF p_local_retirada_id IS NOT NULL THEN
            SELECT (quantidade_total - quantidade_locada) INTO v_available
            FROM public.estoque_por_local
            WHERE inventory_id = v_inventory_id AND local_id = p_local_retirada_id;
            
            IF v_available IS NULL OR v_available < v_qty THEN
                SELECT nome INTO v_local_nome FROM public.locais WHERE id = p_local_retirada_id;
                RAISE EXCEPTION 'Estoque insuficiente do item % em %', v_inventory_id, COALESCE(v_local_nome, 'local selecionado');
            END IF;

            UPDATE public.estoque_por_local
            SET quantidade_locada = quantidade_locada + v_qty, updated_at = NOW()
            WHERE inventory_id = v_inventory_id AND local_id = p_local_retirada_id;
        END IF;

        UPDATE public.inventory
        SET available_qty = GREATEST(0, available_qty - v_qty), rented_qty = rented_qty + v_qty
        WHERE id = v_inventory_id;
    END LOOP;

    INSERT INTO public.rentals (
        customer_id, local_retirada_id, start_date, expected_return_date,
        items, payment_method, total, custom_contract_html, status, contract_number
    ) VALUES (
        p_customer_id, p_local_retirada_id, p_start_date, p_expected_return_date,
        p_items, p_payment_method, v_rounded_total, p_custom_contract_html, 'Ativo', p_contract_number
    ) RETURNING id INTO v_rental_id;

    RETURN v_rental_id;
END $function$;

CREATE OR REPLACE FUNCTION public.exchange_rental_item(
  p_rental_id uuid,
  p_old_inventory_id uuid,
  p_new_inventory_id uuid,
  p_quantity integer,
  p_new_expected_return_date date,
  p_difference_to_pay numeric,
  p_exchange_history_data jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_rental record;
  v_items jsonb;
  v_new_items jsonb;
  v_item jsonb;
  v_found boolean := false;
  v_new_inventory record;
  v_location_id text;
  v_rounded_difference numeric;
BEGIN
  -- Make sure any difference injected dynamically is correctly rounded to integer.
  v_rounded_difference := ROUND(p_difference_to_pay);

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
      total = ROUND(total + v_rounded_difference)
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
    v_rounded_difference,
    (p_exchange_history_data->>'extra_days')::int
  );
END;
$function$;
