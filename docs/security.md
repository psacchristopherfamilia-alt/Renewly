# Seguridad · revisión antes del lanzamiento (23 nov 2026)

## Modelo

- **Multi-tenant:** cada organización es un tenant; toda tabla de datos lleva `tenant_id` y RLS. Las llaves compuestas `(id, tenant_id)` impiden enlazar datos de dos organizaciones aunque la petición se falsifique.
- **Roles en la base de datos:** propietario > administrador > operador > solo lectura. Las escrituras sensibles (miembros, invitaciones, cobro, trámites) pasan solo por funciones `security definer` con `search_path` vacío que validan quién llama.
- **Plataforma:** el operador de Renewly (`platform_admins`, alta solo por SQL) aprueba pagos y ve el cobro de todos; no ve propiedades ni documentos de los clientes.
- **Archivos:** buckets privados `documents` y `billing`; carpeta por organización; acceso por enlaces firmados de 2 minutos; tipos y tamaños limitados.
- **Secretos:** solo en variables de entorno del hosting. La clave de servicio se usa únicamente en el servidor (`/api/leads`, tareas diarias). El repo no contiene secretos (revisado con búsqueda de patrones).

## Controles verificados

| Control | Dónde | Prueba |
|---|---|---|
| Aislamiento entre organizaciones | RLS + llaves compuestas | `tests/db/20…60`, E2E "outsider" |
| Roles por acción | Funciones y políticas | `tests/db/*` por rol, fallas inyectadas detectadas |
| Cuenta suspendida en solo lectura | `tenant_writable` en todas las escrituras | `50_billing.sql`, E2E cobro |
| Límite de plan | Trigger en `properties` | `50_billing.sql`, E2E cobro |
| Envío bloqueado sin requisitos | `mark_renewal_submitted` | `60_renewals.sql`, E2E renovaciones |
| Invitaciones de un solo uso, hash | `invite_member` / `accept_invitation` | `20_tenancy.sql`, E2E equipo |
| Redirecciones abiertas | `safeNext` | unitarias + E2E |
| Archivos | Políticas de Storage | `tests/storage/storage-rls.mjs` (12 casos) |
| Formulario público | zod, campo trampa, mismo origen, 5/h por IP (hash) | unitarias + prueba manual |
| Tareas diarias | `CRON_SECRET` comparado en tiempo constante | 401 sin clave |
| Encabezados | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy | `curl -I` |
| Dependencias | `npm audit --omit=dev` | 0 vulnerabilidades (zod 4, Next 15.5.29, postcss forzado a 8.5.33) |
| Avisos de Supabase | `get_advisors` | solo quedan los intencionales |

## Riesgos aceptados o pendientes

1. **El repositorio es público.** El código no tiene secretos, pero conviene hacerlo privado (GitHub → Settings → General → Danger Zone → Change visibility).
2. **CSP con `'unsafe-inline'` para scripts:** lo exige Next.js sin nonces. Mitigado: no se renderiza HTML de usuarios y todo texto se escapa.
3. **Límite por IP del formulario público:** usa `x-forwarded-for`, confiable detrás de Vercel; en otro hosting hay que confirmar que el proxy lo fija.
4. **Sin límite de subidas por organización** (más allá de 15 MB por archivo y el tamaño del plan de Supabase). Revisar si aparece abuso.
5. **Supabase Auth:** activar en el panel la confirmación de correo, la protección de contraseñas filtradas y, si hay registros falsos, CAPTCHA (hCaptcha/Turnstile).
6. **Requisitos de las oficinas provisionales** hasta que respondan los correos del 23 nov.
7. **Textos legales en borrador:** revisión de un abogado antes de cobrar.
