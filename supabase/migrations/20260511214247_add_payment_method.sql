DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'rentals' 
          AND column_name = 'payment_method'
    ) THEN
        ALTER TABLE public.rentals ADD COLUMN payment_method VARCHAR(20) NOT NULL DEFAULT 'PIX';
    END IF;
END $$;
