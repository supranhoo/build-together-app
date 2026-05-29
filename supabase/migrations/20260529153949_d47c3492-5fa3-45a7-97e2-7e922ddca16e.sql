-- Backfill existing item codes from 4-digit to 5-digit zero-padded suffixes
-- (e.g. FG-HIGHCARBONFERROMANGANESE-0001 → FG-HIGHCARBONFERROMANGANESE-00001).
-- Only rewrites codes that end in exactly 4 digits preceded by a dash.
UPDATE public.materials
SET code = regexp_replace(code, '-([0-9]{4})$', '-0\1')
WHERE code ~ '-[0-9]{4}$';