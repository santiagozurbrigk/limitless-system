# Alertas de procesos de fondo (Sentry)

SCRUM-84 / `[OBS-SIN-ALERTAS]`. El código ya manda todo a Sentry. Lo que falta es del lado de Sentry: comprar el plan
Team y crear las reglas de esta página. Decisión del 2026-10-02: las alertas van por **mail**.

## Qué manda el código

| Qué | Cómo llega a Sentry | Etiquetas |
|---|---|---|
| Un cron de `vercel.json` que no corrió en su horario, tardó más de 15 min o terminó en error / 5xx | Cron Monitor (`conMonitorDeCron`), slug `cron-…` o `integrations-…` | — |
| Un error de una org dentro de un cron (GHL, Calendly, Fathom) | `reportarFalla` | `proceso_de_fondo`, `cron`, `org_id`, `provider` |
| Un worker de QStash que falla | `reportarFalla` en el catch del worker | `proceso_de_fondo`, `cron`, `org_id` |
| Un job de QStash que agotó sus reintentos | `/api/queue/failure` | `proceso_de_fondo`, `cron` (ruta del worker), `org_id`, `provider=qstash` |
| Errores del bot de Discord y del reel-worker | `@sentry/node` (si tienen `SENTRY_DSN`) | `app=discord-bot` / `app=reel-worker`, `proceso_de_fondo` |

Detalle técnico en [`arquitectura/jobs-webhooks-y-colas.md`](../arquitectura/jobs-webhooks-y-colas.md) § Instrumentación y Sentry.

## Una vez comprado el plan Team

1. **Monitores de crons:** aparecen solos en Sentry → Crons después de la primera corrida de cada uno (19). Cada uno
   abre un issue a las 2 fallas seguidas. Revisar que estén los 19 y que el horario coincida con `vercel.json`.
2. **Regla "issue nuevo de un proceso de fondo"** (Alerts → Create alert → Issues):
   - Cuándo: *A new issue is created*.
   - Filtro: tag `proceso_de_fondo` igual a `true`.
   - Acción: mail a los miembros del equipo.
   - Frecuencia: una vez cada 30 minutos por issue.
3. **Regla "pico de errores"**:
   - Cuándo: *The issue is seen more than 50 times in 1 hour*.
   - Mismo filtro y misma acción que la anterior.
4. **Regla de los monitores**:
   - Cuándo: un issue de Cron Monitor (categoría *Crons*) se crea o cambia de estado.
   - Acción: mail.
5. **Bot y worker:** cargar `SENTRY_DSN` (el mismo valor que en Vercel) en Railway (bot) y en Fly (`fly secrets set`,
   reel-worker), y redesplegar.
6. **Tope de gasto:** pay-as-you-go en USD 30, como se decidió.

## Prueba de aceptación (cierra SCRUM-84)

Anotar el resultado en [`verificacion-manual.md`](./verificacion-manual.md) § Alertas de procesos de fondo.
