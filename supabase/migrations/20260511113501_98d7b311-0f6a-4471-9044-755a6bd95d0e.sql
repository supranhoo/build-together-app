-- PR6: Polymorphic approvals — unified read-only view over heat_log_approvals + clu_heats
-- security_invoker = true so base-table RLS still applies (RLS on heat_log_approvals
-- and clu_heats is unchanged).

CREATE OR REPLACE VIEW public.production_approvals_v
WITH (security_invoker = true) AS
SELECT
  ('heat_log:' || hla.id)                    AS id,
  'heat_log'::text                           AS source,
  hla.id                                     AS source_row_id,
  hla.heat_log_id                            AS entity_id,
  hla.profit_center_id                       AS profit_center_id,
  CASE hla.status::text
    WHEN 'pending'  THEN 'pending'
    WHEN 'approved' THEN 'approved'
    WHEN 'rejected' THEN 'rejected'
    ELSE hla.status::text
  END                                        AS status,
  hl.heat_number                             AS heat_number,
  hl.tap_time                                AS event_time,
  hla.submitted_by                           AS submitted_by,
  hla.submitted_at                           AS submitted_at,
  hla.decided_by                             AS decided_by,
  hla.decided_at                             AS decided_at,
  hla.notes                                  AS notes
FROM public.heat_log_approvals hla
JOIN public.heat_logs hl ON hl.id = hla.heat_log_id

UNION ALL

SELECT
  ('clu_heat:' || ch.id)                     AS id,
  'clu_heat'::text                           AS source,
  ch.id                                      AS source_row_id,
  ch.id                                      AS entity_id,
  ch.profit_center_id                        AS profit_center_id,
  CASE ch.status
    WHEN 'pending_approval' THEN 'pending'
    WHEN 'approved'         THEN 'approved'
    WHEN 'rejected'         THEN 'rejected'
    WHEN 'voided'           THEN 'rejected'
    ELSE ch.status
  END                                        AS status,
  ch.heat_number                             AS heat_number,
  (ch.heat_date::timestamptz)                AS event_time,
  ch.created_by                              AS submitted_by,
  COALESCE(
    (SELECT (t->>'at')::timestamptz
       FROM jsonb_array_elements(COALESCE(ch.metadata->'transitions','[]'::jsonb)) t
      WHERE t->>'to' = 'pending_approval'
      ORDER BY (t->>'at')::timestamptz DESC
      LIMIT 1),
    ch.updated_at
  )                                          AS submitted_at,
  (SELECT (t->>'actor')::uuid
     FROM jsonb_array_elements(COALESCE(ch.metadata->'transitions','[]'::jsonb)) t
    WHERE t->>'to' IN ('approved','rejected','voided')
    ORDER BY (t->>'at')::timestamptz DESC
    LIMIT 1)                                 AS decided_by,
  (SELECT (t->>'at')::timestamptz
     FROM jsonb_array_elements(COALESCE(ch.metadata->'transitions','[]'::jsonb)) t
    WHERE t->>'to' IN ('approved','rejected','voided')
    ORDER BY (t->>'at')::timestamptz DESC
    LIMIT 1)                                 AS decided_at,
  (SELECT t->>'reason'
     FROM jsonb_array_elements(COALESCE(ch.metadata->'transitions','[]'::jsonb)) t
    WHERE t->>'reason' IS NOT NULL
    ORDER BY (t->>'at')::timestamptz DESC
    LIMIT 1)                                 AS notes
FROM public.clu_heats ch
WHERE ch.status <> 'draft';

GRANT SELECT ON public.production_approvals_v TO authenticated;

COMMENT ON VIEW public.production_approvals_v IS
  'PR6: read-only unified approvals queue. Submit/decide actions still hit source tables (heat_log_approvals or clu_heats via transitionHeat).';
