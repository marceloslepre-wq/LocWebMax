CREATE TABLE IF NOT EXISTS public.historico_trocas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES public.rentals(id) ON DELETE CASCADE,
  produto_antigo_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  produto_novo_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  data_troca TIMESTAMP DEFAULT NOW(),
  dias_usados INT,
  dias_restantes INT,
  credito_disponivel DECIMAL(10,2),
  valor_diario_original DECIMAL(10,2),
  valor_diario_novo DECIMAL(10,2),
  custo_novo DECIMAL(10,2),
  diferenca_pagar DECIMAL(10,2),
  dias_extras INT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE public.historico_trocas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all" ON public.historico_trocas;
CREATE POLICY "authenticated_all" ON public.historico_trocas 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.sync_historico_trocas()
RETURNS trigger AS $$
DECLARE
  v_original DECIMAL(10,2);
  v_novo DECIMAL(10,2);
BEGIN
  SELECT daily_price INTO v_original FROM public.inventory WHERE id = NEW.old_inventory_id;
  SELECT daily_price INTO v_novo FROM public.inventory WHERE id = NEW.new_inventory_id;

  INSERT INTO public.historico_trocas (
    contrato_id, produto_antigo_id, produto_novo_id, data_troca,
    dias_usados, dias_restantes, credito_disponivel,
    valor_diario_original, valor_diario_novo,
    custo_novo, diferenca_pagar, dias_extras
  ) VALUES (
    NEW.rental_id, NEW.old_inventory_id, NEW.new_inventory_id, NEW.exchange_date,
    NEW.days_used, NEW.days_remaining, NEW.available_credit,
    COALESCE(v_original, 0), COALESCE(v_novo, 0),
    NEW.new_cost, NEW.difference_to_pay, NEW.extra_days
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_exchange_history_inserted ON public.exchange_history;
CREATE TRIGGER on_exchange_history_inserted
  AFTER INSERT ON public.exchange_history
  FOR EACH ROW EXECUTE FUNCTION public.sync_historico_trocas();
