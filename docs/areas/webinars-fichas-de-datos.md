# Limitless Webinars: fichas de datos de las pantallas

SCRUM-548 (Inicio, Lanzamientos, Configuración y Detalle). Leads y la Ficha del lead son de SCRUM-549 y van en la
sección del final cuando estén.

Una ficha por pantalla: qué muestra cada elemento, de dónde sale, a qué tabla y columna del modelo se ata
(SCRUM-526, `supabase/migrations/20261016120000_webinars_modelo_de_datos.sql`; requerimientos técnicos, sección 4),
cada cuánto se actualiza, en qué estados puede estar y quién lo ve. Al final de cada pantalla, el volumen esperado
y los filtros. Sale de los contratos de vista (`apps/web/lib/webinar/vistas/contratos.ts`, doc
[`webinars-contratos-de-vista.md`](./webinars-contratos-de-vista.md)) y de las reglas de `calcular.ts`.

> **Estado: borrador para confirmar en la sesión del día 6 (SCRUM-547).** Lo que la sesión cambie se corrige acá,
> en el contrato y en `calcular.ts` a la vez. Los huecos del modelo están en la última sección.

## Convenciones

- **Estados posibles:** los cinco de un `Dato` (`dato.ts`): **M** medido, **D** desactualizado, **SF** sin fuente,
  **FC** falta configurar, **E** error. "Tasa" hereda el peor estado de sus dos números; con denominador cero es
  medido y se muestra "—".
- **Fuente:** la de `lead_events.source` (landing, zoom, ghl, calendly, whop, fanbasis, commas, manual) más
  `meta_ads`, `configuracion` y `calculado`. "Personas" es siempre personas distintas (`lead_id` distintos) por tipo
  de evento y lanzamiento (principio P8 del documento técnico).
- **Frescura:**
  - landing: al instante (ingesta de SCRUM-528; meta, un registro en Inicio en menos de 5 s);
  - zoom: reporte de participantes después de la sesión (fin + 30 min, reintentos hasta 24 h);
  - meta_ads: una vez por día (`/api/cron/capture-ad-metrics`, 05:30 UTC);
  - pagos (whop, commas): por webhook, al instante;
  - calendly: webhook y cron;
  - ghl: webhook;
  - manual (el equipo) y configuración: al guardar.
- **Quién lo ve** (roles del diseño, sección 4: Dueño, Análisis, Setter, Closer):
  - Inicio: todos;
  - Lanzamientos, Detalle y Configuración: Dueño y Análisis.

  Hoy el bloqueo es por módulo de permisos: `dashboard` para Inicio y `funnels` para Lanzamientos y sus pantallas.
  Los roles predefinidos son de una tarea aparte.
- **Se ata a:** tabla.columna del modelo. "Calc." = se calcula en `calcular.ts` a partir de otros números.

## 1. Inicio (`/inicio`, `leerInicio`)

| Elemento | Qué muestra | Fuente | Se ata a | Frescura | Estados posibles | Quién lo ve |
|---|---|---|---|---|---|---|
| Lanzamiento activo | Nombre, variante, precio | configuracion | `webinar_launches` (`status = 'active'`): `name`, `variant`, `offer_price`, `currency` | al guardar | M; "no hay activo" es M con `null` | todos |
| Cuenta regresiva | Días al cierre en la zona de la org | configuracion | `webinar_launches.closes_on` + `organizations.timezone` | diaria | M; sin fecha → "Sin fecha de cierre" | todos |
| Próxima sesión | Fecha y hora | configuracion | `webinar_sessions.starts_at` (> ahora) | al guardar | M; sin sesiones futuras → texto | todos |
| Registrados | Personas registradas | landing | `launch_registrations` (lead distinto) / `lead_events.kind = 'registered'` | al instante | M, D, SF, E | todos |
| Últimas 24 h | Registros de las últimas 24 h | landing | `launch_registrations.registered_at` | al instante | M, D, SF, E | todos |
| Asistencia | Asistieron / registrados | calc. (zoom + landing) | `lead_events.kind = 'attended'` (`data.session_id`) | post-sesión | M, D, SF, FC, E | todos |
| Ventas | Personas que compraron la oferta principal | whop/commas | `lead_events.kind = 'purchased'` del producto `launch_products.role = 'main'` | al instante | M, SF, FC (sin producto), E | todos |
| Ingresos | Cobrado neto de reembolsos | whop/commas | `lead_events.data.amount` de `purchased` − `refunded` | al instante | M, SF, FC, E (monto sin leer, reembolso sin compra) | todos |
| Conversión de asistentes | Compraron / asistieron | calc. | — | — | hereda | todos |
| Ventas VIP | Compraron el asiento VIP (sólo con producto VIP) | whop/commas | `lead_events.kind = 'vip_purchased'`, `launch_products.role = 'vip'` | al instante | M, SF, E | todos |
| Inversión, costo por registro, ROAS | Sólo variantes pagas | meta_ads + calc. | `launch_ad_campaigns` + `ad_metrics_daily` (ver huecos) | diaria | M, D, SF, FC (sin campañas), E | todos |
| Lo que el equipo mueve hoy | Levantaron la mano sin contactar; agendados sin cerrar | manual + calendly | `lead_sales_state.stage` por lanzamiento | al guardar / webhook | M, SF, E | todos (enlazan a Leads) |
| Embudo | Etapas de la variante (`PASOS_POR_VARIANTE`) | por etapa | ver Detalle | — | por etapa | todos |
| Sesiones | Asistieron y se quedaron a la oferta por sesión | zoom | `lead_events` `attended` / `stayed_to_offer` con `data.session_id`; `webinar_sessions.offer_offset_seconds` | post-sesión | M, FC (sin minuto de la oferta), E (reporte falló) | todos |
| Estado de las fuentes | Cada fuente, su estado y última lectura | cada integración | ver huecos | según fuente | M, D, SF, E | todos |
| Aviso de registros que no llegan | Landing caída, o cero registros medidos en 24 h captando | landing | `landing_events.received_at` / `status` | al instante | se muestra o no | todos |

**Volumen esperado:** un lanzamiento activo (hasta que se decida el paralelismo, `[WEBINAR-LANZAMIENTOS-EN-PARALELO]`);
hasta ~20.000 registros por lanzamiento (meta de rendimiento del documento técnico, sección 11.2); 1 a 5 sesiones.
**Filtros:** ninguno: siempre el lanzamiento activo.

## 2. Lanzamientos (`/lanzamientos`, `leerListaDeLanzamientos`)

| Elemento | Qué muestra | Fuente | Se ata a | Frescura | Estados posibles | Quién lo ve |
|---|---|---|---|---|---|---|
| Fila del lanzamiento | Nombre, variante, estado, fechas | configuracion | `webinar_launches`: `name`, `variant`, `status`, `capture_starts_on`, `closes_on` | al guardar | M | Dueño, Análisis |
| Identificador para la landing | `public_id` | configuracion | `webinar_launches.public_id` | al crear | M — **falta en el contrato** (huecos) | Dueño, Análisis |
| Registrados | Personas | landing | `launch_registrations` | al instante | M, D, SF, E | Dueño, Análisis |
| Asistieron | Personas en alguna sesión ocurrida | zoom | `lead_events.kind = 'attended'` | post-sesión | M, D, SF, FC, E | Dueño, Análisis |
| Ventas | Personas (oferta principal) | whop/commas | `lead_events.kind = 'purchased'` | al instante | M, SF, FC, E | Dueño, Análisis |
| Ingresos | Neto de reembolsos | whop/commas | `lead_events.data.amount` | al instante | M, SF, FC, E | Dueño, Análisis |

**Volumen esperado:** decenas de lanzamientos por cuenta a lo largo del tiempo; los cerrados leen la foto fija
(`launch_funnel_snapshots`, documento técnico sección 6).
**Orden:** activos primero, después del más nuevo al más viejo.
**Filtros:** ninguno por ahora. Candidato para la sesión: por estado.

## 3. Detalle del lanzamiento (`/lanzamientos/[id]`, `leerDetalleDelLanzamiento`)

Todo lo de Inicio para cualquier lanzamiento (activo o cerrado), más:

| Elemento | Qué muestra | Fuente | Se ata a | Frescura | Estados posibles | Quién lo ve |
|---|---|---|---|---|---|---|
| Visitaron la landing | Visitantes distintos | landing | `landing_visits.visitor_id` | al instante | M, D, SF, E | Dueño, Análisis |
| Se registraron | Personas | landing | `launch_registrations` | al instante | M, D, SF, E | Dueño, Análisis |
| Confirmaron el email | Personas | ghl | `lead_events.kind = 'email_confirmed'` | webhook | M, SF (GHL sin conectar), E | Dueño, Análisis |
| Compraron el asiento VIP (Pago +++) | Personas | whop/commas | `lead_events.kind = 'vip_purchased'` | al instante | M, FC (sin producto VIP), E | Dueño, Análisis |
| Asistieron | Personas | zoom | `lead_events.kind = 'attended'` | post-sesión | M, D, SF, FC, E | Dueño, Análisis |
| Se quedaron a la oferta | Personas | zoom | `lead_events.kind = 'stayed_to_offer'` | post-sesión | M, FC (falta el minuto de la oferta), E | Dueño, Análisis |
| Levantaron la mano | Personas | manual (o landing post-webinar) | `lead_events.kind = 'raised_hand'` | al guardar | M | Dueño, Análisis |
| Contactados / Calificados | Personas | manual | `lead_events.kind = 'contacted'` / `'qualified'` | al guardar | M | Dueño, Análisis |
| Agendaron / Asistieron a la llamada | Personas | calendly | `lead_events.kind = 'call_booked'` / `'call_attended'` | webhook/cron | M, SF, E | Dueño, Análisis |
| Compraron | Personas | whop/commas | `lead_events.kind = 'purchased'` | al instante | M, SF, FC, E | Dueño, Análisis |
| Paso entre etapas | % desde la etapa base (`PASO_SE_MIDE_CONTRA`) | calc. | — | — | hereda | Dueño, Análisis |
| Registros por origen | Por `utm_source` | landing | `launch_registrations.utm_source` | al instante | M, D, SF, E | Dueño, Análisis |
| Registros por anuncio | Por `utm_content` | landing | `launch_registrations.utm_content` | al instante | M, D, SF, E | Dueño, Análisis |
| Registros por día | Serie diaria en la zona de la org | landing | `launch_registrations.registered_at` | al instante | M, D, SF, E | Dueño, Análisis |
| Inversión por día | Serie diaria (pagas) | meta_ads | `ad_metrics_daily` por campaña (ver huecos) | diaria | hoy SF (sólo hay total); FC sin campañas | Dueño, Análisis |
| Reembolsos | Personas con reembolso | whop/commas | `lead_events.kind = 'refunded'` | al instante | M, SF, FC, E | Dueño, Análisis |

**Volumen esperado:** hasta ~20.000 registros; unas decenas de orígenes y anuncios; hasta 120 días en la serie
diaria (`DIAS_MAXIMOS_DE_LA_EVOLUCION`).
**Filtros:** ninguno. El corte es por origen y por anuncio, y la variante la fija el lanzamiento.
**Candidato para la sesión:** cortar el embudo entero por origen.

## 4. Configuración del lanzamiento (`/lanzamientos/[id]/configuracion`, `leerConfiguracionDelLanzamiento`)

| Elemento | Qué muestra | Fuente | Se ata a | Frescura | Estados posibles | Quién lo ve |
|---|---|---|---|---|---|---|
| Datos | Nombre, variante, moneda, precio, captación, cierre | configuracion | `webinar_launches`: `name`, `variant`, `currency`, `offer_price`, `capture_starts_on`, `closes_on` | al guardar | editable | Dueño, Análisis |
| Sesiones | Fecha y hora, ID de Zoom, minuto de la oferta | configuracion | `webinar_sessions`: `starts_at`, `zoom_webinar_id`, `offer_offset_seconds` | al guardar | editable | Dueño, Análisis |
| Campañas | Plataforma e ID de campaña | configuracion | `launch_ad_campaigns`: `platform`, `campaign_external_id` | al guardar | lectura (`[WEBINAR-CONFIG-CAMPANAS-Y-PRODUCTOS]`) | Dueño, Análisis |
| Productos | Proveedor, ID de producto, oferta principal o VIP | configuracion | `launch_products`: `provider`, `product_external_id`, `role` | al guardar | lectura | Dueño, Análisis |
| Falta cargar | Sesiones, ID de Zoom, minuto de la oferta, producto principal, campañas (pagas) | calc. | — | al guardar | lista (vacía = "No falta nada") | Dueño, Análisis |
| Estado de las fuentes | Igual que en Inicio | cada integración | ver huecos | según fuente | M, D, SF, E | Dueño, Análisis |

**Volumen esperado:** hasta 10 sesiones (`MAXIMO_DE_SESIONES`), unas pocas campañas y 1 o 2 productos.
**Filtros:** no aplica.
**Fuera de la ficha por decisión:** `goal_sales` y `goal_revenue` existen en el modelo, pero no se muestran
(sin metas, Martín, 28-oct).

## 5. Huecos entre las fichas y el modelo (para cerrar antes de migrar)

Cruce con la sección 4 del documento técnico y la migración de SCRUM-526:

1. **`public_id` no está en el contrato.** `webinar_launches.public_id` existe en el modelo, pero `LanzamientoResumen`
   no lo trae. Lo pide el criterio de SCRUM-529 ("lo ve en la lista con su public_id") y la landing lo necesita.
   Sumarlo al contrato.
2. **Inversión por campaña y por día.** `ad_metrics_daily` guarda `campaign_name` y no el id de campaña (documento
   técnico, sección 4): sin `campaign_external_id` no se puede atar la inversión a `launch_ad_campaigns`. Hasta
   entonces, la inversión diaria queda "sin fuente" y la total depende de esa columna.
3. **Estado de cada fuente.** `EstadoDeFuente` (estado y última lectura) no tiene tabla en el modelo. Hay que
   definir de dónde sale cada uno:
   - landing: `landing_events.received_at` y `status`;
   - zoom: `webinar_sessions.report_status`;
   - el resto: el estado de su integración.
4. **Visitantes distintos del lanzamiento.** `landing_visits` es única por (lanzamiento, visitante, día): contar
   visitantes distintos del lanzamiento es `count(distinct visitor_id)`, no la suma por día. Anotado para la
   consulta de B4 (SCRUM-550).
5. **Lanzamientos en paralelo.** Afecta qué es "el" activo en Inicio (`[WEBINAR-LANZAMIENTOS-EN-PARALELO]`).

## 6. Leads y Ficha del lead (SCRUM-549)

Pendiente de SCRUM-549 (Fer). Mismas columnas.
