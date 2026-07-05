DO $$
DECLARE
  inv_record RECORD;
  asset_elem jsonb;
  new_assets jsonb;
BEGIN
  FOR inv_record IN SELECT id, assets FROM public.inventory WHERE assets IS NOT NULL AND jsonb_array_length(assets) > 0
  LOOP
    new_assets := '[]'::jsonb;
    FOR asset_elem IN SELECT * FROM jsonb_array_elements(inv_record.assets)
    LOOP
      IF asset_elem ? 'serialNumber' THEN
        asset_elem := jsonb_set(asset_elem, '{assetNumber}', asset_elem->'serialNumber');
        asset_elem := asset_elem - 'serialNumber';
      END IF;
      
      IF asset_elem ? 'status' THEN
        asset_elem := jsonb_set(asset_elem, '{conditionStatus}', asset_elem->'status');
        asset_elem := asset_elem - 'status';
      END IF;

      IF asset_elem ? 'purchaseDate' THEN
        asset_elem := jsonb_set(asset_elem, '{acquisitionDate}', asset_elem->'purchaseDate');
        asset_elem := asset_elem - 'purchaseDate';
      END IF;

      -- Set default assetNumber if still missing
      IF NOT (asset_elem ? 'assetNumber') THEN
        asset_elem := jsonb_set(asset_elem, '{assetNumber}', '"PAT-S/N"'::jsonb);
      END IF;

      new_assets := new_assets || asset_elem;
    END LOOP;
    
    UPDATE public.inventory SET assets = new_assets WHERE id = inv_record.id;
  END LOOP;
END $$;
