# Fathom — lo que Limitless necesita

> Documentación bajada el **2026-09-01** desde `developers.fathom.ai`, en el
> formato markdown que el sitio publica en [`llms.txt`](./llms.txt). 39 archivos.
> Reproducir con `docs/external-apis/tools/fathom-urls.txt`.

**Base URL:** `https://api.fathom.ai/external/v1` · **Auth:** API key o Bearer.

---

## El hallazgo que cambia el diseño del módulo de llamadas

> **Estado al 2026-09-23 (commit 038caca):** este hallazgo ya se aplicó. `lib/fathom/api.ts`
> parsea `calendar_invitees` (`lib/fathom/invitees.ts`) y `meeting_type`; `lib/fathom/sync.ts`
> los guarda en `fathom_calls.calendar_invitees` / `fathom_calls.meeting_type`, y el pipeline
> (`lib/fathom/process-call.ts`) clasifica por mail de invitado (`resolve-sales-call.ts`,
> `classify-recording.ts`); el título quedó sólo como respaldo (`associate.ts`). `meeting_type`
> se guarda pero **nada lo usa todavía** (la tabla `fathom_meeting_type_map` existe sin código que
> la lea). Lo que sigue es el diagnóstico del 2026-09-01, que motivó el cambio.

Al 2026-09-01, Limitless clasificaba las llamadas leyendo el **título**. El 86% de los títulos reales
eran `"Impromptu Google Meet Meeting"`, así que la clasificación no tenía de dónde
agarrarse y la asociación a cliente fallaba en el 100% de los casos.

**La API ya devolvía lo que hacía falta, y Limitless lo descartaba**: `lib/fathom/api.ts`
parseaba sólo título, fechas y transcript.

### `GET /meetings` — campos que antes no se leían

| Campo | Qué resuelve |
|---|---|
| `calendar_invitees[]` | **Identidad**. Array de invitados del calendario. Está en el `required` del schema: viene siempre. |
| `calendar_invitees[].email` | Match directo contra `closing_calls.lead_email` y contra clientes. No depende de cómo esté escrito el nombre. |
| `calendar_invitees[].is_external` | **Interna vs. externa**, dado por la API. Una reunión sin invitados externos es del equipo, sin heurística. |
| `calendar_invitees[].email_domain` | Agrupar por empresa. |
| `calendar_invitees[].name` | Desempate cuando el email no resuelve. |
| `meeting_type` | **Propósito**, configurado por la org en Fathom. Filtrable por query param. |
| `scheduled_start_time` | Match por ventana horaria contra `closing_calls.scheduled_at`. |

### `GET /meeting_types`

Lista los tipos de reunión de la organización (`active` e `inactive`). Los
valores que devuelve son los que acepta el filtro `meeting_type` de `/meetings`.

**Esto es mejor que la convención de nombres que se había pensado.** En vez de
que el closer escriba `"Llamada de venta - Mariano"` después de cada llamada, la
org mapea una vez, en configuración, qué tipo de reunión de Fathom corresponde a
venta, a entrega y a equipo. Deja de depender de que alguien escriba bien.

La convención de nombres sigue sirviendo como respaldo para las reuniones
improvisadas, que son las que no tienen tipo asignado.

### Otros filtros útiles de `/meetings`

- `calendar_invitees_domains[]` — filtra por dominio de la empresa invitada.
- `calendar_invitees_domains_type` — filtra por si la lista de invitados incluye
  dominios externos.

---

## Endpoints

| Método | Path | Uso en Limitless |
|---|---|---|
| GET | `/meetings` | Sync de la org (cron) y del miembro (`syncMemberFathomAction`), con `include_transcript` e `include_crm_matches` (`lib/fathom/api.ts`). Se leen `calendar_invitees` y `meeting_type`. También sirve para validar una key (`validateFathomApiKey`) y adivinar el mail de la cuenta de un miembro (`guessFathomAccountEmail`). |
| GET | `/meetings/{id}` | **No figura en la doc bajada.** `fetchFathomMeetingTitle` (`lib/fathom/api.ts`) lo usa con la key de la org para refrescar el título antes de procesar; si falla, devuelve `null` y se sigue con el título guardado. |
| GET | `/meeting_types` | Sin usar. Base del mapeo tipo → propósito de la Fase 1. |
| GET | `/recordings/{id}/summary` | Sin usar. Resumen. Acepta `destination_url` para modo asíncrono. |
| GET | `/recordings/{id}/transcript` | Sin usar. Transcript. Mismo modo asíncrono. |
| POST | `/webhooks` | Alta del webhook por miembro (`createFathomWebhook` en `lib/fathom/webhooks.ts`, pide transcript, summary, action items y CRM matches). Requiere al menos uno de `include_transcript`, `include_crm_matches`, `include_summary`, `include_action_items`. |
| DELETE | `/webhooks/{id}` | Baja, al desconectar la key de un miembro (`lib/fathom/webhooks.ts`). |
| GET | `/teams`, `/team_members`, `/users` | Sin usar. `users` trae permisos. |
| POST | `/recordings/{id}/download` | Genera archivo descargable; se consulta con `download_id`. |

---

## Qué queda por verificar contra una cuenta real

- **Que `calendar_invitees` venga poblado en las reuniones improvisadas.** El
  schema lo marca requerido, pero una reunión sin evento de calendario podría
  traer el array vacío. Es justo el 86% del volumen actual.
- **Que las orgs tengan tipos de reunión configurados.** Si nadie los usa en
  Fathom, `meeting_type` viene `null` y el mapeo no tiene de dónde partir.
- **Si el payload del webhook trae los mismos campos que `/meetings`.** El
  markdown de `new-meeting-content-ready` no detalla el cuerpo. El webhook por miembro
  (`app/api/integrations/fathom/webhook/[token]/route.ts`) guarda el crudo en
  `fathom_webhook_events` antes de interpretarlo y lo mapea con `mapFathomMeeting` (forma de
  `/meetings`, en la raíz o bajo `meeting`/`recording`/`data`); lo que no se entiende queda en el
  evento con `error`. En la prueba real del 2026-10-03 Fathom **no disparó** el webhook aunque la grabación
  ya estaba en `/meetings`; por eso el cron horario también sincroniza las keys por miembro
  (`lib/fathom/member-sync.ts`). Si alguna vez llega una entrega, confirmar la forma del cuerpo.
- **Firma de los webhooks:** esquema de `webhooks.md` ("Verifying Webhooks"): `webhook-id`,
  `webhook-timestamp`, `webhook-signature` (`v1,<base64>`), HMAC-SHA256 de `id.timestamp.cuerpo`
  con el secreto `whsec_` decodificado. Implementado en `lib/fathom/webhook-signature.ts`.
