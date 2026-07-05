-- Remover a trigger e a função que inseriam a senha padrão 'Mudar@123'
DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;
DROP FUNCTION IF EXISTS public.handle_new_profile();

DO $$
BEGIN
  -- Deletar todos os usuários da tabela auth.users exceto o admin
  -- Isso força o recadastro correto de todos os outros usuários sem o fallback de senha
  DELETE FROM auth.users WHERE email != 'marceloslepre@gmail.com';
  
  -- Deletar perfis órfãos caso o CASCADE não tenha coberto alguma inconsistência prévia
  DELETE FROM public.profiles WHERE email != 'marceloslepre@gmail.com';
END $$;
