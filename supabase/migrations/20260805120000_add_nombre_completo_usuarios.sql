-- Migration: add nombre_completo to master.usuarios
-- Supports self-serve registration: stores the restaurant owner's full name.
--
-- Rollback: ALTER TABLE master.usuarios DROP COLUMN IF EXISTS nombre_completo;

ALTER TABLE master.usuarios
  ADD COLUMN IF NOT EXISTS nombre_completo TEXT NOT NULL DEFAULT '';
