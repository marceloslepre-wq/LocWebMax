DO $DO_BLOCK$
BEGIN
  -- Create missing tables to enforce persistence
  CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    total_qty INT NOT NULL DEFAULT 0,
    available_qty INT NOT NULL DEFAULT 0,
    rented_qty INT NOT NULL DEFAULT 0,
    condition_status TEXT NOT NULL DEFAULT 'Disponível',
    image TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    primary_color TEXT DEFAULT '#1e40af',
    logo_url TEXT,
    contract_file_name TEXT,
    contract_template_html TEXT,
    late_fee_type TEXT DEFAULT 'daily',
    late_fee_value NUMERIC DEFAULT 2,
    company_name TEXT DEFAULT 'LocaWeb Gestão de Ativos LTDA',
    company_document TEXT DEFAULT '00.000.000/0001-00',
    company_address TEXT DEFAULT 'Av. Central, 1000 - Centro, São Paulo/SP',
    categories JSONB DEFAULT '["Ferramentas", "Equipamentos Pesados", "Acessórios", "Geral"]'::jsonb,
    locations JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Operador',
    active BOOLEAN NOT NULL DEFAULT true,
    permissions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS rentals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    expected_return_date DATE NOT NULL,
    actual_return_date DATE,
    status TEXT NOT NULL DEFAULT 'Ativo',
    total NUMERIC NOT NULL DEFAULT 0,
    custom_contract_text TEXT,
    custom_contract_html TEXT,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    pickup_location_id TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

END $DO_BLOCK$;

-- RLS Policies
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all" ON inventory;
CREATE POLICY "authenticated_all" ON inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all" ON settings;
CREATE POLICY "authenticated_all" ON settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all" ON profiles;
CREATE POLICY "authenticated_all" ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all" ON rentals;
CREATE POLICY "authenticated_all" ON rentals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Insert initial settings safely
INSERT INTO settings (id) VALUES (gen_random_uuid()) ON CONFLICT DO NOTHING;

-- Force Seed/Update of Master Admin Profile and Auth
DO $DO_BLOCK$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'marceloslepre@gmail.com') THEN
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
      '{"name": "Marcelo Lepre", "role": "Administrador"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );
    
    INSERT INTO profiles (id, auth_user_id, name, email, role, active, permissions)
    VALUES (v_user_id, v_user_id, 'Marcelo Lepre', 'marceloslepre@gmail.com', 'Administrador', true, '[]'::jsonb);
  ELSE
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'marceloslepre@gmail.com';
    
    -- Ensure password and roles are exactly what was requested
    UPDATE auth.users 
    SET encrypted_password = crypt('QRL8c63@', gen_salt('bf')),
        raw_user_meta_data = '{"name": "Marcelo Lepre", "role": "Administrador"}'::jsonb
    WHERE id = v_user_id;
    
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = v_user_id) THEN
      INSERT INTO profiles (id, auth_user_id, name, email, role, active, permissions)
      VALUES (v_user_id, v_user_id, 'Marcelo Lepre', 'marceloslepre@gmail.com', 'Administrador', true, '[]'::jsonb);
    ELSE
      UPDATE profiles SET role = 'Administrador', name = 'Marcelo Lepre', active = true WHERE auth_user_id = v_user_id;
    END IF;
  END IF;
END $DO_BLOCK$;
