# Plan de pruebas

## Automáticas (CI en cada push)

| Capa | Comando | Qué cubre |
|---|---|---|
| Unitarias app (37) | `cd app && npm test` | estados y fechas, CSV, correos, PDF de factura/recibo/paquete, roles, rutas, traducciones |
| Unitarias venta (17) | `cd landing && npm test` | formulario de leads, límite, escape de HTML, traducciones, fuentes oficiales |
| Base de datos | `PGHOST=… PGUSER=postgres ./scripts/test-db.sh` | RLS por rol, aislamiento, cobro completo, límites, suspensión, renovaciones (Postgres 16) |
| Almacenamiento | `node tests/storage/storage-rls.mjs` | 12 casos de permisos de archivos contra Supabase |
| E2E (8) | `cd app && npx playwright test --trace off` | equipo, flujo principal, cobro manual, renovaciones (Supabase local) |
| Lint y tipos | `npm run lint && npm run typecheck` | ambas apps |
| Linter de Supabase | `npx supabase db lint` | esquema |

Las pruebas de base de datos también se corren contra el Postgres de Supabase local. En cada fase se inyectó una falla a propósito (quitar un permiso) para confirmar que las pruebas la detectan.

## Manuales antes del lanzamiento (staging)

1. Registro con correo real: llega la confirmación (Resend configurado en Supabase Auth → SMTP).
2. Invitación por correo real: llega, el enlace funciona y vence a los 7 días.
3. Página de venta: el lead llega a Supabase y el aviso a tu correo; el límite responde 429 al sexto envío.
4. Cobro: elegir plan, recibir la factura por correo, subir comprobante, aprobar desde Plataforma, recibir el recibo.
5. Tareas diarias: llamar `/api/cron/billing` y `/api/cron/reminders` con la clave; revisar la respuesta y los correos.
6. Renovación: preparar una con documentos reales (PDF y fotos), descargar el paquete y revisar que se lea bien impreso.
7. Móvil: panel, checklist con foto desde el teléfono, subida de comprobante.
8. Inglés: cambiar idioma en toda la app y en la página de venta.
9. Copias: correr `backup.yml` a mano, descargar el archivo, descifrarlo y restaurarlo en un proyecto de prueba.

## Piloto (antes del 1 de abril de 2027)

Ver `docs/launch.md` → "Piloto".
