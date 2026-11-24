# Lanzamiento

## 1. Entornos

| | Staging | Producción |
|---|---|---|
| Supabase | proyecto nuevo `renewly-staging` (o rama de Supabase) | proyecto actual (ref `mawdjmefsqlshiksofik`) |
| App | `staging-app.<dominio>` (preview de Vercel) | `app.<dominio>` |
| Página de venta | preview | `<dominio>` y `www.<dominio>` |

Migraciones: siempre primero en staging (`supabase link --project-ref <ref> && supabase db push`), luego producción. En producción hoy se aplicaron pegando `supabase/setup/phaseN.sql`; las siguientes ya pueden ir con `supabase db push`.

## 2. Despliegue

**Hoy (24 nov 2026) en Render, plan gratuito**, rama `claude/renewly-saas-tci-6jl9x2` con despliegue automático:

- App: https://renewly-app-5ego.onrender.com (servicio `renewly-app`, build `cd app && npm ci && npm run build`)
- Venta: https://renewly-landing.onrender.com (servicio `renewly-landing`)
- El plan gratuito se duerme tras 15 min sin visitas (primera carga ~50 s) y **no corre los crons de `vercel.json`**: antes del piloto, pasar a Starter o llamar `/api/cron/billing` y `/api/cron/reminders` desde un programador externo con `Authorization: Bearer <CRON_SECRET>`.

### Alternativa: Vercel

Dos proyectos de Vercel apuntando a este repositorio:

- **renewly-app** — Root Directory `app`. Crons en `app/vercel.json` (cobro 11:00 UTC, recordatorios 12:00 UTC).
- **renewly-landing** — Root Directory `landing`.

### Variables de entorno

**App**

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://mawdjmefsqlshiksofik.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key del proyecto |
| `APP_URL` | `https://app.<dominio>` |
| `NEXT_PUBLIC_LANDING_URL` | `https://<dominio>` |
| `SUPABASE_SERVICE_ROLE_KEY` | secret key (solo servidor) |
| `CRON_SECRET` | 32+ caracteres aleatorios |
| `RESEND_API_KEY`, `EMAIL_FROM` | `Renewly <hola@<dominio>>` con el dominio verificado en Resend |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | correo de soporte |

**Página de venta**

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://<dominio>` |
| `NEXT_PUBLIC_APP_URL` | `https://app.<dominio>` (los botones de plan abren el registro) |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | `16493446098` |
| `NEXT_PUBLIC_LEGAL_ENTITY`, `NEXT_PUBLIC_CONTACT_EMAIL` | razón social y correo |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LEADS_IP_SALT` | para guardar leads |
| `RESEND_API_KEY`, `LEADS_NOTIFY_EMAIL`, `LEADS_FROM_EMAIL` | aviso de leads |

### Supabase

- Authentication → URL Configuration: Site URL `https://app.<dominio>`; Redirect URLs `https://app.<dominio>/auth/callback` (y el de staging).
- Authentication → SMTP: Resend, para que los correos de confirmación salgan con tu dominio.
- Authentication → Providers → Email: confirmación de correo activada; protección de contraseñas filtradas activada.
- Plataforma: `insert into public.platform_admins (user_id) select id from auth.users where email = '<tu correo>';`
- En la app, Plataforma → Configuración de cobro: datos bancarios, beneficiario, correo de soporte.

## 3. Monitoreo

- `/api/health` en un monitor de disponibilidad (UptimeRobot, Better Stack o Vercel).
- Errores del servidor: una línea JSON por error en los logs de Vercel (`app/src/instrumentation.ts`). Con cuenta de Sentry se conecta en ese mismo archivo.
- Vercel Web Analytics en la página de venta (eventos `hero_cta`, `plan_cta`, `lead_submitted`, `whatsapp_click`).

## 4. Copias de seguridad

- Supabase Pro: copias diarias automáticas (y PITR opcional). En plan gratuito no hay copias: activar Pro antes de tener clientes.
- Además, `.github/workflows/backup.yml`: volcado diario **cifrado** (AES-256) guardado 30 días como artifact. Secrets: `SUPABASE_DB_URL` y `BACKUP_PASSPHRASE`.
- Probar una restauración al menos una vez antes del piloto.

## 5. Piloto (diciembre 2026 – marzo 2027)

**Objetivo:** 2–3 administradores de villas usando Renewly para el ciclo de la licencia comercial (1–30 abril 2027) y preparando el de alojamiento 2027.

1. **Selección:** leads de la página de venta con 5+ propiedades; idealmente uno en Providenciales y uno en otra isla.
2. **Alta guiada (30 min por videollamada):** crear organización, importar su hoja de cálculo, borrar el ejemplo, invitar a su equipo.
3. **Precio de piloto:** prueba gratis extendida (configurable en Plataforma) y precio de lanzamiento congelado 12 meses a cambio de feedback.
4. **Seguimiento semanal (15 min):** qué usaron, qué faltó, qué no entendieron. Registrar en un documento.
5. **Métricas del brief:** propiedades activas, renovaciones presentadas antes del plazo, % de propiedades con checklist completo, bajas, ingreso por propiedad.
6. **Criterio de éxito:** al menos 2 pilotos presentan sus renovaciones comerciales antes del 30 de abril con Renewly y aceptan pagar.

## 6. Pendientes externos

- Respuesta de Tourism Regulations e IRD (correos enviados el 23 nov 2026) → ajustar requisitos y quitar "provisional".
- Licencia comercial propia para operar Renewly en TCI (pregunta incluida en el correo al IRD) y consulta con contador/abogado.
- Dominio: comprobar disponibilidad (`renewly.tc`, `getrenewly.com`, `renewlytci.com`…) y comprarlo.
- Revisión legal de privacidad y términos.
- Stripe cuando exista empresa en país compatible; WhatsApp cuando haya cuenta de Twilio/Meta.
