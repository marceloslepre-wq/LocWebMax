-- Create the function to update overdue rentals to 'Atrasado'
CREATE OR REPLACE FUNCTION public.update_overdue_rentals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.rentals
  SET status = 'Atrasado'
  WHERE status = 'Ativo'
    AND expected_return_date < CURRENT_DATE
    AND actual_return_date IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- Schedule the function using pg_cron (if available) as a daily background routine
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if any to maintain idempotency
    PERFORM cron.unschedule('daily-overdue-rentals-update');
    
    -- Schedule to run every day at midnight server time
    PERFORM cron.schedule(
      'daily-overdue-rentals-update',
      '0 0 * * *',
      'SELECT public.update_overdue_rentals()'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore errors if cron schema doesn't exist or user lacks permissions
    NULL;
END;
$$;
