CREATE TABLE IF NOT EXISTS public.patrimonio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
    numero_patrimonio TEXT NOT NULL UNIQUE,
    data_aquisicao DATE,
    estado TEXT CHECK (estado IN ('novo', 'bom', 'regular', 'ruim')),
    localizacao TEXT,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.patrimonio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select" ON public.patrimonio;
CREATE POLICY "anon_select" ON public.patrimonio FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "authenticated_all" ON public.patrimonio;
CREATE POLICY "authenticated_all" ON public.patrimonio FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_patrimonio_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_patrimonio_updated_at ON public.patrimonio;
CREATE TRIGGER update_patrimonio_updated_at
BEFORE UPDATE ON public.patrimonio
FOR EACH ROW EXECUTE FUNCTION public.update_patrimonio_updated_at();

DO $$
DECLARE
    inv_record RECORD;
    counter INT := 1;
BEGIN
    FOR inv_record IN SELECT id FROM public.inventory LIMIT 10
    LOOP
        INSERT INTO public.patrimonio (inventory_id, numero_patrimonio, data_aquisicao, estado, localizacao, observacoes)
        VALUES 
            (inv_record.id, 'PAT-' || LPAD(counter::TEXT, 4, '0'), '2023-01-15', 'bom', 'Depósito Principal', 'Sem observações'),
            (inv_record.id, 'PAT-' || LPAD((counter + 1)::TEXT, 4, '0'), '2023-02-20', 'novo', 'Depósito Principal', 'Recém adquirido'),
            (inv_record.id, 'PAT-' || LPAD((counter + 2)::TEXT, 4, '0'), '2022-11-10', 'regular', 'Prateleira A', 'Marcas de uso leves')
        ON CONFLICT (numero_patrimonio) DO NOTHING;
        
        counter := counter + 3;
    END LOOP;
END $$;
