# Renewly

**Never miss a license renewal.** Calendario y checklist de licencias de alojamiento y comerciales de Turks and Caicos, con renovación en lote para administradores de villas y dueños con varias propiedades.

Nombre interno anterior: Vence TCI.

| Carpeta | Contenido |
|---|---|
| `app/` | La aplicación (Next.js 15, Supabase Auth, Tailwind 4): acceso, organizaciones, equipo con roles e invitaciones. |
| `landing/` | Página de venta pública (Next.js 15, Tailwind 4), en español e inglés. Se publica por separado en su propio dominio. |
| `supabase/` | `config.toml` para Supabase local y migraciones versionadas de Postgres. |
| `tests/db/`, `scripts/test-db.sh` | Pruebas de RLS por rol sobre Postgres (local o CI). |
| `brand/` | Logo en SVG/PNG (claro, oscuro, monocromo), favicon, ícono de app, imagen para redes y scripts para regenerarlos. |
| `docs/` | Plan por fases y decisiones. |

## Página de venta

```bash
cd landing
cp .env.example .env.local   # completa las variables
npm install
npm run dev                  # http://localhost:3000 → /es o /en según el navegador
npm test && npm run lint && npm run typecheck && npm run build
```

Formulario de leads: `POST /api/leads` valida con zod y bloquea bots (campo trampa) y otros orígenes. Limita a 5 envíos por hora por IP, usando un hash de la IP; la IP nunca se guarda. Inserta en `public.leads` con la service role y te avisa por correo con Resend. La tabla tiene RLS activo y ninguna política: nadie la lee desde el navegador.

Analítica: Vercel Web Analytics, sin cookies. Eventos: `hero_cta`, `plan_cta`, `lead_submitted`, `whatsapp_click`, `demo_tab`.

## Regenerar la marca

```bash
NODE_PATH=$(npm root -g) node brand/render.mjs     # PNG del logo
NODE_PATH=$(npm root -g) node brand/render-og.mjs  # imagen para redes 1200x630
```

## Aplicación

Multi-tenant: cada organización es un tenant y toda tabla de datos lleva `tenant_id`, protegida con RLS. Roles: propietario, administrador, operador y solo lectura. Las escrituras sensibles (miembros, invitaciones, roles) pasan solo por funciones de la base de datos que verifican quién llama y dejan registro en `audit_log`. Detalle de las reglas en `supabase/migrations/20261122000002_tenancy.sql`.

```bash
# 1. Supabase local (Docker). Si el registro por defecto falla, añade SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io
npx supabase@2.58.5 start -x imgproxy,vector,postgres-meta,supavisor
# 2. App
cd app && cp .env.example .env.local   # URL y publishable key que imprime `supabase start`; APP_URL=http://localhost:3200
npm install && npm run build && npx next start -p 3200
# 3. Pruebas
npm test && npm run lint && npm run typecheck
npx playwright test --trace off                       # E2E: registro → organización → invitación → roles
PGHOST=/ruta/socket PGUSER=postgres ../scripts/test-db.sh   # RLS por rol sobre Postgres 15+
```

Correos de Auth en local: Mailpit en http://127.0.0.1:54324.

### Entornos

- **Staging** y **producción**: un proyecto de Supabase por entorno. Las migraciones se aplican con `supabase link --project-ref <ref> && supabase db push`, primero en staging.
- En cada proyecto: Authentication → URL Configuration → Site URL = `APP_URL` y `APP_URL/auth/callback` en Redirect URLs; activar "Confirm email".
- Monitoreo: `/api/health` para uptime; los errores del servidor salen como una línea JSON por error (`src/instrumentation.ts`), lista para conectar Sentry.
