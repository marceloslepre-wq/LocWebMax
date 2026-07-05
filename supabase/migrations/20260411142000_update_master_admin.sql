DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Atualiza o usuário gestor master se ele já existir
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'marceloslepre@gmail.com') THEN
    UPDATE auth.users
    SET 
      encrypted_password = crypt('QRL8c63@', gen_salt('bf')),
      raw_user_meta_data = '{"name": "Marcelo", "role": "Administrador"}'::jsonb,
      updated_at = NOW()
    WHERE email = 'marceloslepre@gmail.com';
  ELSE
    -- Insere o usuário gestor master caso ele não exista
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
      'marceloslepre@gmail.com',
      crypt('QRL8c63@', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Marcelo", "role": "Administrador"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );
  END IF;
END $$;
