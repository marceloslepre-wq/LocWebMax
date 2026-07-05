DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- 1. Verifica se o usuário já existe
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'aluguel@hospitalhome.com.br';

  IF v_user_id IS NOT NULL THEN
    -- Atualizar a senha com o hash bcrypt (Supabase GoTrue pattern)
    UPDATE auth.users
    SET encrypted_password = crypt('Hospital562', gen_salt('bf'))
    WHERE id = v_user_id;
  ELSE
    -- Criar o usuário se não existir (garantindo o hash correto da senha)
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'aluguel@hospitalhome.com.br',
      crypt('Hospital562', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Aluguel"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );

    -- Inserir o perfil correspondente
    INSERT INTO public.profiles (id, auth_user_id, email, name, role, active)
    VALUES (v_user_id, v_user_id, 'aluguel@hospitalhome.com.br', 'Aluguel', 'Operador', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
