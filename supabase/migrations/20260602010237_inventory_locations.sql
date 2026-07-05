DO $$
BEGIN

-- 1. Create locais
CREATE TABLE IF NOT EXISTS public.locais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT UNIQUE NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed locais
INSERT INTO public.locais (nome) VALUES 
  ('Galpão'), 
  ('Loja Vitória'), 
  ('Loja Cariacica'), 
  ('Loja Vila Velha'), 
  ('Loja Serra')
ON CONFLICT (nome) DO NOTHING;

-- 2. Create estoque_por_local
CREATE TABLE IF NOT EXISTS public.estoque_por_local (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
    local_id UUID NOT NULL REFERENCES public.locais(id) ON DELETE CASCADE,
    quantidade_total INTEGER NOT NULL DEFAULT 0,
    quantidade_locada INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(inventory_id, local_id)
);

-- Migrate existing inventory_locations data if it exists
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory_locations') THEN
  INSERT INTO public.estoque_por_local (inventory_id, local_id, quantidade_total, quantidade_locada)
  SELECT il.inventory_id, l.id, il.quantity, il.rented_qty
  FROM public.inventory_locations il
  JOIN public.locais l ON l.nome = il.location_id
  ON CONFLICT (inventory_id, local_id) DO NOTHING;
END IF;

-- 3. Alter rentals table
ALTER TABLE public.rentals 
ADD COLUMN IF NOT EXISTS local_retirada_id UUID REFERENCES public.locais(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS local_devolucao_id UUID REFERENCES public.locais(id) ON DELETE SET NULL;

END $$;

-- 4. Set up RLS Policies
DROP POLICY IF EXISTS "authenticated_all" ON public.locais;
CREATE POLICY "authenticated_all" ON public.locais FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_select" ON public.locais;
CREATE POLICY "anon_select" ON public.locais FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "authenticated_all" ON public.estoque_por_local;
CREATE POLICY "authenticated_all" ON public.estoque_por_local FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_select" ON public.estoque_por_local;
CREATE POLICY "anon_select" ON public.estoque_por_local FOR SELECT TO anon USING (true);

ALTER TABLE public.locais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_por_local ENABLE ROW LEVEL SECURITY;

-- 5. Seed Admin User
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'marceloslepre@gmail.com') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'marceloslepre@gmail.com',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Marcelo"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );

    INSERT INTO public.profiles (id, email, name, role)
    VALUES (new_user_id, 'marceloslepre@gmail.com', 'Marcelo Lepre', 'Administrador')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 6. Atomic Functions

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
) RETURNS uuid AS $func$
DECLARE
    v_item jsonb;
    v_inventory_id uuid;
    v_qty int;
    v_available int;
    v_local_nome text;
    v_rental_id uuid;
BEGIN
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
        p_items, p_payment_method, p_total, p_custom_contract_html, 'Ativo', p_contract_number
    ) RETURNING id INTO v_rental_id;

    RETURN v_rental_id;
END $func$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.return_rental_atomic(
    p_rental_id uuid,
    p_local_devolucao_id uuid,
    p_actual_return_date date
) RETURNS void AS $func$
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

        UPDATE public.inventory
        SET available_qty = available_qty + v_qty, rented_qty = GREATEST(0, rented_qty - v_qty)
        WHERE id = v_inventory_id;

        IF p_local_devolucao_id IS NOT NULL AND v_rental.local_retirada_id IS NOT NULL THEN
            IF p_local_devolucao_id = v_rental.local_retirada_id THEN
                UPDATE public.estoque_por_local
                SET quantidade_locada = GREATEST(0, quantidade_locada - v_qty)
                WHERE inventory_id = v_inventory_id AND local_id = p_local_devolucao_id;
            ELSE
                UPDATE public.estoque_por_local
                SET quantidade_total = GREATEST(0, quantidade_total - v_qty),
                    quantidade_locada = GREATEST(0, quantidade_locada - v_qty)
                WHERE inventory_id = v_inventory_id AND local_id = v_rental.local_retirada_id;

                INSERT INTO public.estoque_por_local (inventory_id, local_id, quantidade_total, quantidade_locada)
                VALUES (v_inventory_id, p_local_devolucao_id, v_qty, 0)
                ON CONFLICT (inventory_id, local_id) DO UPDATE
                SET quantidade_total = public.estoque_por_local.quantidade_total + v_qty;
            END IF;
        ELSIF p_local_devolucao_id IS NOT NULL THEN
            INSERT INTO public.estoque_por_local (inventory_id, local_id, quantidade_total, quantidade_locada)
            VALUES (v_inventory_id, p_local_devolucao_id, v_qty, 0)
            ON CONFLICT (inventory_id, local_id) DO UPDATE
            SET quantidade_total = public.estoque_por_local.quantidade_total + v_qty;
        ELSIF v_rental.local_retirada_id IS NOT NULL THEN
            UPDATE public.estoque_por_local
            SET quantidade_locada = GREATEST(0, quantidade_locada - v_qty)
            WHERE inventory_id = v_inventory_id AND local_id = v_rental.local_retirada_id;
        END IF;
    END LOOP;

    UPDATE public.rentals
    SET status = 'Devolvido', local_devolucao_id = p_local_devolucao_id, actual_return_date = p_actual_return_date
    WHERE id = p_rental_id;
END $func$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.transfer_inventory_batch(
    p_origin_location_id uuid,
    p_destination_location_id uuid,
    p_items jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $func$
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
END $func$;
