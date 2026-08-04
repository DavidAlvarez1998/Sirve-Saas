-- Migration: add FK/filter indexes for performance across all tenant schemas
--
-- IMPORTANT — run instructions:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 20260804120000_add_perf_indexes.sql
--
--   Do NOT use --single-transaction / -1 with this file.
--   CREATE INDEX CONCURRENTLY cannot run inside a transaction block (PG25001).
--
-- Supabase web editor fallback (editor ignores \gexec):
--   1. Run the SELECT below alone to generate the CREATE INDEX statements.
--   2. Copy the text output and paste each statement into a new editor tab.
--   3. Run each CREATE INDEX CONCURRENTLY statement individually.
--
-- Idempotency: IF NOT EXISTS guards every statement — safe to re-run.
-- New tenant coverage: re-run this file after provisioning a new tenant schema.

SELECT format(
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_%s_%s ON tenant_%s.%s(%s)',
  t.slug,
  spec.idx_suffix,
  t.slug,
  spec.tbl,
  spec.cols
)
FROM master.tenants t
CROSS JOIN (VALUES
  ('ordenes_mesa_id',              'ordenes',                 'mesa_id'),
  ('ordenes_estado_pagada',        'ordenes',                 'estado, pagada'),
  ('orden_items_orden_id',         'orden_items',             'orden_id'),
  ('orden_item_ingredientes_item', 'orden_item_ingredientes', 'item_id'),
  ('pagos_orden_id',               'pagos',                   'orden_id')
) AS spec(idx_suffix, tbl, cols)
WHERE t.activo = true
\gexec

-- Smoke-check: run after migration to confirm all indexes are valid.
-- Expected: zero rows returned means all indexes are valid (indisvalid = true).
-- SELECT schemaname, indexname
-- FROM pg_indexes
-- JOIN pg_index ON pg_index.indexrelid = (schemaname || '.' || indexname)::regclass
-- WHERE NOT pg_index.indisvalid
--   AND indexname LIKE 'idx_%_ordenes_%'
--      OR indexname LIKE 'idx_%_orden_items_%'
--      OR indexname LIKE 'idx_%_orden_item_ingredientes_%'
--      OR indexname LIKE 'idx_%_pagos_%';

-- Rollback template (run manually if needed — one per tenant per index):
-- DROP INDEX CONCURRENTLY IF EXISTS tenant_{slug}.idx_{slug}_ordenes_mesa_id;
-- DROP INDEX CONCURRENTLY IF EXISTS tenant_{slug}.idx_{slug}_ordenes_estado_pagada;
-- DROP INDEX CONCURRENTLY IF EXISTS tenant_{slug}.idx_{slug}_orden_items_orden_id;
-- DROP INDEX CONCURRENTLY IF EXISTS tenant_{slug}.idx_{slug}_orden_item_ingredientes_item;
-- DROP INDEX CONCURRENTLY IF EXISTS tenant_{slug}.idx_{slug}_pagos_orden_id;
