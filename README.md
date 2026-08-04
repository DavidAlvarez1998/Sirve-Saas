# Sirva

Sistema de gestión para restaurantes — SaaS multi-tenant.

## Stack

- **Next.js 15** App Router (TypeScript)
- **PostgreSQL** schema-per-tenant vía Supabase + PgBouncer
- **Tailwind CSS v4** con design tokens en `@theme`
- **JWT HS256** — cookie `sirva_session` (páginas) / Bearer token (API)

## Arquitectura

```
src/
├── app/
│   ├── api/          # Route Handlers (thin: validate → service → response)
│   ├── admin/        # Panel administrador del restaurante
│   ├── mesero/       # Vista del mesero (órdenes, mesas)
│   ├── cocina/       # Vista de cocina
│   └── superadmin/   # Panel superadmin (gestión de tenants)
├── lib/
│   ├── db.ts         # Pools de DB: masterDb() + withTenant()
│   ├── services/     # Lógica de negocio (funciones puras)
│   └── schemas/      # Validación Zod
└── middleware.ts      # Resolución de tenant + guard JWT
```

## Multi-tenancy

Cada restaurante tiene su propio schema PostgreSQL (`tenant_{slug}`). Las tablas globales viven en el schema `master`.

- `masterDb()` → queries a `master.*`
- `withTenant(slug, fn)` → queries al schema del tenant

## Desarrollo local

```bash
npm install
npm run dev
```

Configurá las variables de entorno:

```env
DATABASE_URL=
JWT_SECRET=
RESEND_API_KEY=
```

Las migraciones SQL se aplican manualmente contra Supabase desde `supabase/migrations/`.
