CREATE OR REPLACE FUNCTION public.update_rental_secure(
  p_rental_id uuid,
  p_start_date date,
  p_expected_return_date date,
  p_custom_text text,
  p_user_id uuid,
  p_justificativa text DEFAULT NULL
) RETURNS void AS $function$
DECLARE
  v_count int;
  v_old_start date;
  v_old_return date;
  v_old_text text;
BEGIN
  -- Rate limit check
  SELECT count(*) INTO v_count
  FROM public.auditoria_contratos
  WHERE usuario_id = p_user_id
    AND created_at >= NOW() - INTERVAL '1 minute';
    
  IF v_count >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 5 edits per minute.';
  END IF;

  -- Get old values
  SELECT start_date, expected_return_date, custom_contract_text
  INTO v_old_start, v_old_return, v_old_text
  FROM public.rentals
  WHERE id = p_rental_id;

  -- Update
  UPDATE public.rentals
  SET start_date = p_start_date,
      expected_return_date = p_expected_return_date,
      custom_contract_text = p_custom_text
  WHERE id = p_rental_id;

  -- Audit
  INSERT INTO public.auditoria_contratos (rental_id, usuario_id, acao, campos_antigos, campos_novos, ip_usuario)
  VALUES (
    p_rental_id, 
    p_user_id, 
    'EDIT',
    jsonb_build_object('start_date', v_old_start, 'expected_return_date', v_old_return, 'custom_contract_text', v_old_text),
    jsonb_build_object('start_date', p_start_date, 'expected_return_date', p_expected_return_date, 'custom_contract_text', p_custom_text, 'justificativa', p_justificativa),
    'rpc-call'
  );
END;
$function$ LANGUAGE plpgsql SECURITY DEFINER;
