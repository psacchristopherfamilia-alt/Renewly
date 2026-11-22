# Renewly

**Never miss a license renewal.** Calendario y checklist de licencias de alojamiento y comerciales de Turks and Caicos, con renovación en lote para administradores de villas y dueños con varias propiedades.

Nombre interno anterior: Vence TCI.

| Carpeta | Contenido |
|---|---|
| `landing/` | Página de venta pública (Next.js 15, Tailwind 4), en español e inglés. Se publica por separado en su propio dominio. |
| `supabase/migrations/` | Migraciones versionadas de Postgres (Supabase). |
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
