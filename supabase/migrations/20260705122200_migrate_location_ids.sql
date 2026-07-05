-- Migrate inventory_locations.location_id from location names to UUIDs
UPDATE inventory_locations il
SET location_id = l.id::text
FROM locais l
WHERE il.location_id = l.nome;

-- Migrate inventory_transfers origin from names to UUIDs
UPDATE inventory_transfers it
SET origin_location_id = l.id::text
FROM locais l
WHERE it.origin_location_id = l.nome;

-- Migrate inventory_transfers destination from names to UUIDs
UPDATE inventory_transfers it
SET destination_location_id = l.id::text
FROM locais l
WHERE it.destination_location_id = l.nome;
