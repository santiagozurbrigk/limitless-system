# Zoom para Limitless — ¿entra la integración de webinars? (SCRUM-531)

> Documentación bajada el **2026-11-23** de `developers.zoom.us`: los 4 specs OpenAPI oficiales que el
> sitio anuncia en `/.well-known/api-catalog.json` ([`openapi/`](./openapi/)) y 34 guías en el markdown que
> el sitio sirve agregando `.md` a cada URL ([`guias/`](./guias/)). Reproducir con
> `docs/external-apis/tools/regenerar.sh zoom`.
>
> **Esto es sólo la parte de escritorio del ticket.** No hay cuenta de Zoom: todo lo que sigue sale de la
> documentación oficial, y lo que la documentación no dice está marcado como **no documentado**. La
> lista de pruebas con cuenta real está al final.

| Archivo | Qué tiene |
|---|---|
| [`ENDPOINTS-webinars-y-reportes.md`](./ENDPOINTS-webinars-y-reportes.md) | Recorte del spec de Meetings: webinars, registrantes, participantes pasados, reportes (y sus pares de reunión). Cada endpoint trae plan, scopes y *Rate Limit Label* tal como los publica Zoom |
| [`WEBHOOKS-webinars.md`](./WEBHOOKS-webinars.md) | Recorte del spec de eventos: los 24 `webinar.*` y 7 `meeting.*` (inicio, fin, participantes y registro) |
| [`MARKETPLACE-suscripciones-y-eventos.md`](./MARKETPLACE-suscripciones-y-eventos.md) | Alta de suscripciones de eventos por API, logs de entrega y `app_deauthorized` |
| [`openapi/*.json`](./openapi/) | Los 4 specs completos (`meetings-methods`, `meetings-events`, `marketplace-methods`, `marketplace-events`) |
| [`guias/`](./guias/) | OAuth, tipos de app, distribución (privada / beta / publicada), revisión, webhooks, rate limits |

---

## Lo esencial

| | |
|---|---|
| Base URL | `https://api.zoom.us/v2` (`servers` de `openapi/meetings-methods.json`) |
| Auth | `Authorization: Bearer <access_token>` (OAuth 2.0). Token en `https://zoom.us/oauth/token` |
| Access token | dura **1 hora** ([`guias/integrations/oauth.md`](./guias/integrations/oauth.md) § Request an access token) |
| Refresh token | dura **90 días** y **rota**: hay que usar siempre el último ([`oauth.md`](./guias/integrations/oauth.md) § Refresh an access token) |
| Plan para webinars | **Pro o superior con el add-on de Webinars** (prerrequisito escrito en cada endpoint de webinar) |
| Paginación | `next_page_token` (vence a los **15 minutos**), `page_size` máx. **300** |
| Rate limit | por **cuenta del cliente**, compartido entre todas las apps que tenga instaladas ([`guias/api/rate-limits.md`](./guias/api/rate-limits.md)) |

---

## (a) Registrar leads en el webinar — **sí, con link personal**

| Acción | Endpoint | Rate limit label |
|---|---|---|
| Registrar un lead | `POST /webinars/{webinarId}/registrants` (`webinarRegistrantCreate`) | `LIGHT` |
| Registrar hasta **30** de una vez | `POST /webinars/{webinarId}/batch_registrants` (`addBatchWebinarRegistrants`) — sólo webinars **tipo 5** (programados) | `HEAVY` |
| Listar registrantes | `GET /webinars/{webinarId}/registrants` (filtro `status`, `occurrence_id`) | `MEDIUM` |
| Ver / borrar uno | `GET` / `DELETE /webinars/{webinarId}/registrants/{registrantId}` | `LIGHT` |

Fuente: [`ENDPOINTS-webinars-y-reportes.md`](./ENDPOINTS-webinars-y-reportes.md), sección de cada endpoint.

- La respuesta `201` trae **`join_url`** ("The URL the registrant can use to join the webinar"), **`registrant_id`**,
  `status` (`approved` / `pending`), `start_time` y `occurrences[]`. El batch devuelve `join_url` y
  `registrant_id` por registrante. **Guardar `registrant_id`**: es la llave para cruzar asistencia (punto b).
- El webinar **tiene que tener registro habilitado**; si no, `400` código `3000` ("This webinar does not have
  registration as required"). El host no puede registrarse (`3027`).
- Si el webinar es de aprobación manual (`approval_type` 1), el registrante queda `pending` y **no** recibe el
  link hasta que se lo apruebe (`PUT /webinars/{webinarId}/registrants/status`). El batch acepta
  `auto_approve: true` para saltear eso.
- Zoom manda su propio mail de confirmación según los settings del webinar
  (`registrants_confirmation_email`, `registrants_email_notification`). Si Limitless manda el link por su
  cuenta, hay que decidir si se apaga el de Zoom.
- Límite de usuario: **3 registros por día (UTC) para el mismo registrante en el mismo webinar**
  ([`rate-limits.md`](./guias/api/rate-limits.md) § User-level rate limits). Un reintento ciego puede comerse
  ese cupo: **reintentar sólo ante `429`/`5xx`, nunca ante `400`**.
- Webinar recurrente: `occurrence_ids` en query registra en ocurrencias concretas.

## (b) Quién asistió y cuánto tiempo — **sí, por sesión y con el `registrant_id`**

Dos endpoints devuelven la lista de asistentes de un webinar terminado:

| | `GET /report/webinars/{webinarId}/participants` | `GET /past_webinars/{webinarId}/participants` |
|---|---|---|
| operationId | `reportWebinarParticipants` | `listWebinarParticipants` |
| Scope | **sólo** `report:read:admin` (granular `report:read:list_webinar_participants:admin`) | `webinar:read` o `webinar:read:admin` |
| Permiso del usuario | `UsageReport:Read` (reportes de la cuenta) | `User:Read` |
| Rate limit label | `HEAVY` | `MEDIUM` |
| Ventana | últimos **6 meses** (`12702`: "Can not access a webinar a year ago") | — |
| `registrant_id` | sí, con `include_fields=registrant_id` | sí, con `include_fields=registrant_id` |
| Campos | `join_time`, `leave_time`, `duration` (seg), `user_email`, `name`, `status`, `failover` | lo mismo + `internal_user` |

Fuente: [`ENDPOINTS-webinars-y-reportes.md`](./ENDPOINTS-webinars-y-reportes.md) § `GET /report/webinars/{webinarId}/participants` y § `GET /past_webinars/{webinarId}/participants`.

Lo que cambia el diseño:

1. **Una fila por tramo, no por persona.** "If the participant leaves and rejoins the same meeting, they will
   be assigned a different `user_id` and Zoom displays their new duration in a separate object … the duration
   may not reflect the total time the user was in the meeting" (descripción de `duration`). Para saber si
   "se quedó hasta la oferta" hay que **agrupar por `registrant_id`** y ver si **algún tramo
   `[join_time, leave_time]` cubre `inicio_real + minuto_de_oferta`**. Sumar `duration` no alcanza.
2. **El inicio real** de la sesión sale de `GET /report/webinars/{webinarId}` (`start_time`, `end_time`,
   `participants_count`) o del evento `webinar.started`. No usar el `start_time` programado.
3. **Por sesión:** con el **ID** numérico, los dos endpoints devuelven "la **última** instancia". Para una
   sesión concreta hay que pasar el **UUID de la instancia**, que se lista con
   `GET /past_webinars/{webinarId}/instances` (`uuid`, `start_time`, `occurrence_id`; `LIGHT`). Un UUID que
   empieza con `/` o contiene `//` se manda **doble-encodeado**. Si cada sesión del lanzamiento es un webinar
   tipo 5 propio (1–5 IDs distintos), alcanza con el ID; si es un webinar recurrente, hace falta el UUID.
4. **Email de externos:** "If the participant is **not** part of the host's account, this returns an empty
   string value, with some exceptions". La primera excepción es que el participante haya cargado su email en
   el registro de ese webinar ([`guias/api/using-zoom-apis.md`](./guias/api/using-zoom-apis.md) § Email
   address display rules). Como Limitless registra al lead, el email **debería** venir; igual el cruce
   tiene que ir por `registrant_id`, no por email.
5. Ausentes: `GET /past_webinars/{webinarId}/absentees` (`HEAVY`).
6. Alternativa en tiempo real: los eventos `webinar.participant_joined` / `webinar.participant_left` traen
   `registrant_id`, `join_time` / `leave_time`, `participant_uuid` y `leave_reason` (punto f). Sirven de
   respaldo o para no depender del reporte, pero si un webhook se pierde el tramo queda abierto; el reporte
   sigue siendo la fuente de cierre.

**Qué endpoint usar:** el de reporte exige un scope **sólo admin** y una app **admin-managed** (punto e).
`/past_webinars/.../participants` funciona con scope de usuario y trae los mismos tiempos. Si la app va a ser
admin-managed de todos modos, cualquiera de los dos; si se quisiera una app user-managed, **sólo**
`past_webinars`. Si los dos devuelven lo mismo es una de las pruebas con cuenta real.

## (c) Cuándo está listo el reporte de participantes — **no documentado**

La documentación **no da un plazo**. Lo único escrito, en `GET /past_webinars/{webinarId}/participants`:

> "After meetings with hundreds of participants, the attendance data takes some time to be generated. If you
> receive a duration of 0 for users' time in the meeting, you may have called the endpoint before the data is
> fully processed. Implement a short delay or retry logic before fetching participant data."

(La misma nota está en `GET /past_meetings/{meetingId}/participants`.) El endpoint de reporte no dice nada.

Para el diseño (fin + 30 min, reintentos hasta 24 h):

- Disparar desde **`webinar.ended`** (trae `uuid` de la instancia y `end_time`). Ojo: también llega para
  sesiones de práctica (`practice_session: true`) — descartarlas.
- **No tomar la primera respuesta como definitiva**: tratar como "todavía no listo" una lista vacía o
  tramos con `duration` 0, y reintentar. Cerrar cuando dos lecturas seguidas devuelvan el mismo
  `total_records`.
- El plazo real (y si 30 min alcanza) **se mide** en la cuenta de prueba (checklist, ítem 6).

## (d) Plan que necesita el cliente

- **Webinars:** "Pro or higher plan with a Webinar add-on" en todos los endpoints de webinars, registrantes,
  `past_webinars` y reportes de webinar. Sin el add-on, el batch devuelve `400` "Webinar plan is missing".
  Los eventos `webinar.*` piden "Pro or a higher plan with Webinar license".
- **Reuniones (alternativa sin add-on):** existen los equivalentes `POST /meetings/{meetingId}/registrants`,
  `GET /past_meetings/{meetingId}/participants` ("A paid account with a Pro plan or higher") y
  `GET /report/meetings/{meetingId}/participants` ("A Pro or a higher plan"). Funcionalmente alcanza para
  registrar con link personal y medir permanencia, pero la experiencia del asistente es una reunión (no
  webinar) y la capacidad depende de la licencia del host. **La documentación de developers no publica
  capacidades ni precios por plan** (no se bajaron las páginas comerciales de zoom.us); eso se confirma con
  el cliente.
- El plan también define el **rate limit** (punto g).

## (e) Cómo conecta un SaaS multi-cliente las cuentas de Zoom

**Tipos de app que existen hoy** (desde el 2024-09-14): *General app*, *Webhook only* y *Server-to-server*
([`guias/distribute/legacy-apps.md`](./guias/distribute/legacy-apps.md)).

| Opción | Sirve para cuentas de terceros | Notas |
|---|---|---|
| **General app, admin-managed** | **Sí** | La agrega un admin de la cuenta del cliente; accede a datos de toda la cuenta ("users, reports, and account content"). Es la que pide (b) por `report:read:admin`. |
| General app, user-managed | Sí | Cada usuario autoriza; sólo sus datos. **No** puede usar `report:read:admin`. |
| **Server-to-Server OAuth** | **No** como app de Limitless | Token del dueño de **su propia** cuenta, sin refresh token ([`guias/internal-apps/s2s-oauth.md`](./guias/internal-apps/s2s-oauth.md) § Generate access token). Ver "Plan B" abajo. |

- **No se pueden mezclar** scopes admin y de usuario en una misma app: "there's no app type that combines
  both" ([`guias/build-flow/basic-info/app-mgmt.md`](./guias/build-flow/basic-info/app-mgmt.md)).
- Flujo: `https://zoom.us/oauth/authorize?response_type=code&client_id=…&redirect_uri=…&state=…` → código →
  `POST https://zoom.us/oauth/token` con Basic auth (client id:secret). Al desinstalar llega
  **`app_deauthorized`** y la app **debe borrar los datos** del usuario ([`oauth.md`](./guias/integrations/oauth.md)
  § Deauthorization).
- Para que el cliente pueda agregarla: un usuario de la cuenta del desarrollador con el rol **Zoom for
  developers** crea la app ([`guias/integrations/create.md`](./guias/integrations/create.md) § Prerequisites).

**¿Sirve una app no publicada en cuentas de terceros?** — **sólo como beta, y no para producción**
([`guias/distribute/sharing-private-and-beta-apps.md`](./guias/distribute/sharing-private-and-beta-apps.md),
[`guias/distribute/app-submission/authorization-url-faq.md`](./guias/distribute/app-submission/authorization-url-faq.md),
[`guias/build-flow/before-you-build.md`](./guias/build-flow/before-you-build.md) § Choose how to distribute your app):

- **Privada:** sólo usuarios de la cuenta del desarrollador. No sirve.
- **Beta:** se comparte por *authorization URL* a cuentas externas **con aprobación de Zoom** (respuesta en
  ~72 h / 3–4 días hábiles). Límites:
  - **10 cuentas** para una app account-level (admin-managed), **100** para user-level;
  - la URL vale **4 semanas**, con **2 extensiones** de 4 semanas: **90 días en total, no se puede
    testear indefinidamente**. Quien ya la agregó la sigue usando después del vencimiento;
  - para pedirla hay que completar el *Technical Design* y entregar **SSDLC, SAST, DAST, política de
    privacidad** y **3 de 5**: resumen de pentest, política de seguridad, respuesta a incidentes, gestión de
    vulnerabilidades, gestión de infraestructura/dependencias. TLS 1.2+;
  - prohibido publicitar la app o usar marcas de Zoom mientras es beta.
- **Publicada (listed o unlisted):** cualquier cuenta. *Unlisted* no aparece en el buscador pero **pasa la
  misma revisión** y necesita la misma metadata. Se puede restringir quién la agrega con una landing propia
  ([`guias/distribute/app-submission/app-access.md`](./guias/distribute/app-submission/app-access.md)).

**Revisión del Marketplace** ([`guias/distribute/app-review-process.md`](./guias/distribute/app-review-process.md),
[`submit-apps-review.md`](./guias/distribute/app-submission/submit-apps-review.md),
[`common-rejection-issues.md`](./guias/distribute/app-submission/common-rejection-issues.md),
[`security-requirements.md`](./guias/distribute/security-requirements.md)): completitud y marca, funcionalidad y
usabilidad (instalar, desinstalar, flujo de alta), cumplimiento (documento técnico), **revisión de seguridad**
(OWASP Top 10, escaneo, prueba manual, scopes mínimos: cada scope pide justificación y lo pueden rechazar),
verificación de dominio, cuenta de prueba en Limitless para el revisor, documentos legales (términos,
privacidad, soporte) en un dominio propio. **No hay plazo publicado**: "An app's review time varies".
Cambiar scopes o suscripciones de una app publicada **vuelve a pasar revisión**
([`guias/distribute/published-apps/updating.md`](./guias/distribute/published-apps/updating.md)).

**Scopes mínimos** (granulares, tal como figuran en cada endpoint), para una app admin-managed:

| Para | Scope granular |
|---|---|
| Registrar | `webinar:write:registrant:admin` (+ `webinar:write:batch_registrants:admin` si se usa batch) |
| Leer el webinar y sus registrantes | `webinar:read:webinar:admin`, `webinar:read:list_registrants:admin` |
| Instancias de un webinar | `webinar:read:list_past_instances:admin` |
| Asistencia | `report:read:list_webinar_participants:admin` **o** `webinar:read:list_past_participants:admin` |
| Inicio/fin real | `report:read:webinar:admin` |
| Eventos de webinar | `webinar:read:webinar:admin`, `webinar:read:participant:admin`, `webinar:read:registrant:admin` |

**Plan B sin Marketplace — Server-to-Server por cliente.** Cada cliente crea **en su propia cuenta** una app
S2S y le carga a Limitless `account_id`, `client_id`, `client_secret` (y el *secret token* de webhooks),
igual que hoy se carga la API key de WebinarJam. No pasa revisión ni tiene límite de 10 cuentas. Costo: el
cliente necesita un admin con los roles **Server-to-Server OAuth app** y permisos para los scopes
([`guias/internal-apps.md`](./guias/internal-apps.md) § Enable permissions), y el alta tiene varios pasos en el
Marketplace. **La documentación bajada no dice si Zoom permite que un tercero opere con credenciales S2S de
otra cuenta**: el *Marketplace Developer Agreement* no se bajó. Hay que confirmarlo antes de ofrecerlo.

## (f) Webhooks

**De Zoom hacia Limitless (entrada).** Eventos útiles ([`WEBHOOKS-webinars.md`](./WEBHOOKS-webinars.md)):

| Evento | Para qué |
|---|---|
| `webinar.registration_created` | registro hecho por fuera de Limitless (trae `registrant.id`, `email`, `join_url`, `tracking_source`) |
| `webinar.registration_approved` / `_cancelled` / `_denied` | cambios de estado del registrante |
| `webinar.started` / `webinar.ended` | inicio real; disparar la lectura del reporte (`end_time`, `uuid`, `practice_session`) |
| `webinar.participant_joined` / `webinar.participant_left` | tramos en vivo con `registrant_id`, `join_time`/`leave_time`, `leave_reason` |
| `app_deauthorized` | el cliente desinstaló: borrar sus datos ([`MARKETPLACE-suscripciones-y-eventos.md`](./MARKETPLACE-suscripciones-y-eventos.md)) |

Reglas ([`guias/api/webhooks.md`](./guias/api/webhooks.md)):

- **Validación del endpoint (CRC):** Zoom manda `event: "endpoint.url_validation"` con `payload.plainToken`;
  hay que responder en **≤ 3 s** `{ plainToken, encryptedToken }` con `encryptedToken = HMAC-SHA256(secret
  token, plainToken)` en hex. Se **revalida cada 72 h**; tras **6 fallas seguidas** Zoom desactiva la
  suscripción (§ Validate your webhook endpoint, § Revalidation).
- **Firma:** header `x-zm-signature: v0=<hex>` con `HMAC-SHA256(secret token, "v0:" + x-zm-request-timestamp
  + ":" + body)`. Comparar contra el **body crudo** (§ Verify with Zoom's header). Alternativas: Basic auth,
  token OAuth o header propio (§ Verify with your own header). El *Verification Token* viejo está deprecado.
- **Entrega:** responder `200`/`204` en **≤ 3 s**. Ante `5xx` o timeout reintenta **3 veces** (a los 5, 20 y
  60 min); ante `4xx` **no** reintenta (§ Notification delivery). → Persistir crudo y responder rápido,
  procesar en cola (patrón `payment_webhook_events` / QStash).
- Hasta **20 suscripciones de eventos por app**. Logs de entrega: `GET /marketplace/apps/{appId}/webhook_logs`.

**De Limitless hacia Zoom (salida): suscripciones por API.** `POST /marketplace/app/event_subscription`
(`createEventSubscription`, `HEAVY`) crea suscripciones con `subscription_scope` `user` / `account` / `group`,
`event_webhook_url` y `custom_header` propio, sin tocar el build flow. Requiere token `client_credentials` de
la app. También `GET`/`PATCH`/`DELETE` ([`MARKETPLACE-suscripciones-y-eventos.md`](./MARKETPLACE-suscripciones-y-eventos.md)).
Permitiría una URL o header por org. Zoom **no** tiene "webhooks de salida" que Limitless le mande: lo que va
hacia Zoom son llamadas a la API (registrar).

## (g) Rate limits que importan

Por cuenta del cliente, compartidos con todas sus apps ([`guias/api/rate-limits.md`](./guias/api/rate-limits.md)):

| Tipo | Free | Pro | Business+ |
|---|---|---|---|
| Light | 4/s, 6000/día | 30/s | 80/s |
| Medium | 2/s, 2000/día | 20/s | 60/s |
| Heavy | 1/s, 1000/día | 10/s* | 40/s* |

\* Heavy + resource-intensive comparten un tope diario: **30.000/día (Pro)**, **60.000/día (Business+)**.

- Registrar uno a uno = `LIGHT` (30/s en Pro): 2.000 leads entran en ~1–2 min respetando el límite. Batch
  (30 por llamada) = `HEAVY`.
- Reporte de participantes = `HEAVY`, 300 filas por página: un webinar de 2.000 asistentes son ~7–10 páginas
  (más tramos por re-ingresos). Bajo, aun con reintentos cada 30 min durante 24 h.
- Por usuario: **3 registros/día por registrante y webinar**, **10 cambios de estado/día por registrante**,
  **100 creaciones/ediciones de webinar por día por host** (UTC).
- `429` trae en el header cuándo reintentar (límite diario). `next_page_token` vence a los 15 min: no
  pausar a mitad de la paginación.

---

## Veredicto provisorio: **luz verde condicionada**

La documentación cubre todo lo que el producto necesita: registro con link personal y `registrant_id`,
asistencia por tramo y por sesión cruzable por `registrant_id`, inicio/fin real, webhooks firmados con
reintentos, y rate limits holgados para el volumen de un lanzamiento. No apareció ningún bloqueo técnico.

Condiciones:

1. **Distribución.** Una app beta llega a **10 cuentas, 90 días máximo** y exige paquete de seguridad
   (SSDLC, SAST, DAST, privacidad, 3 de 5 políticas). Para producción hay que **publicar** (listed o
   unlisted) y pasar la revisión de Marketplace, sin plazo publicado. Es un proyecto en sí. Alternativa:
   S2S por cliente, sujeta a confirmar que los términos de Zoom lo permiten.
2. **Plan del cliente.** Pro o más **con add-on de Webinars**. Sin add-on, sólo la variante de reuniones.
3. **Momento del reporte.** No documentado: hay que medirlo antes de fijar el "fin + 30 min".
4. **App admin-managed** con scopes `:admin` (los reportes no existen con scope de usuario): la instala un
   admin de la cuenta del cliente, no el host.

Se pasaría a **roja** si: la prueba real muestra que `registrant_id` no viene en la asistencia o que el email
de los registrados externos llega vacío (no habría cruce con el lead), o si Zoom no aprueba la publicación y
tampoco permite el modelo S2S por cliente.

---

## Qué hay que confirmar con una cuenta real

Cuenta de prueba: Zoom **Pro + add-on Webinars**, un usuario admin, y una segunda cuenta Zoom (gratis
alcanza) que haga de "cliente externo" para el punto 9.

1. **Plan.** Crear un webinar tipo 5 con registro (`POST /users/me/webinars`). *Prueba:* `201`. En una cuenta
   Pro **sin** add-on, el mismo pedido o el registro devuelve el error de plan → queda escrito cuál es.
2. **Registro y link personal.** `POST /webinars/{id}/registrants` con un email externo. *Prueba:* `201` con
   `join_url` y `registrant_id`; abrir el `join_url` en otro navegador entra al webinar **sin pedir datos**.
   Anotar si Zoom mandó su mail de confirmación.
3. **Batch y auto-aprobación.** `POST /webinars/{id}/batch_registrants` con 30 leads y un webinar de aprobación
   manual con `auto_approve: true`. *Prueba:* 30 `join_url` distintos, todos `approved`.
4. **Límite de 3 registros.** Registrar el mismo email 4 veces el mismo día. *Prueba:* anotar qué devuelve el
   4.º (código y mensaje) para tratarlo como error definitivo.
5. **Asistencia con re-ingreso.** Correr el webinar con 3 asistentes: uno se queda todo, uno sale antes del
   "minuto de oferta", uno sale y vuelve a entrar. *Prueba:* `GET /report/webinars/{uuid}/participants?include_fields=registrant_id`
   y `GET /past_webinars/{uuid}/participants?include_fields=registrant_id` devuelven **4 tramos** con
   `registrant_id` y `user_email` **no vacíos**, y los tiempos alcanzan para decidir quién se quedó hasta la
   oferta. Comparar los dos endpoints: si son iguales, alcanza con el de scope de usuario.
6. **Cuándo está el reporte.** Al llegar `webinar.ended`, consultar el reporte cada 5 min hasta que el
   `total_records` deje de cambiar y no haya `duration` 0. *Prueba:* minutos entre `end_time` y la primera
   respuesta completa, en 2 corridas (una con pocos y otra con el máximo de asistentes que se consiga). Si
   supera 30 min, cambiar el primer intento del diseño.
7. **Webhooks de entrada.** Suscribir los eventos de la tabla (f) a un endpoint de preview que implemente CRC
   y firma. *Prueba:* "Validate" pasa en el build flow; llegan `webinar.registration_created`, `started`,
   `participant_joined`/`left` (con `registrant_id`) y `ended`; una firma alterada se rechaza; devolver `500`
   produce el reintento a los ~5 min.
8. **Suscripción por API (salida).** `POST /marketplace/app/event_subscription` con `subscription_scope:
   "account"` para la cuenta de prueba. *Prueba:* `201` con `event_subscription_id` y los eventos llegan a la
   URL indicada.
9. **App no publicada en otra cuenta.** Pedir la *authorization URL* beta (requiere el paquete de seguridad) y
   agregarla desde la segunda cuenta como admin. *Prueba:* la cuenta externa instala la app y la API responde
   con su token; anotar el plazo de aprobación y qué pidió Zoom. Si no se quiere armar el paquete todavía,
   probar el **plan B**: crear una app S2S en la segunda cuenta y operar con esas credenciales; y **preguntar a
   Zoom (integration.testers@zoom.us o soporte) si ese modelo está permitido**.
10. **Desinstalación.** Quitar la app desde la cuenta externa. *Prueba:* llega `app_deauthorized` firmado.
11. **Refresh token.** Refrescar dos veces seguidas. *Prueba:* el primer refresh token queda inválido después
    de usar el segundo (rotación), o no — define si hay que guardar el refresh token en una transacción.
12. **Sesión de práctica.** Iniciar y terminar el modo práctica. *Prueba:* llega `webinar.ended` con
    `practice_session: true` y no hay que procesarlo.
