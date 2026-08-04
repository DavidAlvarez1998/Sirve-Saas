-- Add subscription expiry column to master.tenants
-- NULL means no expiry (subscription runs indefinitely)
-- Existing rows are unaffected (default NULL)
ALTER TABLE master.tenants
  ADD COLUMN IF NOT EXISTS fecha_vencimiento TIMESTAMPTZ NULL DEFAULT NULL;

-- Rollback: ALTER TABLE master.tenants DROP COLUMN fecha_vencimiento;
