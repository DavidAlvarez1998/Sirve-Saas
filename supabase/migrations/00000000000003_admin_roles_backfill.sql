-- Migration: admin_roles_backfill
-- Purpose: grant MESERO and COCINA roles to all existing tenant admins
-- Safe to re-run: ON CONFLICT DO NOTHING
-- Scoped to tenant users only: tenant_slug IS NOT NULL excludes SUPERADMIN rows
--
-- down.sql (to reverse):
--   DELETE FROM master.usuario_roles
--   WHERE rol IN ('MESERO', 'COCINA')
--     AND usuario_id IN (
--       SELECT u.id FROM master.usuarios u
--       WHERE u.tenant_slug IS NOT NULL
--         AND EXISTS (
--           SELECT 1 FROM master.usuario_roles ur
--           WHERE ur.usuario_id = u.id AND ur.rol = 'ADMIN'
--         )
--     );

INSERT INTO master.usuario_roles (usuario_id, rol)
SELECT u.id, r.rol
FROM master.usuarios u
CROSS JOIN (VALUES ('MESERO'), ('COCINA')) AS r(rol)
WHERE u.tenant_slug IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM master.usuario_roles ur
    WHERE ur.usuario_id = u.id AND ur.rol = 'ADMIN'
  )
ON CONFLICT DO NOTHING;
