DROP FUNCTION IF EXISTS public.transfer_inventory_batch(text, text, jsonb);
DROP FUNCTION IF EXISTS public.transfer_inventory_batch(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.transfer_inventory_batch(p_origin_location_id uuid, p_destination_location_id uuid, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_item jsonb;
    v_inventory_id uuid;
    v_quantity integer;
    v_origin_total integer;
    v_origin_locada integer;
    v_origin_available integer;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_inventory_id := (v_item->>'inventory_id')::uuid;
        v_quantity := (v_item->>'quantity')::integer;

        SELECT quantidade_total, quantidade_locada INTO v_origin_total, v_origin_locada
        FROM public.estoque_por_local
        WHERE inventory_id = v_inventory_id AND local_id = p_origin_location_id;

        v_origin_available := COALESCE(v_origin_total, 0) - COALESCE(v_origin_locada, 0);

        IF v_origin_available < v_quantity THEN
            RAISE EXCEPTION 'Quantidade indisponível no local de origem para o produto %', v_inventory_id;
        END IF;

        UPDATE public.estoque_por_local
        SET quantidade_total = quantidade_total - v_quantity
        WHERE inventory_id = v_inventory_id AND local_id = p_origin_location_id;

        INSERT INTO public.estoque_por_local (inventory_id, local_id, quantidade_total, quantidade_locada)
        VALUES (v_inventory_id, p_destination_location_id, v_quantity, 0)
        ON CONFLICT (inventory_id, local_id) DO UPDATE
        SET quantidade_total = public.estoque_por_local.quantidade_total + v_quantity;

        INSERT INTO public.inventory_transfers (
            inventory_id, origin_location_id, destination_location_id, quantity, status
        ) VALUES (
            v_inventory_id, p_origin_location_id::text, p_destination_location_id::text, v_quantity, 'completed'
        );
    END LOOP;
END $function$;
