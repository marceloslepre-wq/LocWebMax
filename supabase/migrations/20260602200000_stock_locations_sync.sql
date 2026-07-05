DO $$
DECLARE
  v_galpao_id uuid;
BEGIN
  -- Insert seed data for locais
  INSERT INTO public.locais (nome, ativo) VALUES
    ('Galpão', true),
    ('Loja Vitória', true),
    ('Loja Cariacica', true),
    ('Loja Vila Velha', true),
    ('Loja Serra', true)
  ON CONFLICT (nome) DO NOTHING;

  SELECT id INTO v_galpao_id FROM public.locais WHERE nome = 'Galpão' LIMIT 1;

  -- Backfill estoque_por_local for existing inventory to preserve data
  INSERT INTO public.estoque_por_local (inventory_id, local_id, quantidade_total, quantidade_locada)
  SELECT id, v_galpao_id, total_qty, rented_qty
  FROM public.inventory
  WHERE NOT EXISTS (
    SELECT 1 FROM public.estoque_por_local WHERE inventory_id = public.inventory.id
  );
END $$;

-- Create sync trigger function
CREATE OR REPLACE FUNCTION public.sync_inventory_from_locations()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.inventory
    SET 
      total_qty = (SELECT COALESCE(SUM(quantidade_total), 0) FROM public.estoque_por_local WHERE inventory_id = OLD.inventory_id),
      rented_qty = (SELECT COALESCE(SUM(quantidade_locada), 0) FROM public.estoque_por_local WHERE inventory_id = OLD.inventory_id),
      available_qty = (SELECT COALESCE(SUM(quantidade_total - quantidade_locada), 0) FROM public.estoque_por_local WHERE inventory_id = OLD.inventory_id)
    WHERE id = OLD.inventory_id;
    RETURN OLD;
  ELSE
    UPDATE public.inventory
    SET 
      total_qty = (SELECT COALESCE(SUM(quantidade_total), 0) FROM public.estoque_por_local WHERE inventory_id = NEW.inventory_id),
      rented_qty = (SELECT COALESCE(SUM(quantidade_locada), 0) FROM public.estoque_por_local WHERE inventory_id = NEW.inventory_id),
      available_qty = (SELECT COALESCE(SUM(quantidade_total - quantidade_locada), 0) FROM public.estoque_por_local WHERE inventory_id = NEW.inventory_id)
    WHERE id = NEW.inventory_id;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_estoque_change_sync_inventory ON public.estoque_por_local;
CREATE TRIGGER on_estoque_change_sync_inventory
AFTER INSERT OR UPDATE OR DELETE ON public.estoque_por_local
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_from_locations();

-- Ensure RLS allows reads
DROP POLICY IF EXISTS "anon_select_locais" ON public.locais;
CREATE POLICY "anon_select_locais" ON public.locais FOR SELECT USING (true);
DROP POLICY IF EXISTS "anon_select_estoque" ON public.estoque_por_local;
CREATE POLICY "anon_select_estoque" ON public.estoque_por_local FOR SELECT USING (true);

-- Update public_add_asset
CREATE OR REPLACE FUNCTION public.public_add_asset(p_item_id uuid, p_asset jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_galpao_id uuid;
BEGIN
  SELECT id INTO v_galpao_id FROM public.locais WHERE nome = 'Galpão' LIMIT 1;
  UPDATE public.inventory SET assets = COALESCE(assets, '[]'::jsonb) || p_asset WHERE id = p_item_id;
  IF v_galpao_id IS NOT NULL THEN
    INSERT INTO public.estoque_por_local (inventory_id, local_id, quantidade_total, quantidade_locada)
    VALUES (p_item_id, v_galpao_id, 1, 0)
    ON CONFLICT (inventory_id, local_id) DO UPDATE SET quantidade_total = public.estoque_por_local.quantidade_total + 1;
  ELSE
    UPDATE public.inventory SET total_qty = total_qty + 1, available_qty = available_qty + 1 WHERE id = p_item_id;
  END IF;
END;
$function$;

-- Update update_inventory_qty_on_patrimonio
CREATE OR REPLACE FUNCTION public.update_inventory_qty_on_patrimonio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_galpao_id uuid;
BEGIN
  SELECT id INTO v_galpao_id FROM public.locais WHERE nome = 'Galpão' LIMIT 1;
  IF TG_OP = 'INSERT' THEN
    IF v_galpao_id IS NOT NULL THEN
      INSERT INTO public.estoque_por_local (inventory_id, local_id, quantidade_total, quantidade_locada)
      VALUES (NEW.inventory_id, v_galpao_id, 1, 0)
      ON CONFLICT (inventory_id, local_id) DO UPDATE SET quantidade_total = public.estoque_por_local.quantidade_total + 1;
    ELSE
      UPDATE public.inventory SET total_qty = total_qty + 1, available_qty = available_qty + 1 WHERE id = NEW.inventory_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF v_galpao_id IS NOT NULL THEN
      UPDATE public.estoque_por_local SET quantidade_total = GREATEST(0, quantidade_total - 1) WHERE inventory_id = OLD.inventory_id AND local_id = v_galpao_id;
    ELSE
      UPDATE public.inventory SET total_qty = GREATEST(0, total_qty - 1), available_qty = GREATEST(0, available_qty - 1) WHERE id = OLD.inventory_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- Ensure create_rental_atomic updates estoque_por_local strictly
CREATE OR REPLACE FUNCTION public.create_rental_atomic(p_customer_id uuid, p_local_retirada_id uuid, p_start_date date, p_expected_return_date date, p_items jsonb, p_payment_method text, p_total numeric, p_custom_contract_html text, p_contract_number text)
 RETURNS uuid
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
    v_rounded_total := ROUND(p_total);
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        IF v_item->>'itemId' = 'freight' THEN CONTINUE; END IF;
        v_inventory_id := (v_item->>'itemId')::uuid;
        v_qty := (v_item->>'qty')::int;
        IF p_local_retirada_id IS NOT NULL THEN
            SELECT (quantidade_total - quantidade_locada) INTO v_available FROM public.estoque_por_local WHERE inventory_id = v_inventory_id AND local_id = p_local_retirada_id;
            IF v_available IS NULL OR v_available < v_qty THEN
                SELECT nome INTO v_local_nome FROM public.locais WHERE id = p_local_retirada_id;
                RAISE EXCEPTION 'Estoque insuficiente do item % em %', v_inventory_id, COALESCE(v_local_nome, 'local selecionado');
            END IF;
            UPDATE public.estoque_por_local SET quantidade_locada = quantidade_locada + v_qty, updated_at = NOW() WHERE inventory_id = v_inventory_id AND local_id = p_local_retirada_id;
        END IF;
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

-- Update return_rental_atomic to strictly use p_local_devolucao_id
CREATE OR REPLACE FUNCTION public.return_rental_atomic(p_rental_id uuid, p_local_devolucao_id uuid, p_actual_return_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_rental record;
    v_item jsonb;
    v_inventory_id uuid;
    v_qty int;
BEGIN
    SELECT * INTO v_rental FROM public.rentals WHERE id = p_rental_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Locação não encontrada'; END IF;
    IF v_rental.status = 'Devolvido' THEN RAISE EXCEPTION 'Locação já devolvida'; END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_rental.items)
    LOOP
        IF v_item->>'itemId' = 'freight' THEN CONTINUE; END IF;
        v_inventory_id := (v_item->>'itemId')::uuid;
        v_qty := (v_item->>'qty')::int;

        IF p_local_devolucao_id IS NOT NULL AND v_rental.local_retirada_id IS NOT NULL THEN
            IF p_local_devolucao_id = v_rental.local_retirada_id THEN
                UPDATE public.estoque_por_local SET quantidade_locada = GREATEST(0, quantidade_locada - v_qty) WHERE inventory_id = v_inventory_id AND local_id = p_local_devolucao_id;
            ELSE
                UPDATE public.estoque_por_local SET quantidade_total = GREATEST(0, quantidade_total - v_qty), quantidade_locada = GREATEST(0, quantidade_locada - v_qty) WHERE inventory_id = v_inventory_id AND local_id = v_rental.local_retirada_id;
                INSERT INTO public.estoque_por_local (inventory_id, local_id, quantidade_total, quantidade_locada) VALUES (v_inventory_id, p_local_devolucao_id, v_qty, 0)
                ON CONFLICT (inventory_id, local_id) DO UPDATE SET quantidade_total = public.estoque_por_local.quantidade_total + v_qty;
            END IF;
        ELSIF p_local_devolucao_id IS NOT NULL THEN
            INSERT INTO public.estoque_por_local (inventory_id, local_id, quantidade_total, quantidade_locada) VALUES (v_inventory_id, p_local_devolucao_id, v_qty, 0)
            ON CONFLICT (inventory_id, local_id) DO UPDATE SET quantidade_total = public.estoque_por_local.quantidade_total + v_qty;
        ELSIF v_rental.local_retirada_id IS NOT NULL THEN
            UPDATE public.estoque_por_local SET quantidade_locada = GREATEST(0, quantidade_locada - v_qty) WHERE inventory_id = v_inventory_id AND local_id = v_rental.local_retirada_id;
        END IF;
    END LOOP;

    UPDATE public.rentals SET status = 'Devolvido', local_devolucao_id = p_local_devolucao_id, actual_return_date = p_actual_return_date WHERE id = p_rental_id;
END $function$;

-- Update exchange_rental_item to use estoque_por_local
CREATE OR REPLACE FUNCTION public.exchange_rental_item(p_rental_id uuid, p_old_inventory_id uuid, p_new_inventory_id uuid, p_quantity integer, p_new_expected_return_date date, p_difference_to_pay numeric, p_exchange_history_data jsonb)
 RETURNS void
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
  v_location_id uuid;
  v_rounded_difference numeric;
BEGIN
  v_rounded_difference := ROUND(p_difference_to_pay);
  SELECT * INTO v_rental FROM public.rentals WHERE id = p_rental_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Locação não encontrada'; END IF;
  
  v_location_id := v_rental.local_retirada_id;

  IF v_location_id IS NOT NULL THEN
    UPDATE public.estoque_por_local SET quantidade_locada = GREATEST(0, quantidade_locada - p_quantity) WHERE inventory_id = p_old_inventory_id AND local_id = v_location_id;
  END IF;

  SELECT * INTO v_new_inventory FROM public.inventory WHERE id = p_new_inventory_id FOR UPDATE;
  
  IF v_location_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.estoque_por_local WHERE inventory_id = p_new_inventory_id AND local_id = v_location_id AND (quantidade_total - quantidade_locada) >= p_quantity) THEN
      RAISE EXCEPTION 'Quantidade indisponível para o novo produto no local';
    END IF;
    UPDATE public.estoque_por_local SET quantidade_locada = quantidade_locada + p_quantity WHERE inventory_id = p_new_inventory_id AND local_id = v_location_id;
  END IF;

  v_items := v_rental.items;
  v_new_items := '[]'::jsonb;
  
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    IF ((v_item->>'inventoryId' IS NOT NULL AND (v_item->>'inventoryId')::uuid = p_old_inventory_id) OR (v_item->>'itemId' IS NOT NULL AND (v_item->>'itemId')::uuid = p_old_inventory_id)) AND NOT v_found THEN
      v_item := jsonb_build_object(
        'itemId', p_new_inventory_id, 'name', v_new_inventory.name, 'quantity', p_quantity, 'dailyPrice', v_new_inventory.daily_price, 'monthlyPrice', v_new_inventory.monthly_price
      );
      v_found := true;
    END IF;
    v_new_items := v_new_items || v_item;
  END LOOP;
  IF NOT v_found THEN RAISE EXCEPTION 'Produto antigo não encontrado na locação'; END IF;

  UPDATE public.rentals SET items = v_new_items, expected_return_date = p_new_expected_return_date, total = ROUND(total + v_rounded_difference) WHERE id = p_rental_id;
  
  INSERT INTO public.exchange_history (rental_id, old_inventory_id, new_inventory_id, exchange_date, days_used, days_remaining, available_credit, new_cost, difference_to_pay, extra_days)
  VALUES (p_rental_id, p_old_inventory_id, p_new_inventory_id, NOW(), (p_exchange_history_data->>'days_used')::int, (p_exchange_history_data->>'days_remaining')::int, (p_exchange_history_data->>'available_credit')::numeric, (p_exchange_history_data->>'new_cost')::numeric, v_rounded_difference, (p_exchange_history_data->>'extra_days')::int);
END;
$function$;
