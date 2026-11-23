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
| 1. Base y acceso | Aprobada |
| 2. Modelo de datos y RLS | Aprobada |
| 3. Flujo principal | Aprobada |
| 4. Cobro manual | En revisión |
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
- [x] `20261123000003_hardening.sql` aplicado; avisos de Supabase revisados (solo quedan los intencionales).
- [ ] Proyecto de staging separado (hoy hay un solo proyecto).
- [ ] Sentry u otro servicio de alertas (falta cuenta; el punto de conexión ya existe).

## Fase 2: criterios de aceptación

- [x] Tablas `properties`, `licenses`, `checklist_items`, `documents` con `tenant_id` y RLS; llaves compuestas `(id, tenant_id)` que impiden mezclar datos entre organizaciones.
- [x] Reglas oficiales en tablas (`license_types`: vencimiento y fecha límite de solicitud; `checklist_templates`: requisitos por tipo, condicionales como piscina). Alojamiento marcado "por confirmar".
- [x] Al crear una licencia se arma su checklist con las plantillas que aplican a la propiedad.
- [x] Permisos: solo lectura ve; operador marca checklist, escribe notas y sube documentos; administrador crea y edita propiedades, licencias y requisitos, y borra documentos. Nadie puede cambiar `tenant_id`, autoría ni quién marcó un ítem.
- [x] Vista `license_overview` para el panel: días para vencer, fecha límite de solicitud y progreso del checklist.
- [x] Almacenamiento privado `documents` (15 MB, PDF e imágenes), carpeta por organización, enlaces firmados; sin URL pública.
- [x] Auditoría automática de altas, cambios (con los campos cambiados) y bajas.
- [x] Pruebas: RLS por rol en Postgres 16 y Supabase real (con 2 fallas inyectadas a propósito que las pruebas detectan), 12 pruebas de almacenamiento por API, linter de Supabase sin errores; CI ampliado.
- [x] `phase2.sql` aplicado en el proyecto real.
- [ ] Confirmar con Tourism Regulations e IRD la fecha del 2 de diciembre y los requisitos de cada checklist.

## Fase 3: criterios de aceptación

- [x] Panel de vencimientos: indicadores, filtros por estado, tabla ordenada por fecha límite de solicitud, progreso del checklist. Urgente: 7 días o menos, vencida, o 14 días con requisitos pendientes.
- [x] Propiedades: alta, edición y eliminación (borra también los archivos); licencias con fecha oficial automática si no se indica.
- [x] Checklist por propiedad: marcar (registra quién), notas, documentos ligados a cada requisito; apertura con enlace firmado de 2 minutos.
- [x] Importación CSV: columnas en español o inglés, vista previa y errores por fila antes de importar; todo o nada en la base de datos.
- [x] Ejemplo precargado del prototipo al crear la organización; se borra con un clic sin tocar lo importado.
- [x] Tour inicial de 4 pasos, guardado por usuario; se puede repetir desde Ayuda.
- [x] Página de ayuda con pasos, roles y preguntas frecuentes.
- [x] Recordatorios por correo a propietarios y administradores 30, 14, 7, 3 y 1 día antes, el día y una vez vencida; nunca dos veces ni para el ejemplo. Tarea diaria protegida con `CRON_SECRET`.
- [x] Pruebas: 30 unitarias, base de datos (Postgres y Supabase), 12 de almacenamiento, 5 E2E (incluye intento de otra organización de abrir una propiedad o documento ajeno).
- [x] `phase3.sql` aplicado en el proyecto real.
- [ ] Configurar Resend (`RESEND_API_KEY`, `EMAIL_FROM`), `CRON_SECRET` y `SUPABASE_SERVICE_ROLE_KEY` en el hosting para que salgan los recordatorios.
- [ ] Recordatorios por WhatsApp: quedan para la fase de cobro y extras (requiere cuenta de Twilio o Meta).

## Fase 4: criterios de aceptación

- [x] Planes en tabla (Por propiedad US$39 × propiedades, descuento por volumen; Gestor US$149 hasta 25), editables por la plataforma.
- [x] Prueba gratis automática para cada organización (14 días, configurable).
- [x] Elegir plan (solo el propietario) → factura con número, referencia única de transferencia y vencimiento; PDF de factura y recibo con la marca.
- [x] Comprobante subido por propietario o administrador (almacenamiento privado `billing`); aprobación o rechazo con motivo por el administrador de plataforma.
- [x] Estados: prueba, pendiente de pago, comprobante recibido, activa, vencida, suspendida, cancelada.
- [x] Tarea diaria `/api/cron/billing`: factura de renovación antes del fin de período, vencida al terminar, suspensión tras el período de gracia (10 días, configurable), cancelación al final del período; avisos por correo sin repetir.
- [x] Cambios de plan: subidas con factura prorrateada inmediata; bajadas programadas para la renovación; cancelación al final del período.
- [x] Límites en la base de datos: máximo de propiedades por plan (el ejemplo no cuenta) y cuenta suspendida en solo lectura (RLS en todas las escrituras).
- [x] Panel de plataforma: ingreso recurrente mensual, activos, en prueba, pendientes, vencidos, suspendidos, bajas 30 días, por cobrar, vencido, cobrado 30 días; comprobantes por revisar; clientes con suspender/reactivar; configuración (datos bancarios, gracia, prueba, descuento, impuesto) y precios.
- [x] Capa de proveedor de pago (`app/src/lib/billing/provider.ts`): hoy manual; Stripe se conecta ahí sin cambiar el resto.
- [x] Pruebas: base de datos (ciclo completo, prorrateo, suspensión, aislamiento, solo-plataforma) en Postgres y Supabase, 35 unitarias (PDF, avisos), E2E de cobro manual completo; falla inyectada (quitar el bloqueo por suspensión) detectada.
- [ ] Aplicar `supabase/setup/phase4.sql` y darte de alta como administrador de plataforma (línea comentada al final del archivo).
- [ ] Cargar tus datos bancarios en Plataforma → Configuración de cobro.
- [ ] Recordatorios de cobro por WhatsApp (pendiente de cuenta Twilio/Meta).
- [ ] Stripe (cuando tengas una empresa en un país compatible).
