-- New function to support partial item returns
-- Updates inventory and estoque_por_local only for returned items
-- Marks contract as 'Devolvido' only when all items are returned

CREATE OR REPLACE FUNCTION public.return_items_partial(
    p_rental_id uuid,
    p_local_devolucao_id uuid,
    p_actual_return_date date,
    p_items_to_return jsonb
) RETURNS jsonb AS $func$
DECLARE
    v_rental record;
    v_items jsonb;
    v_new_items jsonb;
    v_item jsonb;
    v_return_item jsonb;
    v_inventory_id uuid;
    v_qty int;
    v_returned_qty int;
    v_return_qty int;
    v_all_returned boolean := true;
    v_has_real_item boolean := false;
BEGIN
    IF p_items_to_return IS NULL OR jsonb_array_length(p_items_to_return) = 0 THEN
        RAISE EXCEPTION 'Nenhum item selecionado para devolução';
    END IF;

    SELECT * INTO v_rental FROM public.rentals WHERE id = p_rental_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Locação não encontrada'; END IF;
    IF v_rental.status = 'Devolvido' THEN RAISE EXCEPTION 'Locação já devolvida'; END IF;

    v_items := v_rental.items;
    v_new_items := '[]'::jsonb;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        IF v_item->>'itemId' = 'freight' THEN
            v_new_items := v_new_items || v_item;
            CONTINUE;
        END IF;

        v_has_real_item := true;
        v_inventory_id := (v_item->>'itemId')::uuid;
        v_qty := (v_item->>'qty')::int;
        v_returned_qty := COALESCE((v_item->>'returnedQty')::int, 0);
        v_return_qty := 0;

        FOR v_return_item IN SELECT * FROM jsonb_array_elements(p_items_to_return)
        LOOP
            IF v_return_item->>'itemId' = v_item->>'itemId' THEN
                v_return_qty := (v_return_item->>'qty')::int;
                EXIT;
            END IF;
        END LOOP;

        IF v_return_qty > 0 THEN
            v_returned_qty := v_returned_qty + v_return_qty;

            UPDATE public.inventory
            SET available_qty = available_qty + v_return_qty,
                rented_qty = GREATEST(0, rented_qty - v_return_qty)
            WHERE id = v_inventory_id;

            IF p_local_devolucao_id IS NOT NULL AND v_rental.local_retirada_id IS NOT NULL THEN
                IF p_local_devolucao_id = v_rental.local_retirada_id THEN
                    UPDATE public.estoque_por_local
                    SET quantidade_locada = GREATEST(0, quantidade_locada - v_return_qty)
                    WHERE inventory_id = v_inventory_id AND local_id = p_local_devolucao_id;
                ELSE
                    UPDATE public.estoque_por_local
                    SET quantidade_total = GREATEST(0, quantidade_total - v_return_qty),
                        quantidade_locada = GREATEST(0, quantidade_locada - v_return_qty)
                    WHERE inventory_id = v_inventory_id AND local_id = v_rental.local_retirada_id;

                    INSERT INTO public.estoque_por_local (inventory_id, local_id, quantidade_total, quantidade_locada)
                    VALUES (v_inventory_id, p_local_devolucao_id, v_return_qty, 0)
                    ON CONFLICT (inventory_id, local_id) DO UPDATE
                    SET quantidade_total = public.estoque_por_local.quantidade_total + v_return_qty;
                END IF;
            ELSIF p_local_devolucao_id IS NOT NULL THEN
                INSERT INTO public.estoque_por_local (inventory_id, local_id, quantidade_total, quantidade_locada)
                VALUES (v_inventory_id, p_local_devolucao_id, v_return_qty, 0)
                ON CONFLICT (inventory_id, local_id) DO UPDATE
                SET quantidade_total = public.estoque_por_local.quantidade_total + v_return_qty;
            ELSIF v_rental.local_retirada_id IS NOT NULL THEN
                UPDATE public.estoque_por_local
                SET quantidade_locada = GREATEST(0, quantidade_locada - v_return_qty)
                WHERE inventory_id = v_inventory_id AND local_id = v_rental.local_retirada_id;
            END IF;

            v_item := jsonb_set(v_item, '{returnedQty}', to_jsonb(v_returned_qty));
            v_item := jsonb_set(v_item, '{returnedDate}', to_jsonb(p_actual_return_date::text));
        END IF;

        IF v_returned_qty < v_qty THEN
            v_all_returned := false;
        END IF;

        v_new_items := v_new_items || v_item;
    END LOOP;

    IF NOT v_has_real_item THEN
        v_all_returned := false;
    END IF;

    IF v_all_returned THEN
        UPDATE public.rentals
        SET items = v_new_items,
            status = 'Devolvido',
            local_devolucao_id = p_local_devolucao_id,
            actual_return_date = p_actual_return_date
        WHERE id = p_rental_id;
    ELSE
        UPDATE public.rentals
        SET items = v_new_items,
            local_devolucao_id = p_local_devolucao_id
        WHERE id = p_rental_id;
    END IF;

    RETURN jsonb_build_object('allReturned', v_all_returned, 'items', v_new_items);
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;
