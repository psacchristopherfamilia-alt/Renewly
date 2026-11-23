# Plan por fases

Decisiones tomadas (22 nov 2026):

- **Nombre:** se mantiene Renewly, aunque choca con tryrenewly.com, renewly.net, renewly.gg y renewlyai.app. Es un riesgo de marca aceptado; revisar con un abogado antes de invertir en publicidad.
- **Cobro:** solo manual por ahora (transferencia, depósito, efectivo, cheque), reutilizando el patrón de ObraPay. Capa con interfaz de proveedor de pago para conectar Stripe después.
- **Precios:** los originales, como estimación: US$39/mes por propiedad (descuento desde 10) y Gestor US$149/mes hasta 25 propiedades.
- **Calendario:** primero la página de venta con lista de espera; app lista para pilotos antes del 1 de abril de 2027 (ventana de la licencia comercial).
- **Formularios oficiales:** los consigue el dueño del producto; bloquean la Fase 5.

| Fase | Estado |
|---|---|
| 0. Marca y página de venta | Aprobada |
| 1. Base y acceso | En revisión |
| 2. Modelo de datos y RLS | Pendiente |
| 3. Flujo principal | Pendiente |
| 4. Cobro manual | Pendiente |
| 5. Renovación en lote asistida | Pendiente: faltan formularios oficiales |
| 6. Pulido y lanzamiento | Pendiente |

## Fase 0: criterios de aceptación

- [x] Logo en SVG y PNG: claro, oscuro, monocromo, favicon, ícono de app (192/512/1024) e imagen para redes.
- [x] Página en ES/EN, móvil primero, sin desbordamiento horizontal a 390 px; modo claro y oscuro.
- [x] Cada cifra de evidencia enlaza a una fuente oficial (gov.tc / pressoffice.gov.tc). Los precios llevan la etiqueta "Estimación". Sin testimonios ni logos inventados.
- [x] Demo interactiva con los datos de ejemplo del prototipo.
- [x] Formulario de lead → Supabase (RLS sin acceso público) y aviso por correo; campo trampa, límite por IP, solo mismo origen.
- [x] SEO: títulos y descripciones por idioma, hreflang, sitemap, robots, Open Graph, JSON-LD (SoftwareApplication y FAQPage).
- [x] Analítica de visitas y conversiones.
- [x] Privacidad y términos (borrador, requiere revisión legal).
- [x] CI: lint, typecheck, tests, build.
- [x] Lead de punta a punta contra Supabase local: guardado, límite por IP (429 al sexto) y lectura pública denegada por la API. Falta repetirlo con tus cuentas reales de Supabase y Resend.
- [ ] Dominio y despliegue.

Fecha por confirmar: el plazo de renovación de alojamiento del 2 de diciembre no aparece en ninguna fuente pública encontrada; la página lo marca "por confirmar con el Departamento".

## Fase 1: criterios de aceptación

- [x] Registro con correo y contraseña, acceso con contraseña o enlace mágico, recuperación de contraseña, confirmación de correo.
- [x] Crear organización (el creador queda como propietario); cambiar entre organizaciones.
- [x] Invitar por correo con rol; enlace de un solo uso, guardado como hash, vence en 7 días; solo lo acepta el correo invitado.
- [x] Roles propietario / administrador / operador / solo lectura aplicados en la base de datos (RLS y funciones), no solo en pantalla.
- [x] Auditoría de acciones sensibles, visible para propietarios y administradores.
- [x] Interfaz en español e inglés.
- [x] Pruebas: 15 unitarias, RLS por rol (Postgres 16 y Supabase real), 3 E2E con Playwright (registro → organización → invitación → permisos), linter de Supabase sin errores.
- [x] CI: lint, tipos, unitarias, build, pruebas de base de datos y E2E con Supabase local.
- [x] Monitoreo: `/api/health` y errores del servidor en JSON.
- [x] Proyecto de Supabase real: se reutilizó `obraiq` (ref `mawdjmefsqlshiksofik`, us-east-1); ObraIQ quedó archivado en `obraiq_archive` sin borrar datos. Migraciones 0001 y 0002 aplicadas y verificadas.
- [ ] Aplicar `20261123000003_hardening.sql` (correcciones de los avisos de Supabase).
- [ ] Proyecto de staging separado (hoy hay un solo proyecto).
- [ ] Sentry u otro servicio de alertas (falta cuenta; el punto de conexión ya existe).
