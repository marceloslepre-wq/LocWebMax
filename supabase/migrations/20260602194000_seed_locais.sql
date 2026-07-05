DO $$
BEGIN
  INSERT INTO public.locais (id, nome, ativo) VALUES
    (gen_random_uuid(), 'Galpão', true),
    (gen_random_uuid(), 'Loja Vitória', true),
    (gen_random_uuid(), 'Loja Cariacica', true),
    (gen_random_uuid(), 'Loja Vila Velha', true),
    (gen_random_uuid(), 'Loja Serra', true)
  ON CONFLICT (nome) DO NOTHING;
END $$;
