-- Master schema: platform tables (tenants + usuarios + invitaciones)
-- Adapted from Flyway master/V1__init.sql + master/V2__invitaciones.sql

-- pgcrypto provides gen_random_uuid(). Already available in Supabase by default.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS master;

CREATE TABLE IF NOT EXISTS master.tenants (
    id         BIGSERIAL    PRIMARY KEY,
    slug       VARCHAR(63)  NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
    nombre     VARCHAR(255) NOT NULL,
    activo     BOOLEAN      NOT NULL DEFAULT TRUE,
    db_schema  VARCHAR(80)  NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS master.usuarios (
    id            BIGSERIAL    PRIMARY KEY,
    username      VARCHAR(80)  NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email         VARCHAR(255) NULL,
    tenant_slug   VARCHAR(63)  NULL,    -- NULL for SUPERADMIN
    activo        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_usuario_tenant UNIQUE (username, tenant_slug),
    CONSTRAINT fk_usuario_tenant FOREIGN KEY (tenant_slug)
        REFERENCES master.tenants(slug) ON DELETE RESTRICT
);

-- Unicidad por (email, tenant_slug): mismo email puede ser dueño de múltiples tenants.
-- NULL emails no colisionan entre sí (comportamiento default PostgreSQL).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_usuario_email_tenant'
    ) THEN
        ALTER TABLE master.usuarios
            ADD CONSTRAINT uq_usuario_email_tenant UNIQUE (email, tenant_slug);
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS master.usuario_roles (
    usuario_id BIGINT      NOT NULL REFERENCES master.usuarios(id) ON DELETE CASCADE,
    rol        VARCHAR(20) NOT NULL CHECK (rol IN ('SUPERADMIN', 'ADMIN', 'MESERO', 'COCINA')),
    PRIMARY KEY (usuario_id, rol)
);

CREATE TABLE IF NOT EXISTS master.invitaciones (
    id          BIGSERIAL    PRIMARY KEY,
    token       UUID         NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    tenant_slug VARCHAR(63)  NOT NULL REFERENCES master.tenants(slug) ON DELETE CASCADE,
    email       VARCHAR(255) NOT NULL,
    usado       BOOLEAN      NOT NULL DEFAULT FALSE,
    expires_at  TIMESTAMPTZ  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_username        ON master.usuarios(username);
CREATE INDEX IF NOT EXISTS idx_usuarios_tenant          ON master.usuarios(tenant_slug);
CREATE INDEX IF NOT EXISTS idx_invitaciones_token       ON master.invitaciones(token);
CREATE INDEX IF NOT EXISTS idx_invitaciones_tenant_slug ON master.invitaciones(tenant_slug);
