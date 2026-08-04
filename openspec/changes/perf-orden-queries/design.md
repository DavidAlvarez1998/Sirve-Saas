# Design: perf-orden-queries

**Change**: `perf-orden-queries`
**Artifact store**: hybrid (Engram + this file)
**Depends on**: `openspec/changes/perf-orden-queries/proposal.md`

---

## 1. Architectural Approach

**Pattern**: two orthogonal, low-blast-radius optimizations on the hot path (`buildOrden`), each independently deployable and revertible.

1. **Client-side parallelism** — collapse the 3 independent tail queries in `buildOrden()` into a single `Promise.all()` on the reserved connection. Postgres.js v3+ pipelines queued queries over the SAME server connection, so we save `2 × RTT` per call without opening extra sockets and without breaking transactional visibility.
2. **Server-side FK indexes** — add the 5 missing indexes covering the join/filter columns that `buildOrden()`, `getOrdenes()`, `getHistorial()` and cascade DELETEs actually hit. Applied per tenant schema.

**Layering (unchanged)**:

```
Route handler
  └─ withTenant(slug, sql => service(sql))          ← reserves connection, sets search_path
        └─ service (createOrden / addItem / …)
              ├─ BEGIN
              ├─ …mutations…
              ├─ buildOrden(sql, id)                ← THIS is what we optimize
              │     ├─ await sql`SELECT orden…`     ← 1 RTT (existence check + throw)
              │     └─ Promise.all([                ← 1 RTT (pipelined, 3 queries)
              │           sql`SELECT items…`,
              │           sql`SELECT ingredientes…`,
              │           sql`SELECT pagos…`,
              │         ])
              └─ COMMIT
```

**Boundary rule**: no changes to `withTenant()`, `db.ts`, route handlers, error handling, or JSON shape. `buildOrden()`'s signature and return contract are preserved byte-for-byte.

---

## 2. Component / Data Flow — before vs. after

### 2.1 `buildOrden()` — sequential (current, 4 round trips)

```
t=0   ── SELECT orden ──────────────▶ [wait RTT]
t=1   ── SELECT items ──────────────▶ [wait RTT]
t=2   ── SELECT ingredientes ──────▶ [wait RTT]
t=3   ── SELECT pagos ─────────────▶ [wait RTT]
t=4   done
```

### 2.2 `buildOrden()` — pipelined (proposed, 2 round trips)

```
t=0   ── SELECT orden ─────────────▶ [wait RTT]     ← must run first: throws NotFoundError
t=1   ── SELECT items ─────╮
        ── SELECT ing… ────┤ pipelined on same reserved conn
        ── SELECT pagos ───╯──────▶ [wait RTT for last response]
t=2   done
```

**Why the existence check must stay first**: it throws `NotFoundError('Orden no encontrada')` when the header row is absent. If we lumped it into the `Promise.all`, the 3 sibling queries would still execute (wasted work + risk of returning stale rows if the row is being concurrently deleted) and the error message would be lost inside `Promise.all`'s rejection semantics.

### 2.3 Integration points touched

| Callsite | Behavior change |
|---|---|
| `createOrden()` | Faster by 2 RTT (called once at end of BEGIN/COMMIT) |
| `updateOrden()` | Faster by 4 RTT (called twice — once to load, once to reload) |
| `updateEstado()` | Faster by 2 RTT |
| `addItem()` / `addItems()` | Faster by 2 RTT |
| `updateItem()` / `removeItem()` | Faster by 2 RTT |
| `pagarOrden()` | Faster by 2 RTT |
| `separarItem()` | Faster by 2 RTT |
| `dividirOrden()` | Faster by 4 RTT (buildOrden called twice) |
| `getOrdenById()` | Faster by 2 RTT |
| `cocina.getPendientes()` / `getFinalizadas()` | Faster by `N × 2 RTT` where N = number of pending orders |

---

## 3. Fix 1 — `buildOrden()` exact replacement

**File**: `src/lib/services/ordenes.ts`

**Before** (lines 196–245 as they exist today):

```ts
export async function buildOrden(sql: Sql, id: number): Promise<Orden> {
  const rows = await sql<OrdenRow[]>`
    SELECT o.id, o.tipo_orden, o.mesa_id, m.numero AS mesa_numero,
           o.nombre_cliente, o.telefono_cliente, o.direccion_entrega,
           o.fecha_creacion, o.fecha_modificacion, o.estado, o.pagada, o.total_monto
    FROM ordenes o
    LEFT JOIN mesas m ON m.id = o.mesa_id
    WHERE o.id = ${id}
    LIMIT 1
  `
  if (!rows[0]) throw new NotFoundError('Orden no encontrada')

  const itemRows = await sql<ItemRow[]>`
    SELECT oi.id, oi.orden_id, oi.producto_id, p.nombre AS nombre_producto,
           oi.cantidad, oi.precio_unitario, oi.notas
    FROM orden_items oi
    JOIN productos p ON p.id = oi.producto_id
    WHERE oi.orden_id = ${id}
    ORDER BY oi.id
  `

  const ingRows = await sql<IngredienteRow[]>`
    SELECT oii.id, oii.item_id, oii.ingrediente_id, ing.nombre,
           oii.cantidad, oii.precio_unitario
    FROM orden_item_ingredientes oii
    JOIN ingredientes ing ON ing.id = oii.ingrediente_id
    WHERE oii.item_id IN (SELECT id FROM orden_items WHERE orden_id = ${id})
    ORDER BY oii.id
  `

  const ingByItem = new Map<number, OrdenItemIngrediente[]>()
  for (const ir of ingRows) {
    const key = Number(ir.item_id)
    if (!ingByItem.has(key)) ingByItem.set(key, [])
    ingByItem.get(key)!.push(toIngrediente(ir))
  }

  const items = itemRows.map((ir) =>
    toItem(ir, ingByItem.get(Number(ir.id)) ?? [])
  )

  const pagoRows = await sql<PagoRow[]>`
    SELECT id, orden_id, monto_pagado, metodo_pago, propina, fecha_pago
    FROM pagos
    WHERE orden_id = ${id}
    ORDER BY id
  `

  return toOrden(rows[0], items, pagoRows.map(toPago))
}
```

**After** — full replacement function:

```ts
export async function buildOrden(sql: Sql, id: number): Promise<Orden> {
  // Query 1: header (must run first — throws NotFoundError; siblings would be wasted work)
  const rows = await sql<OrdenRow[]>`
    SELECT o.id, o.tipo_orden, o.mesa_id, m.numero AS mesa_numero,
           o.nombre_cliente, o.telefono_cliente, o.direccion_entrega,
           o.fecha_creacion, o.fecha_modificacion, o.estado, o.pagada, o.total_monto
    FROM ordenes o
    LEFT JOIN mesas m ON m.id = o.mesa_id
    WHERE o.id = ${id}
    LIMIT 1
  `
  if (!rows[0]) throw new NotFoundError('Orden no encontrada')

  // Queries 2, 3, 4: fully independent — pipeline over the reserved connection.
  // postgres.js v3+ queues these back-to-back on the same server socket.
  // Safe inside the BEGIN/COMMIT of the caller because the tx is pinned to this connection
  // (see cocina.ts:11,20 for the same pattern in production).
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

  const items = itemRows.map((ir) =>
    toItem(ir, ingByItem.get(Number(ir.id)) ?? [])
  )

  return toOrden(rows[0], items, pagoRows.map(toPago))
}
```

**Diff summary**: three sequential `await` become one `Promise.all([...])` destructuring; the header query stays as the first `await`; the two intermediate `let ingByItem/items` blocks move below the `Promise.all` because they consume `ingRows` and `itemRows`; the `pagoRows` query is folded into the parallel batch (was after the intermediate blocks in the original — that was pure locality, not a data dependency, and moving it up is safe because `toPago(pagoRows)` runs in the final return).

---

## 4. Fix 2 — Migration file

**Filename**: `supabase/migrations/20260804000001_perf_orden_indexes.sql`

**Constraint discovery — non-negotiable Postgres rules**:

- `CREATE INDEX CONCURRENTLY` cannot run inside `BEGIN/COMMIT`.
- It also cannot run inside a `DO $$ ... $$` block or a `plpgsql` function, because those open an implicit transaction (PG error `25001`).
- Therefore we CANNOT write `DO $$ BEGIN FOR t IN … LOOP EXECUTE format('CREATE INDEX CONCURRENTLY …') END LOOP; END $$`.
- The pattern for "loop over tenants + concurrent index" in Postgres is the `psql`-side **`\gexec`** meta-command: a SELECT emits the `CREATE INDEX CONCURRENTLY` statements as plain text rows, and `\gexec` runs each returned string as a top-level, non-transactional statement.

The project's `README`-level convention is "run manually against Supabase" — the operator uses `psql` (Supabase SQL editor also accepts one statement at a time). So the migration file is a `psql`-friendly script.

**Content**:

```sql
-- Migration: perf_orden_indexes
-- Adds 5 missing FK/filter indexes to every tenant schema.
--
-- WHY:
--   The hot-path service functions in src/lib/services/ordenes.ts and cocina.ts
--   filter/join on these columns thousands of times per mesero shift.
--   Without indexes each mutation triggers full sequential scans on
--   orden_items, orden_item_ingredientes, pagos and ordenes(mesa_id).
--
-- HOW TO RUN:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 20260804000001_perf_orden_indexes.sql
--
--   Do NOT wrap the invocation in `psql --single-transaction` or `-1`.
--   CREATE INDEX CONCURRENTLY cannot run inside a transaction block (PG25001).
--   This file uses the psql `\gexec` meta-command to expand a template
--   over every tenant schema at top level, one statement at a time.
--
-- IDEMPOTENT: uses IF NOT EXISTS. Safe to re-run at any time.
-- ONLINE:     uses CONCURRENTLY. No ACCESS EXCLUSIVE lock on the tables.
-- ROLLBACK:   DROP INDEX CONCURRENTLY IF EXISTS <name> per tenant (see bottom).

-- ─── Expand template over every registered tenant ───────────────────────────
-- The SELECT below produces one CREATE INDEX CONCURRENTLY statement per
-- (tenant, index) pair. `\gexec` then executes each returned text row as its
-- own top-level statement — bypassing the transactional restriction.
SELECT format($fmt$
  CREATE INDEX CONCURRENTLY IF NOT EXISTS %I ON %I.%I (%s);
$fmt$,
  idx_name,
  'tenant_' || t.slug,
  table_name,
  columns
)
FROM master.tenants t
CROSS JOIN (VALUES
  ('idx_ordenes_mesa_id',                 'ordenes',                 'mesa_id'),
  ('idx_ordenes_estado_pagada',           'ordenes',                 'estado, pagada'),
  ('idx_orden_items_orden_id',            'orden_items',             'orden_id'),
  ('idx_orden_item_ingredientes_item_id', 'orden_item_ingredientes', 'item_id'),
  ('idx_pagos_orden_id',                  'pagos',                   'orden_id')
) AS specs(idx_name, table_name, columns)
WHERE t.activo = true
ORDER BY t.slug, idx_name;
\gexec

-- ─── Smoke check: no INVALID indexes were left behind ───────────────────────
-- If any row returns here, re-run the corresponding statement or DROP + retry.
SELECT n.nspname   AS schema,
       c.relname   AS index,
       i.indisvalid
FROM pg_index i
JOIN pg_class c   ON c.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname LIKE 'tenant\_%' ESCAPE '\'
  AND c.relname IN (
    'idx_ordenes_mesa_id',
    'idx_ordenes_estado_pagada',
    'idx_orden_items_orden_id',
    'idx_orden_item_ingredientes_item_id',
    'idx_pagos_orden_id'
  )
  AND i.indisvalid = false;

-- ─── Rollback (manual, per tenant) ──────────────────────────────────────────
--   SELECT format('DROP INDEX CONCURRENTLY IF EXISTS %I.%I;',
--                 'tenant_' || t.slug, idx_name)
--   FROM master.tenants t
--   CROSS JOIN (VALUES
--     ('idx_ordenes_mesa_id'),
--     ('idx_ordenes_estado_pagada'),
--     ('idx_orden_items_orden_id'),
--     ('idx_orden_item_ingredientes_item_id'),
--     ('idx_pagos_orden_id')
--   ) AS specs(idx_name)
--   WHERE t.activo = true;
--   \gexec
```

**Coverage table — why these 5 indexes**:

| Index | Table | Columns | Query it accelerates |
|---|---|---|---|
| `idx_ordenes_mesa_id` | `ordenes` | `mesa_id` | `LEFT JOIN mesas m ON m.id = o.mesa_id` in every list/read query; `WHERE mesa_id = ?` in `createOrden` uniqueness check |
| `idx_ordenes_estado_pagada` | `ordenes` | `estado, pagada` | `getOrdenes()` filter `WHERE estado NOT IN (…) AND NOT (estado='ENTREGADA' AND pagada=true)`; `getHistorial()` filter; `cocina.getPendientes/getFinalizadas` filter |
| `idx_orden_items_orden_id` | `orden_items` | `orden_id` | Every `WHERE orden_id = ?` in `buildOrden`, `updateItem`, `removeItem`, `recalcularTotal`; also required for cascade delete performance |
| `idx_orden_item_ingredientes_item_id` | `orden_item_ingredientes` | `item_id` | `WHERE item_id = ?` and `WHERE item_id IN (…)` in `buildOrden`, `updateItem`, `separarItem`; cascade delete from `orden_items` |
| `idx_pagos_orden_id` | `pagos` | `orden_id` | `WHERE orden_id = ?` in `buildOrden`, `pagarOrden` total check; cascade delete |

**Supabase-editor fallback**: if the operator prefers the Supabase web SQL editor (which does not honor `\gexec`), the equivalent workflow is to run the first `SELECT format(...) ... ;` on its own to obtain the list of `CREATE INDEX CONCURRENTLY` statements as text output, copy them out, then paste and execute each one individually with the editor's "Run" set to non-transactional mode.

---

## 5. Files changed

| File | Change | LoC delta |
|---|---|---|
| `src/lib/services/ordenes.ts` | Replace `buildOrden()` body: 3 sequential `await` → `Promise.all([…])`; move `ingByItem`/`items` map construction below the parallel batch. Signature and return shape unchanged. | ~+3 / −5 |
| `supabase/migrations/20260804000001_perf_orden_indexes.sql` | New. Emits & runs 5 × N-tenants `CREATE INDEX CONCURRENTLY IF NOT EXISTS` via `\gexec`. Includes smoke check + commented rollback. | +60 new |

No changes to: `src/lib/db.ts`, `withTenant()`, route handlers, `cocina.ts`, `recalcularTotal()`, other service functions, error types, JSON contract, tests (except any new perf-focused test added by tasks phase).

---

## 6. ADRs (Architecture Decision Records)

### ADR-1 — Use `Promise.all()` on the reserved connection

**Status**: Accepted

**Context**: `buildOrden()` currently issues 4 sequential `await sql\`…\`` calls on the reserved connection provided by `withTenant()`. Each `await` pays a full network round trip to Supabase before the next query is even sent. Three of the four queries are provably independent (items, ingredientes, pagos all keyed on the same `orden_id`) and can be issued together.

**Decision**: Wrap the last three queries in a single `Promise.all([...])` on the SAME `sql` reference. Do not spawn additional connections. Keep the first (header) query sequential so its `NotFoundError` remains authoritative and no wasted work is dispatched.

**Rationale**:
- postgres.js v3+ implements **pipelining**: when multiple queries are queued on one connection before the first response arrives, they are written back-to-back on the wire and correlated by order on read. This is exactly what `Promise.all` on the same client triggers.
- Because it's the same server-side connection, the `BEGIN/COMMIT` transaction that wraps every mutation still owns all three reads — they see the just-inserted rows and roll back together on error.
- **Precedent in this codebase**: `src/lib/services/cocina.ts` lines 11 and 20 already run `Promise.all(rows.map(r => buildOrden(sql, Number(r.id))))` on the same reserved `sql`. That pattern has been in production and validates the transactional and PgBouncer behavior.
- Save: ~2 RTT per `buildOrden()` call. In `dividirOrden()`, which calls `buildOrden` twice, that's 4 RTT. On a Vercel↔Supabase link 20–80 ms per RTT is typical, so the observable p95 improvement is meaningful without changing any infra.

**Rejected alternatives**:

1. **Open a second connection and run reads in true parallel.** Would break transactional visibility (the second connection sits outside `BEGIN/COMMIT`, cannot see uncommitted writes from `addItem`, `updateItem`, etc.). Also doubles connection pressure on PgBouncer. Rejected.
2. **Move `buildOrden` outside the transaction (i.e., commit first, then read).** Would return stale data if concurrent modifications happen between COMMIT and the reads, and would need to re-do error handling paths. Rejected.
3. **Consolidate all 4 queries into one JSON-aggregating SQL statement.** See ADR-4 for the full analysis — deferred as a separate change.
4. **Cache the result and skip the reload after each mutation.** Would require full invalidation logic and a source-of-truth debate. Out of scope for a perf hotfix.

**Consequences**:
- Positive: 33–50% latency reduction per `buildOrden` call, zero infra change, ~10 line diff, revertable with `git revert`.
- Neutral: Error semantics preserved (any of the three parallel queries can still reject; `Promise.all` propagates the first rejection; the surrounding `try/catch` in each caller runs `ROLLBACK` unchanged).
- Risk: Very low; the pattern is already in production in `cocina.ts`.

---

### ADR-2 — Use `CREATE INDEX CONCURRENTLY`

**Status**: Accepted

**Context**: The 5 indexes we're adding target hot production tables (`ordenes`, `orden_items`, `orden_item_ingredientes`, `pagos`) that receive writes from every mesero action. The application is live and multi-tenant.

**Decision**: Use `CREATE INDEX CONCURRENTLY` for all 5 indexes.

**Rationale**:
- The plain `CREATE INDEX` variant acquires an `ACCESS EXCLUSIVE` lock on the table for the duration of the build, which blocks **all reads and writes**. On a live restaurant floor that would mean freezing mesero and cocina apps for the duration of every tenant's build.
- `CONCURRENTLY` acquires only a `SHARE UPDATE EXCLUSIVE` lock, which does not block `SELECT`, `INSERT`, `UPDATE`, or `DELETE`. Builds are slower and require two table scans, but the tables here are small (thousands of rows per tenant at most) so the extra time is trivial.

**Rejected alternatives**:

1. **Plain `CREATE INDEX`.** Rejected — blocks all traffic. Not acceptable for a live SaaS with restaurants actively taking orders.
2. **`CREATE INDEX ... WITH (deferrable)` or "hot standby" tricks.** Not applicable to Supabase's managed setup and adds complexity without meaningful benefit at our table sizes.

**Consequences**:
- Positive: zero downtime, zero user-visible impact during rollout.
- Negative: cannot run inside a transaction block (see ADR-3 for how we handle that). If a `CONCURRENTLY` build is interrupted, it can leave an `INVALID` index — mitigated by the smoke-check SELECT at the bottom of the migration.
- Neutral: takes 2–3× longer than plain `CREATE INDEX`, but on our table sizes still sub-second per tenant.

---

### ADR-3 — Use `IF NOT EXISTS` + operator-run migration + `\gexec` looping

**Status**: Accepted

**Context**: Three coupled constraints:

1. `CREATE INDEX CONCURRENTLY` cannot run inside a `BEGIN/COMMIT` (PG error `25001`).
2. It also cannot run inside `DO $$ … $$` or a `plpgsql` function — those open an implicit transaction.
3. We have `N` tenant schemas (`tenant_<slug>`) and need the same 5 indexes in each. `N` grows with signups, so hardcoding tenant names would rot.

**Decision**:
- Every `CREATE INDEX` statement uses `IF NOT EXISTS` — the migration is fully idempotent.
- The migration file uses the psql-native `\gexec` meta-command: a SELECT emits `CREATE INDEX CONCURRENTLY …` strings, `\gexec` runs each returned string as a top-level, non-transactional statement — sidestepping the `DO $$` restriction.
- Operator runs the file with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <file>` (no `-1` / `--single-transaction`).

**Rationale**:
- `IF NOT EXISTS` = safe re-runs. If any step fails partway (network blip, tenant added mid-run) the operator just re-runs the file; already-built indexes are skipped.
- `\gexec` is the standard psql idiom for exactly this scenario (per-schema DDL with `CONCURRENTLY`). No PL/pgSQL wrapper needed, no separate application-layer runner.
- Looping over `master.tenants WHERE activo = true` auto-covers new tenants added since the last run.

**Rejected alternatives**:

1. **`DO $$ FOR t IN … LOOP EXECUTE 'CREATE INDEX CONCURRENTLY …' END LOOP; END $$`.** Fails at runtime with `25001 CREATE INDEX CONCURRENTLY cannot run inside a transaction block`. Non-starter.
2. **Static per-tenant hardcoded `CREATE INDEX CONCURRENTLY` statements.** Requires editing the migration every time a tenant is created. Rots immediately. Rejected.
3. **Application-layer script (Node.js loop over tenants calling `psql`).** Adds a moving part (a script the operator has to trust and locate) for zero gain over `\gexec`, which is native to the tool they already use. Rejected.
4. **Add the indexes to `master.provision_tenant_schema` and re-provision.** `provision_tenant_schema` is meant for new tenants; re-invoking it doesn't add indexes to existing schemas. Rejected — but the tasks phase should also update `provision_tenant_schema` so **new** tenants get the indexes at creation time (see Follow-ups).

**Consequences**:
- Positive: single file, idempotent, correct under concurrent tenant creation.
- Negative: operator must know not to wrap in `--single-transaction`; the migration header explicitly documents this.
- Positive: the smoke-check SELECT at the bottom surfaces any `indisvalid=false` rows so partial failures are visible.

---

### ADR-4 — Do NOT consolidate `buildOrden()` into a single JSON-agg query now

**Status**: Accepted (deliberately deferred)

**Context**: A common "senior" instinct is to collapse the entire read into one round trip:

```sql
SELECT
  row_to_json(o.*) AS orden,
  (SELECT json_agg(...) FROM orden_items WHERE orden_id = o.id) AS items,
  (SELECT json_agg(...) FROM orden_item_ingredientes WHERE …) AS ingredientes,
  (SELECT json_agg(...) FROM pagos WHERE orden_id = o.id) AS pagos
FROM ordenes o LEFT JOIN mesas m …
WHERE o.id = $1
```

That would drop from 4 RTT to 1 RTT.

**Decision**: Do NOT do this in the current change. Ship the `Promise.all` win (4 RTT → 2 RTT) now; keep the single-query rewrite as a future change if the p95 numbers justify it.

**Rationale**:
- **Blast radius.** The Promise.all change is a ~10-line diff with an obvious equivalence proof (same 4 queries, same postgres.js, same connection, same tx). The single-query rewrite is a full rewrite of `buildOrden`'s SQL AND all row-mapping (`toOrden`/`toItem`/`toIngrediente`/`toPago`), which touches contract-shaping code and needs equivalence testing on real production shapes (nulls, empty arrays, decimal → number coercion).
- **Diminishing returns for the risk taken.** RTT #1 → RTT #2 saves ~40 ms (typical Vercel↔Supabase RTT); RTT #2 → RTT #1 saves another ~40 ms. The first save costs 10 lines; the second costs a rewrite plus test scaffolding.
- **The index migration is the bigger structural win.** Adding the missing FK indexes changes the query plans from Seq Scan to Index Scan, which for large tenants is orders of magnitude better than either RTT optimization. That win exists independently of query count.
- **Separation of concerns for rollback.** If a JSON-agg rewrite regresses, we lose the round-trip win too. Shipped separately, each optimization can be reverted without touching the other.

**Rejected alternatives**:

1. **Ship JSON-agg now, skip Promise.all.** Higher risk, longer PR, larger review surface. Rejected as unjustified for a perf hotfix.
2. **Ship both in the same PR.** Doubles the diff and couples two independent revert paths. Rejected.

**Consequences**:
- Positive: cheap, low-risk PR gets shipped fast; index migration handles the P50/P99 tails independently.
- Neutral: leaves ~40 ms of theoretical improvement on the table. Reassess after 2 weeks of production metrics; open a follow-up SDD `perf-orden-json-agg` if the numbers justify it.

---

## 7. Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Postgres.js version below 3.x → no pipelining | Low | Medium | package.json check in tasks phase; the codebase already relies on this via `cocina.ts` |
| PgBouncer transaction mode breaks pipelining | Very Low | High | `withTenant()` uses `.reserve()` which pins the underlying server connection for the callback; pipelining stays on that pinned socket |
| `CREATE INDEX CONCURRENTLY` leaves `indisvalid=false` after interrupt | Low | Medium | Smoke-check SELECT at bottom of migration; operator drops + re-creates the invalid index |
| Migration script wrapped in `--single-transaction` by mistake | Low | High | Migration header explicitly documents "do NOT use `-1`" |
| Newly-provisioned tenant misses the indexes | Medium | Low | Operator re-runs the migration after tenant creation (idempotent); a follow-up change should update `master.provision_tenant_schema` to include the indexes at creation time |
| Supabase web SQL editor does not honor `\gexec` | High (if that path is used) | Low | Fallback documented in §4 — run the SELECT alone to get the statements, then paste them one at a time |
| Promise.all changes error propagation semantics for callers | Very Low | Low | All callers wrap `buildOrden` in `try/catch → ROLLBACK`; `Promise.all` rejects with the first error which is exactly what a sequential `await` chain would have done |

**Assumptions**:
- postgres.js is at v3.x or newer (verify in `package.json` during tasks phase).
- `master.tenants.activo = true` accurately reflects the set of tenants whose schemas exist. If deactivated tenants still have schemas, they're allowed to lag on the new indexes.
- Restaurant floor traffic during the migration window can tolerate the small extra I/O of an online index build (should be invisible given table sizes).

---

## 8. Follow-ups (out of scope for this change)

- Update `master.provision_tenant_schema` so newly created tenants receive these indexes at creation time (small, separate change).
- Measure p95 of `buildOrden` in production for 2 weeks; if a further ~40 ms is worth the risk, open `perf-orden-json-agg` to collapse to a single JSON-agg query.
- Address the N+1 loops in `addItems`, `updateItem`, `separarItem`, `dividirOrden` (separate SDD as noted in proposal).
- Convert `recalcularTotal`'s correlated subquery into a set-based UPDATE (separate SDD).
