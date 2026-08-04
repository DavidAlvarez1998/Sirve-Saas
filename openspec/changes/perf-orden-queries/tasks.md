# Tasks: perf-orden-queries

**Change**: perf-orden-queries
**Depends on**: spec (#882), design (#883)
**Delivery**: Single PR (estimated ~30 LoC changed)
**Execution order**: TASK-01 → TASK-02 → TASK-03 (sequential; each unlocks the next)

---

## TASK-01 — Parallelize the three tail queries in `buildOrden()` [x]

**Priority**: CRITICAL
**File**: `src/lib/services/ordenes.ts`
**Satisfies**: REQ-parallel-queries, REQ-unchanged-signature, REQ-no-api-regression

### What to do

Replace the three sequential awaits in `buildOrden()` (lines 208–242 at time of writing) with a single `Promise.all()` destructure. The header query (lines 197–206) and the `NotFoundError` guard MUST remain untouched and first.

Exact replacement for the body below `if (!rows[0]) throw ...`:

```ts
  const [itemRows, ingRows, pagoRows] = await Promise.all([
    sql<ItemRow[]>`
      SELECT oi.id, oi.orden_id, oi.producto_id, p.nombre AS nombre_producto,
             oi.cantidad, oi.precio_unitario, oi.notas
      FROM orden_items oi
      JOIN productos p ON p.id = oi.producto_id
      WHERE oi.orden_id = ${id}
      ORDER BY oi.id
    `,
    sql<IngredienteRow[]>`
      SELECT oii.id, oii.item_id, oii.ingrediente_id, ing.nombre,
             oii.cantidad, oii.precio_unitario
      FROM orden_item_ingredientes oii
      JOIN ingredientes ing ON ing.id = oii.ingrediente_id
      WHERE oii.item_id IN (SELECT id FROM orden_items WHERE orden_id = ${id})
      ORDER BY oii.id
    `,
    sql<PagoRow[]>`
      SELECT id, orden_id, monto_pagado, metodo_pago, propina, fecha_pago
      FROM pagos
      WHERE orden_id = ${id}
      ORDER BY id
    `,
  ])

  const ingByItem = new Map<number, OrdenItemIngrediente[]>()
  for (const ir of ingRows) {
    const key = Number(ir.item_id)
    if (!ingByItem.has(key)) ingByItem.set(key, [])
    ingByItem.get(key)!.push(toIngrediente(ir))
  }
  const items = itemRows.map((ir) => toItem(ir, ingByItem.get(Number(ir.id)) ?? []))
  return toOrden(rows[0], items, pagoRows.map(toPago))
```

The `ingByItem` map build and `items.map` move BELOW the `Promise.all` (they consume `ingRows`/`itemRows`). `pagoRows` moves INTO the `Promise.all` (was after the map blocks — no data dependency issue).

### Acceptance criteria

- `tsc --noEmit` passes with zero new errors.
- `buildOrden` has exactly 2 sequential awaits at the top level: the header query and the `Promise.all`.
- No call site in `ordenes.ts`, `cocina.ts`, or any route handler is modified.
- Function signature `(sql: Sql, id: number): Promise<Orden>` is byte-identical.
- Returned `Orden` shape is unchanged (same fields, same types).

### Commit message

```
perf(ordenes): parallelize buildOrden tail queries via Promise.all
```

---

## TASK-02 — Create the FK index migration [x]

**Priority**: CRITICAL
**File**: `supabase/migrations/20260804120000_add_perf_indexes.sql` (new file)
**Satisfies**: REQ-fk-indexes, REQ-migration-constraints

### What to do

Create the migration file at the exact path above with the `\gexec` pattern. The file MUST:

1. Include a header comment block with run instructions (must NOT use `-1`/`--single-transaction`).
2. Use a single `SELECT format(...)` from `master.tenants CROSS JOIN (VALUES ...)` to generate all `CREATE INDEX CONCURRENTLY IF NOT EXISTS` statements, then `\gexec` to execute them.
3. Include the 5 index specs in the VALUES list:
   - `('ordenes_mesa_id', 'ordenes', 'mesa_id')`
   - `('ordenes_estado_pagada', 'ordenes', 'estado, pagada')`
   - `('orden_items_orden_id', 'orden_items', 'orden_id')`
   - `('orden_item_ingredientes_item', 'orden_item_ingredientes', 'item_id')`
   - `('pagos_orden_id', 'pagos', 'orden_id')`
4. Filter `WHERE t.activo = true`.
5. Include a trailing smoke-check SELECT to surface any `indisvalid = false` indexes.
6. Include a commented rollback template (`DROP INDEX CONCURRENTLY IF EXISTS ...` for each).
7. Include a Supabase-editor fallback note (run the SELECT alone, copy output, execute each statement individually).

The generated index names follow the pattern `idx_{slug}_{idx_suffix}` on table `tenant_{slug}.{tbl}`.

Full file content (write verbatim):

```sql
-- Migration: perf_orden_indexes
-- Adds 5 FK/filter indexes across every tenant schema (idempotent, lock-free).
--
-- RUN COMMAND (psql only — do NOT use -1 / --single-transaction):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 20260804120000_add_perf_indexes.sql
--
-- Supabase web editor fallback:
--   Run the SELECT below alone first. Copy each line of output.
--   Paste and execute each CREATE INDEX CONCURRENTLY statement individually.
--   The editor does not support \gexec.

SELECT format(
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_%s_%s ON tenant_%s.%s(%s)',
  t.slug, spec.idx_suffix, t.slug, spec.tbl, spec.cols
)
FROM master.tenants t
CROSS JOIN (VALUES
  ('ordenes_mesa_id',              'ordenes',                  'mesa_id'),
  ('ordenes_estado_pagada',        'ordenes',                  'estado, pagada'),
  ('orden_items_orden_id',         'orden_items',              'orden_id'),
  ('orden_item_ingredientes_item', 'orden_item_ingredientes',  'item_id'),
  ('pagos_orden_id',               'pagos',                    'orden_id')
) AS spec(idx_suffix, tbl, cols)
WHERE t.activo = true
\gexec

-- Smoke check: any index still building or invalid?
SELECT schemaname, indexname, indisvalid
FROM pg_indexes
JOIN pg_index ON indexrelid = (schemaname || '.' || indexname)::regclass
WHERE indexname LIKE 'idx_%_orden%' OR indexname LIKE 'idx_%_pagos%'
  AND NOT indisvalid;

-- Rollback template (copy-paste, run each individually with CONCURRENTLY):
-- SELECT format('DROP INDEX CONCURRENTLY IF EXISTS tenant_%s.idx_%s_%s', t.slug, t.slug, spec.idx_suffix)
-- FROM master.tenants t
-- CROSS JOIN (VALUES
--   ('ordenes_mesa_id'), ('ordenes_estado_pagada'), ('orden_items_orden_id'),
--   ('orden_item_ingredientes_item'), ('pagos_orden_id')
-- ) AS spec(idx_suffix)
-- WHERE t.activo = true
-- \gexec
```

### Acceptance criteria

- File exists at `supabase/migrations/20260804120000_add_perf_indexes.sql`.
- File contains NO top-level `BEGIN`, `START TRANSACTION`, or `DO $$` block.
- File contains `\gexec` after the SELECT.
- All 5 index suffixes are present in the VALUES list.
- `IF NOT EXISTS` appears in the format string.
- Header comment instructs operator NOT to use `-1`.
- Supabase fallback note is present.

### Commit message

```
feat(migrations): add 5 FK/filter indexes across tenant schemas via gexec
```

---

## TASK-03 — Manual verification: confirm index scans in production

**Priority**: HIGH
**File**: none (operator-run query, results documented as comment or in PR description)
**Satisfies**: REQ-fk-indexes (runtime validation), postcondition of design section 4

### What to do

After the migration is applied to at least one tenant, run the following on a real tenant schema to confirm the planner uses the new indexes:

```sql
-- Replace 'demo' with an actual tenant slug and a real orden id.
SET search_path TO tenant_demo;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT oi.id, oi.orden_id, oi.producto_id, p.nombre AS nombre_producto,
       oi.cantidad, oi.precio_unitario, oi.notas
FROM orden_items oi
JOIN productos p ON p.id = oi.producto_id
WHERE oi.orden_id = 42
ORDER BY oi.id;
```

The output MUST show `Index Scan using idx_demo_orden_items_orden_id` (or `Index Only Scan`) for the `orden_items` predicate. A `Seq Scan` on a table with more than ~500 rows is a signal the index was not picked up or is still `indisvalid`.

Also run the smoke-check from TASK-02 to confirm `indisvalid = false` for all indexes.

Document findings in the PR description as a code block (or screenshot of `EXPLAIN ANALYZE` output).

### Acceptance criteria

- `EXPLAIN ANALYZE` on `orden_items WHERE orden_id = ?` shows an index scan (not a seq scan) against a tenant with real data.
- Smoke-check SELECT from TASK-02 returns zero rows (no invalid/building indexes).
- PR description includes the EXPLAIN output or a note that the table has < 1,000 rows (planner may choose seq scan on tiny tables — document explicitly).

### Commit message

No commit — this is a verification step. Results go in the PR description.

---

## Execution Order and Parallelism

```
TASK-01 ──► TASK-02 ──► TASK-03
```

All three are sequential:
- TASK-02 is independent of TASK-01 at the code level, but belongs in the same commit batch. Running them in order keeps the PR reviewable as a logical unit.
- TASK-03 requires TASK-02 to be applied to a live tenant before it can be executed.

---

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~30 (5 in ordenes.ts + ~25 in migration file) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Decision needed before apply | No — proceed |

---

## Risks

| Risk | Task | Mitigation |
|---|---|---|
| postgres.js < 3.x → no pipelining | TASK-01 | Verify `package.json` — `postgres` ≥ 3.x already used by `cocina.ts` Promise.all |
| Operator wraps migration in `--single-transaction` | TASK-02 | Header comment explicitly forbids `-1`; acceptance criteria checks for `\gexec` |
| Supabase editor silently ignores `\gexec` | TASK-02 | Fallback instructions documented in file header |
| New tenant provisioned after migration run misses indexes | TASK-02/03 | Re-run is idempotent (`IF NOT EXISTS`); follow-up: patch `provision_tenant_schema` |
| Index left `indisvalid = false` after concurrent build | TASK-03 | Smoke-check query catches it; rerun `CREATE INDEX CONCURRENTLY` to rebuild |
