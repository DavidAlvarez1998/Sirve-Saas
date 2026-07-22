-- Provision tenant schema function
-- Called from TenantService.createTenant() when a new tenant is created.
-- The slug is also validated in application code (db.ts schemaName()) before reaching here,
-- but we validate again in SQL as defense-in-depth against direct DB calls.

CREATE OR REPLACE FUNCTION master.provision_tenant_schema(p_slug TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_schema_name TEXT;
BEGIN
    -- Validate slug: only lowercase alphanumerics and hyphens
    IF p_slug !~ '^[a-z0-9][a-z0-9-]*$' THEN
        RAISE EXCEPTION 'Invalid tenant slug: %. Must match ^[a-z0-9][a-z0-9-]*$', p_slug;
    END IF;

    v_schema_name := 'tenant_' || p_slug;

    -- Create the tenant schema
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema_name);

    -- mesas
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.mesas (
            id     BIGSERIAL    PRIMARY KEY,
            numero VARCHAR(20)  NOT NULL UNIQUE
        )', v_schema_name);

    -- productos
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.productos (
            id          BIGSERIAL      PRIMARY KEY,
            nombre      VARCHAR(255)   NOT NULL,
            descripcion TEXT           NULL,
            precio      NUMERIC(10, 2) NOT NULL CHECK (precio >= 0),
            tipo        VARCHAR(50)    NOT NULL,
            imagen_url  TEXT           NULL
        )', v_schema_name);

    -- ingredientes
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.ingredientes (
            id         BIGSERIAL      PRIMARY KEY,
            nombre     VARCHAR(255)   NOT NULL,
            precio     NUMERIC(10, 2) NOT NULL CHECK (precio >= 0),
            imagen_url TEXT           NULL
        )', v_schema_name);

    -- productos_ingredientes
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.productos_ingredientes (
            producto_id    BIGINT NOT NULL REFERENCES %I.productos(id) ON DELETE CASCADE,
            ingrediente_id BIGINT NOT NULL REFERENCES %I.ingredientes(id) ON DELETE CASCADE,
            PRIMARY KEY (producto_id, ingrediente_id)
        )', v_schema_name, v_schema_name, v_schema_name);

    -- ordenes
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.ordenes (
            id                 BIGSERIAL      PRIMARY KEY,
            tipo_orden         VARCHAR(30)    NOT NULL,
            mesa_id            BIGINT         NULL REFERENCES %I.mesas(id) ON DELETE SET NULL,
            nombre_cliente     VARCHAR(255)   NULL,
            telefono_cliente   VARCHAR(50)    NULL,
            direccion_entrega  TEXT           NULL,
            fecha_creacion     TIMESTAMP      NOT NULL DEFAULT NOW(),
            fecha_modificacion TIMESTAMP      NULL,
            estado             VARCHAR(30)    NOT NULL DEFAULT ''ABIERTA'',
            pagada             BOOLEAN        NOT NULL DEFAULT FALSE,
            total_monto        NUMERIC(12, 2) NULL
        )', v_schema_name, v_schema_name);

    -- orden_items
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.orden_items (
            id              BIGSERIAL      PRIMARY KEY,
            orden_id        BIGINT         NOT NULL REFERENCES %I.ordenes(id) ON DELETE CASCADE,
            producto_id     BIGINT         NOT NULL REFERENCES %I.productos(id),
            cantidad        INTEGER        NOT NULL CHECK (cantidad > 0),
            precio_unitario NUMERIC(10, 2) NOT NULL,
            notas           TEXT           NULL
        )', v_schema_name, v_schema_name, v_schema_name);

    -- orden_item_ingredientes
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.orden_item_ingredientes (
            id              BIGSERIAL      PRIMARY KEY,
            item_id         BIGINT         NOT NULL REFERENCES %I.orden_items(id) ON DELETE CASCADE,
            ingrediente_id  BIGINT         NOT NULL REFERENCES %I.ingredientes(id),
            cantidad        NUMERIC(10, 2) NULL,
            precio_unitario NUMERIC(10, 2) NULL
        )', v_schema_name, v_schema_name, v_schema_name);

    -- pagos
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.pagos (
            id           BIGSERIAL      PRIMARY KEY,
            orden_id     BIGINT         NOT NULL REFERENCES %I.ordenes(id) ON DELETE CASCADE,
            monto_pagado NUMERIC(10, 2) NOT NULL CHECK (monto_pagado > 0),
            metodo_pago  VARCHAR(30)    NOT NULL,
            propina      NUMERIC(10, 2) NULL,
            fecha_pago   TIMESTAMP      NOT NULL DEFAULT NOW()
        )', v_schema_name, v_schema_name);

END;
$$;
