# Limitless Webinars: fichas de datos de las pantallas

SCRUM-548 (Inicio, Lanzamientos, Configuración y Detalle) y SCRUM-549 (Leads y la Ficha del lead, en la sección 6).

Una ficha por pantalla: qué muestra cada elemento, de dónde sale, a qué tabla y columna del modelo se ata
(SCRUM-526, `supabase/migrations/20261016120000_webinars_modelo_de_datos.sql`; requerimientos técnicos, sección 4),
cada cuánto se actualiza, en qué estados puede estar y quién lo ve. Al final de cada pantalla, el volumen esperado
y los filtros. Sale de los contratos de vista (`apps/web/lib/webinar/vistas/contratos.ts`, doc
[`webinars-contratos-de-vista.md`](./webinars-contratos-de-vista.md)) y de las reglas de `calcular.ts`.

> **Estado: borrador para confirmar en la sesión del día 6 (SCRUM-547).** Lo que la sesión cambie se corrige acá,
> en el contrato y en `calcular.ts` a la vez. Los huecos del modelo están en la sección 5.

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
  - Lanzamientos, Detalle y Configuración: Dueño y Análisis;
  - Leads y Ficha del lead: el Setter (la persona de SCRUM-545); Dueño, Análisis y Closer, a confirmar en la sesión
    del día 6.

  Hoy el bloqueo es por módulo de permisos: `dashboard` para Inicio y `funnels` para Lanzamientos y sus pantallas.
  Los roles predefinidos son de una tarea aparte. Leads (`/leads`) y la Ficha del lead (`/leads/[id]`) los bloquean
  el módulo `sales` (`apps/web/lib/navigation/module-for-path.ts`, prefijo `/leads`) y la experiencia de la
  organización (`exigirRutaDeLaExperiencia("/leads")` en `app/(platform)/leads/layout.tsx`).
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

Cruce de Leads y la Ficha del lead (SCRUM-549) con la migración de SCRUM-526 (commit `48f7fd79`):

6. **Estado de venta sin tabla.** Etapa, responsable y último contacto (Leads y Ficha) no tienen tabla: la migración
   deja `lead_sales_state` para la Fase 3 (dice que el estado actual de venta va a ser "una proyección aparte").
   `filas.ts` ya la espera como `FilaEstadoDeVenta` (`launch_id`, `lead_id`, `stage`, `owner_user_id`,
   `last_contact_at`). Sin esa fila, `calcular.ts` deriva la etapa del último evento del lead en el lanzamiento y el
   último contacto del último `contacted`; el responsable queda vacío. La fila "Lo que el equipo mueve hoy" de Inicio
   cita `lead_sales_state.stage`, pero `calcular.ts` la cuenta con los filtros de Leads, que salen de `lead_events`.
   Hay que decidir antes de B4 si se crea la proyección o si etapa y último contacto se derivan de `lead_events` y
   sólo el responsable necesita una columna nueva.
7. **Notas sin tabla.** `NotaDelLead` (texto, autor, fecha) no tiene tabla: `lead_notes` es de la Fase 3. El
   `check` de `lead_events.kind` ya acepta `note`, pero el texto no tiene columna (iría en `data`). Es la pregunta
   "si las notas son eventos" de `webinars-contratos-de-vista.md` (A definir): candidato para la sesión.
8. **Tipos de evento del contrato y del modelo.** `TIPOS_DE_EVENTO` (`contratos.ts`) tiene 15 tipos; el `check` de
   `lead_events.kind` tiene esos 15 más `note`. Si B4 lee los eventos tal cual, una nota llega a la línea de tiempo
   sin etiqueta en `ETIQUETA_DEL_EVENTO`. Hay que sumar `note` al contrato o dejarlo fuera en la lectura, según lo que
   se decida en el hueco 7.
9. **Equipo de la organización.** `PersonaDelEquipo` (id y nombre: responsable, autor de la nota, "cargado por" de
   la línea de tiempo, lista para asignar) no sale del modelo de SCRUM-526: `lead_events.actor_user_id` apunta a
   `auth.users` y no trae nombre. Candidato: `profiles` (`id`, `full_name`, por `organization_id`), que es una tabla
   de antes y no está en esa migración. `full_name` puede ser `null` y el contrato pide un nombre. Hay que decidir
   de dónde sale y quiénes entran en la lista (todos los miembros o sólo los de ventas).
10. **Dónde escribe el equipo.** Los miembros (`authenticated`) sólo tienen lectura en `leads`,
    `launch_registrations` y `lead_events`. Marcar avance (`contacted`, `qualified`), asignar responsable y agregar
    una nota hoy son de ejemplo (`[WEBINAR-LEADS-PERSISTIR]`) y el modelo no tiene dónde guardarlos con el usuario.
    Hay que decidir si escriben por el servidor con el service role o con un permiso y una policy nuevos (y para qué
    roles).

## 6. Leads y Ficha del lead (SCRUM-549)

Sale del contrato (secciones "4. Leads" y "5. Ficha del lead" de `contratos.ts`), de `calcularLeads` y
`calcularFichaDelLead` (`calcular.ts`) y de lo que dibujan `components/webinar/` (`pantalla-de-leads.tsx`,
`tabla-de-leads.tsx`, `filtros-de-leads.tsx`, `ficha-del-lead.tsx`, `panel-de-venta-del-lead.tsx`). Los nombres
del modelo son los de la migración de SCRUM-526 en el commit `48f7fd79`, que todavía no está en esta rama. Lo que el
modelo no tiene dice "falta en el modelo" con su hueco de la sección 5.

Hasta B4, una organización que no es la de demo ve cada número y cada lista de Leads en SF ("esta pantalla se está
construyendo", `sin-lectura-real.ts`), y la ficha de cualquier lead le da "no existe". Los estados de las tablas son
los de la lectura real.

### Leads (`/leads`, `leerLeads`)

| Elemento | Qué muestra | Fuente | Se ata a | Frescura | Estados posibles | Quién lo ve |
|---|---|---|---|---|---|---|
| Selector de lanzamiento | Nombre de cada lanzamiento; marcado el elegido (el de la URL; si no, el activo; si no, el primero del orden) | configuracion | `webinar_launches`: `name`, `status`, `capture_starts_on` (orden: activos, borradores y cerrados; después del más nuevo al más viejo) | al guardar | M (`[]` = no hay lanzamientos: "Todavía no hay lanzamientos." y botón para crear uno), E | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Búsqueda | Texto buscado en el nombre o el email, sin distinguir mayúsculas | landing | `leads.name`, `leads.email_normalized` (índices `leads_name_trgm` y `leads_email_normalized_trgm`); hoy `calcular.ts` compara con `leads.email` en minúsculas | al instante | editable | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Filtro "Todos" | Personas registradas en el lanzamiento | landing | `lead_events.kind = 'registered'` | al instante | M, D, SF, E | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Filtro "Registrado sin asistir" | Personas: se registraron y no asistieron a ninguna sesión | calc. (landing + zoom) | `lead_events.kind`: `registered` menos `attended` | post-sesión | hereda (M, D, SF, FC sin sesiones, E) | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Filtro "Asistió sin levantar la mano" | Personas: asistieron y no levantaron la mano | calc. (zoom + manual) | `lead_events.kind`: `attended` menos `raised_hand` | post-sesión / al guardar | hereda (M, D, SF, FC, E) | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Filtro "Levantó la mano sin contactar" | Personas: levantaron la mano y nadie las contactó | manual | `lead_events.kind`: `raised_hand` menos `contacted` | al guardar | M | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Filtro "Agendado sin cerrar" | Personas: agendaron una llamada y no compraron | calc. (calendly + whop/commas) | `lead_events.kind`: `call_booked` menos `purchased` | webhook/cron / al instante | hereda (M, D, SF, FC sin producto principal, E) | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Total | Leads del filtro y la búsqueda elegidos, de todas las páginas ("N leads") | calc. | `launch_registrations` del lanzamiento con el `lead_id` en el filtro | según fuente | hereda del filtro elegido | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Lead | Nombre; si la landing no lo pidió, el email. Abre la ficha con el lanzamiento elegido | landing | `leads.name`, `leads.email` | al instante | hereda del filtro elegido (toda la lista) | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Etapa | Etapa del lead en el lanzamiento (`ETAPAS_DEL_LEAD`, con `ETIQUETA_DEL_EVENTO`) | manual | **falta en el modelo** (hueco 6). Sin esa fila, calc.: el último `lead_events.kind` de `ETAPAS_DEL_LEAD` del lead en el lanzamiento, o `registered` | al guardar / según fuente | hereda del filtro elegido | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Origen | `utm_source` del registro, o "Directo o sin dato" | landing | `launch_registrations.utm_source` | al instante | hereda del filtro elegido | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Responsable | Nombre de quien lo trabaja, o "Sin responsable" | manual | **falta en el modelo** (huecos 6 y 9) | al guardar | hereda del filtro elegido | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Último contacto | Fecha y hora en la zona de la org, o "Sin contactar" | manual | **falta en el modelo** (hueco 6). Sin esa fila, calc.: el `lead_events.occurred_at` más nuevo con `kind = 'contacted'` del lead en el lanzamiento | al guardar | hereda del filtro elegido | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |

Fuera de la tabla: `telefono` y `registradoAt` viajan en `FilaDeLead` y no se dibujan (el registro sólo ordena la
lista), y tampoco `utmMedium`, `utmCampaign` ni `utmContent` del origen.

**Volumen esperado:** hasta ~20.000 registros por lanzamiento (sección 1). Con páginas de 50 (`LEADS_POR_PAGINA`)
son hasta 400 páginas con "Todos". Los cinco conteos y el total se calculan en cada carga sobre todas las personas
del lanzamiento (hoy en memoria, en `calcular.ts`). Para B4 (SCRUM-550): la búsqueda tiene los índices trigram de
`leads` y el orden por fecha, `launch_registrations_launch_registered` (`launch_id`, `registered_at`); el cursor de
hoy es un desplazamiento (`o50`, `o100`...).
**Filtros:** todos viven en la URL de `/leads`:
- selector de lanzamiento (`?lanzamiento=`): la lista es de un lanzamiento por vez;
- los cinco de `FILTROS_DE_LEADS` (`?filtro=`): Todos, Registrado sin asistir, Asistió sin levantar la mano, Levantó
  la mano sin contactar, Agendado sin cerrar. Uno que no existe se toma como Todos;
- búsqueda por nombre o email (`?busqueda=`), que se suma al filtro;
- página de 50 (`?cursor=`), del registro más nuevo al más viejo, con "Siguiente" y "Volver al principio".

Cambiar de filtro, de búsqueda o de lanzamiento vuelve a la primera página.
**Candidatos para la sesión:** si la lista es por lanzamiento o de toda la cuenta; qué etapas se muestran; qué es
"origen" (hoy, sólo `utm_source`).

### Ficha del lead (`/leads/[id]`, `leerFichaDelLead`)

| Elemento | Qué muestra | Fuente | Se ata a | Frescura | Estados posibles | Quién lo ve |
|---|---|---|---|---|---|---|
| Contacto | Nombre (o el email), email y teléfono | landing | `leads`: `name`, `email`, `phone_e164` | al instante | M | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Primera vez | Fecha y hora en que apareció la persona | landing | `leads.first_seen_at` | al instante | M | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Escribir por WhatsApp | Enlace `https://wa.me/<número>`, o "No dejó teléfono" | calc. | `leads.phone_e164` | al instante | se muestra o no | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Avisos de fuentes | Las fuentes externas que no están al día: la línea de tiempo puede no tener sus eventos | cada integración | ver huecos (hueco 3) | según fuente | se muestra o no (D, SF, FC, E) | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Registros | Un registro por lanzamiento, del más nuevo al más viejo: lanzamiento, fecha, origen (`utm_source`) y calificación (la respuesta de la landing, si la hay) | landing | `launch_registrations`: `registered_at`, `utm_source`, `qualification`; `webinar_launches.name` | al instante | M | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Lanzamiento del estado de venta | Nombre del lanzamiento en el título del panel (el de `?lanzamiento=`; si no, el del registro más nuevo) | configuracion | `webinar_launches.name` | al guardar | M | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Etapa | Etapa del lead en ese lanzamiento; botón "Marcar como..." cuando la etapa tiene paso siguiente | manual | **falta en el modelo** (hueco 6); sin esa fila, calc. como en Leads | al guardar | M; editable (de ejemplo, no se guarda: hueco 10) | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Último contacto | Fecha y hora, o "Sin contactar" | manual | **falta en el modelo** (hueco 6); sin esa fila, calc. como en Leads | al guardar | M | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Responsable | Quién lo trabaja; lista del equipo para asignarlo | manual | **falta en el modelo** (huecos 6 y 9) | al guardar | M; editable (de ejemplo, hueco 10) | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Notas | Texto, autor y fecha, de la más nueva a la más vieja; formulario para agregar una | manual | **falta en el modelo** (huecos 7 y 9) | al guardar | M; editable (de ejemplo, hueco 10) | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Línea de tiempo | Cada evento de la persona, del más viejo al más nuevo: tipo, fecha, fuente y quién lo cargó | landing, zoom, ghl, calendly, whop, fanbasis, commas, manual (la de cada evento) | `lead_events`: `kind`, `occurred_at`, `source`, `actor_user_id` (nombre: hueco 9; `note`: hueco 8) | según fuente | M | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |
| Compras | Producto, monto con moneda ("—" si no se leyó), cobrada o reembolsada, fecha y fuente | whop/commas | `lead_events.kind = 'purchased'` / `'vip_purchased'`: `data.product`, `data.amount`, `data.currency`, `occurred_at`, `source`; reembolsada = un `refunded` del mismo lead, lanzamiento y producto (`[WEBINAR-REEMBOLSOS-POR-ORDEN]`) | al instante | M, D, SF (proveedor sin integración), FC (sin producto principal), E | Setter; Dueño, Análisis y Closer: a confirmar en la sesión del día 6 |

Fuera de la tabla: los ids, `launchId` de eventos, notas y compras, y `sesionId` de los eventos de Zoom viajan y no
se dibujan.

**Volumen esperado:** una persona: pocos registros (uno por lanzamiento en que se anotó, único por
`launch_registrations` (`launch_id`, `lead_id`)), decenas de eventos, pocas notas y compras. La línea de tiempo, las
notas y las compras son de todos los lanzamientos de la persona, no sólo del elegido.
**Filtros:** no aplica. `?lanzamiento=` sólo elige el lanzamiento del estado de venta.
