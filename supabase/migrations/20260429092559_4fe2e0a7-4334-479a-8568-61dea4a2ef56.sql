-- =====================================================================
-- Item Master redesign — Phase 1
-- =====================================================================
-- Adds a normalized property catalog (item_property_definitions) and a
-- group→property mapping table (item_group_property_map) so the Item Master
-- screen can render group-driven, dynamic property inputs without hardcoding.
--
-- COMPATIBILITY: actual per-item values continue to live inside
-- materials.specs (JSONB). The new Item Master screen writes to BOTH:
--   - materials.specs            (legacy readers stay on this — FAD, Quality,
--                                 Costing, Inventory, Procurement)
--   - The form is driven by the property catalog below
--
-- This avoids a big-bang rewrite of 38 downstream files. A future phase can
-- migrate values into a per-item-value table when those readers are
-- modernized one by one.
-- =====================================================================

-- ----- Property catalog --------------------------------------------------
-- Workspace-scoped so each profit center can extend the master list, but
-- seeded globally (profit_center_id IS NULL = visible to all workspaces).
CREATE TABLE IF NOT EXISTS public.item_property_definitions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NULL,                     -- NULL = global default
  property_key  text NOT NULL,                    -- canonical key e.g. 'Mn'
  display_name  text NOT NULL,                    -- e.g. 'Manganese'
  unit          text NOT NULL DEFAULT '%',        -- '%', 'mm', etc.
  data_type     text NOT NULL DEFAULT 'decimal',  -- decimal | text
  decimals      smallint NOT NULL DEFAULT 2,
  min_value     numeric NULL,                     -- inclusive bound
  max_value     numeric NULL,                     -- inclusive bound
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_property_definitions_key_unique UNIQUE (profit_center_id, property_key),
  CONSTRAINT item_property_definitions_decimals_chk CHECK (decimals BETWEEN 0 AND 6),
  CONSTRAINT item_property_definitions_data_type_chk CHECK (data_type IN ('decimal','text'))
);

-- ----- Group → Property mapping -----------------------------------------
-- Drives which properties show on the Item Master form for a given
-- (type, group, optional subgroup). Subgroup NULL = applies to whole group.
CREATE TABLE IF NOT EXISTS public.item_group_property_map (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NULL,                     -- NULL = global default
  material_type text NOT NULL,                    -- 'RM' | 'FG' | 'WIP' | 'Consumable'
  group_name    text NOT NULL,                    -- 'ORE' | 'REDUCTANT' | 'FLUXES' | 'PASTE' …
  subgroup      text NULL,                        -- 'SINTER' | 'COKE' | NULL = whole group
  property_key  text NOT NULL,                    -- FK-by-key to item_property_definitions
  is_required   boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_group_property_map_unique UNIQUE
    (profit_center_id, material_type, group_name, subgroup, property_key)
);

CREATE INDEX IF NOT EXISTS item_group_property_map_lookup_idx
  ON public.item_group_property_map (material_type, group_name, subgroup);

-- ----- Updated-at trigger ------------------------------------------------
DROP TRIGGER IF EXISTS trg_item_property_definitions_updated_at ON public.item_property_definitions;
CREATE TRIGGER trg_item_property_definitions_updated_at
  BEFORE UPDATE ON public.item_property_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----- RLS ----------------------------------------------------------------
ALTER TABLE public.item_property_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_group_property_map   ENABLE ROW LEVEL SECURITY;

-- item_property_definitions
DROP POLICY IF EXISTS "Authenticated view property definitions" ON public.item_property_definitions;
CREATE POLICY "Authenticated view property definitions"
  ON public.item_property_definitions FOR SELECT TO authenticated
  USING (
    profit_center_id IS NULL
    OR public.has_profit_center_access(auth.uid(), profit_center_id)
  );

DROP POLICY IF EXISTS "Super admins manage global property defs" ON public.item_property_definitions;
CREATE POLICY "Super admins manage global property defs"
  ON public.item_property_definitions FOR ALL TO authenticated
  USING (profit_center_id IS NULL AND public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (profit_center_id IS NULL AND public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Admins manage workspace property defs" ON public.item_property_definitions;
CREATE POLICY "Admins manage workspace property defs"
  ON public.item_property_definitions FOR ALL TO authenticated
  USING (
    profit_center_id IS NOT NULL AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.can_manage_profit_center(auth.uid(), profit_center_id)
    )
  )
  WITH CHECK (
    profit_center_id IS NOT NULL AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.can_manage_profit_center(auth.uid(), profit_center_id)
    )
  );

-- item_group_property_map
DROP POLICY IF EXISTS "Authenticated view group property map" ON public.item_group_property_map;
CREATE POLICY "Authenticated view group property map"
  ON public.item_group_property_map FOR SELECT TO authenticated
  USING (
    profit_center_id IS NULL
    OR public.has_profit_center_access(auth.uid(), profit_center_id)
  );

DROP POLICY IF EXISTS "Super admins manage global group map" ON public.item_group_property_map;
CREATE POLICY "Super admins manage global group map"
  ON public.item_group_property_map FOR ALL TO authenticated
  USING (profit_center_id IS NULL AND public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (profit_center_id IS NULL AND public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Admins manage workspace group map" ON public.item_group_property_map;
CREATE POLICY "Admins manage workspace group map"
  ON public.item_group_property_map FOR ALL TO authenticated
  USING (
    profit_center_id IS NOT NULL AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.can_manage_profit_center(auth.uid(), profit_center_id)
    )
  )
  WITH CHECK (
    profit_center_id IS NOT NULL AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.can_manage_profit_center(auth.uid(), profit_center_id)
    )
  );

-- ----- Seed: global property catalog ------------------------------------
-- Per operator spec (2026-04-29): 13 chemistry/proximate properties.
INSERT INTO public.item_property_definitions
  (profit_center_id, property_key, display_name, unit, data_type, decimals, min_value, max_value, sort_order)
VALUES
  (NULL, 'Mn',       'Manganese',         '%',  'decimal', 2, 0, 100,  10),
  (NULL, 'Fe',       'Iron',              '%',  'decimal', 2, 0, 100,  20),
  (NULL, 'SiO2',     'Silica',            '%',  'decimal', 2, 0, 100,  30),
  (NULL, 'Al2O3',    'Alumina',           '%',  'decimal', 2, 0, 100,  40),
  (NULL, 'CaO',      'Calcium Oxide',     '%',  'decimal', 2, 0, 100,  50),
  (NULL, 'MgO',      'Magnesium Oxide',   '%',  'decimal', 2, 0, 100,  60),
  (NULL, 'P',        'Phosphorus',        '%',  'decimal', 3, 0, 100,  70),
  (NULL, 'S',        'Sulphur',           '%',  'decimal', 3, 0, 100,  80),
  (NULL, 'Moisture', 'Moisture',          '%',  'decimal', 2, 0, 100,  90),
  (NULL, 'FC',       'Fixed Carbon',      '%',  'decimal', 2, 0, 100, 100),
  (NULL, 'VM',       'Volatile Matter',   '%',  'decimal', 2, 0, 100, 110),
  (NULL, 'Ash',      'Ash',               '%',  'decimal', 2, 0, 100, 120),
  (NULL, 'Si',       'Silicon',           '%',  'decimal', 2, 0, 100, 130)
ON CONFLICT (profit_center_id, property_key) DO NOTHING;

-- ----- Seed: group → property map (operator spec 2026-04-29) -----------
-- ORE (Mn-Ore, Sinter…)
INSERT INTO public.item_group_property_map
  (profit_center_id, material_type, group_name, subgroup, property_key, is_required, sort_order)
VALUES
  (NULL, 'RM', 'ORE', NULL, 'Mn',       true,  10),
  (NULL, 'RM', 'ORE', NULL, 'Fe',       false, 20),
  (NULL, 'RM', 'ORE', NULL, 'SiO2',     false, 30),
  (NULL, 'RM', 'ORE', NULL, 'Al2O3',    false, 40),
  (NULL, 'RM', 'ORE', NULL, 'CaO',      false, 50),
  (NULL, 'RM', 'ORE', NULL, 'MgO',      false, 60),
  (NULL, 'RM', 'ORE', NULL, 'P',        false, 70),
  (NULL, 'RM', 'ORE', NULL, 'S',        false, 80),
  (NULL, 'RM', 'ORE', NULL, 'Moisture', true,  90),
  -- REDUCTANT (Coke, Charcoal…)
  (NULL, 'RM', 'REDUCTANT', NULL, 'FC',       false, 10),
  (NULL, 'RM', 'REDUCTANT', NULL, 'VM',       false, 20),
  (NULL, 'RM', 'REDUCTANT', NULL, 'Ash',      false, 30),
  (NULL, 'RM', 'REDUCTANT', NULL, 'Moisture', false, 40),
  (NULL, 'RM', 'REDUCTANT', NULL, 'Si',       false, 50),
  -- FLUXES (Quartz, Limestone, Dolomite…)
  (NULL, 'RM', 'FLUXES', NULL, 'SiO2',     false, 10),
  (NULL, 'RM', 'FLUXES', NULL, 'CaO',      false, 20),
  (NULL, 'RM', 'FLUXES', NULL, 'MgO',      false, 30),
  (NULL, 'RM', 'FLUXES', NULL, 'Moisture', true,  40),
  (NULL, 'RM', 'FLUXES', NULL, 'Si',       false, 50),
  -- PASTE (Carbon Paste…)
  (NULL, 'RM', 'PASTE', NULL, 'FC',       false, 10),
  (NULL, 'RM', 'PASTE', NULL, 'Ash',      false, 20),
  (NULL, 'RM', 'PASTE', NULL, 'VM',       false, 30),
  (NULL, 'RM', 'PASTE', NULL, 'Moisture', false, 40)
ON CONFLICT (profit_center_id, material_type, group_name, subgroup, property_key) DO NOTHING;
