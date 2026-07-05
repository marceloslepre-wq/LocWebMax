DO $$
BEGIN
  -- 1. Create a backup table as requested
  CREATE TABLE IF NOT EXISTS public.rentals_backup_dates AS 
  SELECT * FROM public.rentals;

  -- 2. Subtract 3 days from start_date and expected_return_date for the specific contracts
  UPDATE public.rentals 
  SET start_date = start_date - 3,
      expected_return_date = expected_return_date - 3
  WHERE contract_number IN (
    'LC036', 'LC037', 'LC038', 'LC040', 'LC044', 'LC045', 'LC046', 'LC047', 'LC050'
  );
END $$;
