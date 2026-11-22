# Plan por fases

Decisiones tomadas (22 nov 2026):

- **Nombre:** se mantiene Renewly, aunque choca con tryrenewly.com, renewly.net, renewly.gg y renewlyai.app. Es un riesgo de marca aceptado; revisar con un abogado antes de invertir en publicidad.
- **Cobro:** solo manual por ahora (transferencia, depósito, efectivo, cheque), reutilizando el patrón de ObraPay. Capa con interfaz de proveedor de pago para conectar Stripe después.
- **Precios:** los originales, como estimación: US$39/mes por propiedad (descuento desde 10) y Gestor US$149/mes hasta 25 propiedades.
- **Calendario:** primero la página de venta con lista de espera; app lista para pilotos antes del 1 de abril de 2027 (ventana de la licencia comercial).
- **Formularios oficiales:** los consigue el dueño del producto; bloquean la Fase 5.

| Fase | Estado |
|---|---|
| 0. Marca y página de venta | En revisión (este PR) |
| 1. Base y acceso | Pendiente |
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
- [ ] Conectar Supabase y Resend reales y probar un lead de punta a punta (falta tu cuenta).
- [ ] Dominio y despliegue.

Fecha por confirmar: el plazo de renovación de alojamiento del 2 de diciembre no aparece en ninguna fuente pública encontrada; la página lo marca "por confirmar con el Departamento".
