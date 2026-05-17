-- Phase A: normalize process_profile to canonical enum values and enforce constraint.
-- Preserve any existing free-text description in a new column process_description.
ALTER TABLE public.profit_centers
  ADD COLUMN IF NOT EXISTS process_description TEXT;

UPDATE public.profit_centers
  SET process_description = process_profile
  WHERE process_description IS NULL
    AND process_profile IS NOT NULL
    AND process_profile NOT IN ('power','ferro_alloy','dri','refining','steel_melting');

-- Backfill normalized codes by slug.
UPDATE public.profit_centers SET process_profile = CASE
  WHEN slug = 'captive-power-plant'                                THEN 'power'
  WHEN slug = 'ferro-alloys-division'                              THEN 'ferro_alloy'
  WHEN slug = 'direct-reduced-iron'                                THEN 'dri'
  WHEN slug = 'clu-ferro-alloys-division'                          THEN 'refining'
  WHEN slug = 'steel-melting-shop'                                 THEN 'steel_melting'
  ELSE NULL
END
WHERE process_profile IS NULL
   OR process_profile NOT IN ('power','ferro_alloy','dri','refining','steel_melting');

-- Default future rows to ferro_alloy (matches spec) and enforce CHECK.
ALTER TABLE public.profit_centers
  ALTER COLUMN process_profile SET DEFAULT 'ferro_alloy';

UPDATE public.profit_centers
  SET process_profile = 'ferro_alloy'
  WHERE process_profile IS NULL;

ALTER TABLE public.profit_centers
  ALTER COLUMN process_profile SET NOT NULL;

ALTER TABLE public.profit_centers
  DROP CONSTRAINT IF EXISTS profit_centers_process_profile_check;

ALTER TABLE public.profit_centers
  ADD CONSTRAINT profit_centers_process_profile_check
  CHECK (process_profile IN ('power','ferro_alloy','dri','refining','steel_melting'));
