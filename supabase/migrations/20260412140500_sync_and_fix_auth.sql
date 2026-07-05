-- 1. Create a trigger on profiles to automatically create auth.users if missing
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS trigger AS $$
BEGIN
  -- If this profile has no auth_user_id, it means it was inserted directly (not via auth trigger)
  IF NEW.auth_user_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = NEW.email) THEN
      NEW.auth_user_id := gen_random_uuid();
      
      INSERT INTO auth.users (
        id, instance_id, email, encrypted_password, email_confirmed_at,
        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
        is_super_admin, role, aud,
        confirmation_token, recovery_token, email_change_token_new,
        email_change, email_change_token_current,
        phone, phone_change, phone_change_token, reauthentication_token
      ) VALUES (
        NEW.auth_user_id,
        '00000000-0000-0000-0000-000000000000',
        NEW.email,
        crypt('Mudar@123', gen_salt('bf')),
        NOW(), NOW(), NOW(),
        '{"provider": "email", "providers": ["email"]}',
        json_build_object('name', NEW.name),
        false, 'authenticated', 'authenticated',
        '', '', '', '', '', NULL, '', '', ''
      );
      
    ELSE
      -- If email exists, just link it
      SELECT id INTO NEW.auth_user_id FROM auth.users WHERE email = NEW.email LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;
CREATE TRIGGER on_profile_created
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();

-- 2. Backfill existing profiles without auth.users
DO $$
DECLARE
  p RECORD;
  new_auth_id uuid;
BEGIN
  FOR p IN SELECT * FROM public.profiles WHERE auth_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = public.profiles.auth_user_id) LOOP
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = p.email) THEN
      new_auth_id := gen_random_uuid();
      
      INSERT INTO auth.users (
        id, instance_id, email, encrypted_password, email_confirmed_at,
        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
        is_super_admin, role, aud,
        confirmation_token, recovery_token, email_change_token_new,
        email_change, email_change_token_current,
        phone, phone_change, phone_change_token, reauthentication_token
      ) VALUES (
        new_auth_id,
        '00000000-0000-0000-0000-000000000000',
        p.email,
        crypt('Mudar@123', gen_salt('bf')),
        NOW(), NOW(), NOW(),
        '{"provider": "email", "providers": ["email"]}',
        json_build_object('name', p.name),
        false, 'authenticated', 'authenticated',
        '', '', '', '', '', NULL, '', '', ''
      );
      
      UPDATE public.profiles SET auth_user_id = new_auth_id WHERE id = p.id;
    ELSE
      -- Link existing
      UPDATE public.profiles 
      SET auth_user_id = (SELECT id FROM auth.users WHERE email = p.email LIMIT 1)
      WHERE id = p.id;
    END IF;
  END LOOP;
END $$;

-- 3. Explicitly ensure the user from the screenshot exists and has the requested password
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
  existing_id uuid;
BEGIN
  SELECT id INTO existing_id FROM auth.users WHERE email = 'lojahospitalhome@gmail.com';
  
  IF existing_id IS NULL THEN
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
      'lojahospitalhome@gmail.com',
      crypt('QRL8c63@', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Loja Hospital Home"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );

    INSERT INTO public.profiles (id, auth_user_id, email, name, role)
    VALUES (new_user_id, new_user_id, 'lojahospitalhome@gmail.com', 'Loja Hospital Home', 'Operador')
    ON CONFLICT (id) DO NOTHING;
  ELSE
    -- If exists, ensure they can login by resetting to the correct password they expect
    UPDATE auth.users SET encrypted_password = crypt('QRL8c63@', gen_salt('bf')) WHERE id = existing_id;
  END IF;
END $$;
