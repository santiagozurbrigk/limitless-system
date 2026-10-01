# Incidentes — qué hacer cuando algo se rompe en producción

> Escrito el 2026-09-23 sobre el código `038caca`, a partir de lo que el sistema tiene hoy (no de lo ideal).
> Contexto y riesgos: [`docs/auditoria/backups-y-recuperacion.md`](../auditoria/backups-y-recuperacion.md).
> Mapa de crons, webhooks y colas: [`docs/arquitectura/jobs-webhooks-y-colas.md`](../arquitectura/jobs-webhooks-y-colas.md).

**Lo primero que hay que saber:** la base de producción **no tiene backups** (Supabase plan Free,
`[DR-BACKUPS-SUPABASE]`). Mientras eso siga así, en cualquier incidente que toque datos **no borres, no
corras scripts de "arreglo" y no apliques migraciones** hasta haber hecho un dump (paso 0 de §3).

## 1. Dónde mirar

| Qué | Dónde | Sirve para |
|---|---|---|
| App web, crons, webhooks | Vercel → proyecto `otc-plaform` (team `otcteam`) → **Logs** (filtrar por ruta: `/api/cron/`, `/api/webhooks/`) y **Crons** (última ejecución de cada uno) | Casi todo |
| Errores con stack | Sentry (proyecto de `SENTRY_PROJECT`); sólo `apps/web` en producción | Excepciones de páginas, actions y rutas |
| Base, Auth, Storage | Supabase → proyecto `OTC` (`nrzlylzbmsuowzhpdnjl`) → Logs (Postgres, Auth, API) y Reports; estado general en `status.supabase.com` | Caídas, sólo lectura, cupos |
| Colas | Upstash → QStash → Logs / DLQ | Jobs que no llegan o fallan |
| Worker de reels | `fly logs -a otc-reel-worker`, `fly status -a otc-reel-worker` | Trial reels |
| Bot de Discord | Railway → servicio `otc-discord-bot` → Logs | Mensajes de Discord que no llegan |
| Estado de proveedores | status pages de Anthropic, OpenAI, Vercel, Supabase, Upstash, Zernio | Descartar que sea de ellos |

**No uses** la página "Infraestructura" del super admin para diagnosticar: sus estados están escritos a mano y
siempre dicen "ok" (`[MONITOREO-Y-ALERTAS]`).

## 2. Cómo se detecta hoy

No hay alertas automáticas verificadas ni endpoint de salud. Un incidente se entera por:
- un cliente o alguien del equipo que avisa;
- Sentry (si alguien configuró alertas por mail; **verificar**);
- revisar Vercel → Crons (un cron sin ejecución reciente o con 500);
- mails de Supabase (aviso de pausa, cupo excedido).

Chequeo rápido de 2 minutos:
1. ¿Abre `/login`? ¿Se puede entrar con una cuenta de prueba?
2. Vercel → Deployments: ¿el último deploy de producción está `READY`? ¿Cuándo fue?
3. Vercel → Logs últimos 30 min: ¿hay una ola de 500?
4. Supabase → proyecto: ¿`ACTIVE_HEALTHY`? ¿Algún banner de cupo o sólo lectura?

## 3. Primeros pasos por tipo de incidente

### 0 · Antes de tocar datos (vale para todos)
Si el incidente implica datos borrados, pisados o mezclados: hacé un dump **antes** de cualquier arreglo.
```bash
supabase db dump --db-url "$DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$DB_URL" -f schema.sql
supabase db dump --db-url "$DB_URL" -f data.sql --use-copy --data-only
```
(`DB_URL` = connection string del Session pooler, Supabase → Connect. Guardar fuera del repo: tiene datos de clientes.)

### A · La app no carga o da error a todos
1. ¿Coincide con un deploy? Vercel → Deployments. Si el error empezó con el último deploy: **Instant Rollback** al anterior `READY`.
   - Antes, fijate si ese deploy vino con una migración (`supabase/migrations/` en el diff del PR). El rollback **no revierte la base**: si la migración borró o renombró columnas, el deploy viejo también va a fallar. En ese caso la salida es un fix hacia adelante (migración nueva o código tolerante), no el rollback.
   - Después del rollback, los merges nuevos pueden no promoverse solos: al terminar, re-promover desde Vercel.
2. ¿Es Supabase? Si Auth o la base no responden, los usuarios rebotan a `/login` y el login falla. Mirar `status.supabase.com` y el proyecto. Si está **pausado**: *Resume project* (el Free se pausa tras 7 días de poca actividad). Si está en **sólo lectura** (base > 500 MB): ver §E.
3. ¿Es Vercel? `vercel-status.com`. No hay plan B: esperar.
4. Avisar a los clientes (§4) si pasan más de 15 minutos.

### B · Un webhook de pagos falla (Whop, Commas, Mercado Pago, GHL)
1. Vercel → Logs, filtro `/api/webhooks/<proveedor>`. Mirar el código de respuesta:
   - **401 "Firma inválida"**: el secreto de la org en Limitless no coincide con el del proveedor (alguien lo regeneró). La org tiene que reconectar el proveedor con el secreto nuevo.
   - **404 "no tiene … conectado"**: la integración no existe o está inactiva para esa org.
   - **500 "No se pudo verificar el webhook"** (Whop/Commas) o **500 "No se pudo leer la integración"** (GHL): falló la base al leer la integración, **o el secreto no se pudo descifrar**. Si el log dice `[payments] no se pudo descifrar el secreto`, ¿alguien cambió `ENCRYPTION_MASTER_KEY` sin cargar la anterior? (ver §F y [`rotacion-master-key.md`](./rotacion-master-key.md)). Si dice `no se pudo leer la integración`, es la base. Whop y GHL reintentan solos; Commas no (ver `[ALERTA][fanbasis]` abajo).
   - **500 con `status: "error"`**: el evento no quedó guardado (`stored: false`) o falló después de guardarlo. Whop y GHL reintentan, y el reintento lo reprocesa. **Commas no reintenta**: si no se guardó, busca en los logs `[ALERTA][fanbasis]`, que trae el payload completo. Ese payload tiene datos personales del comprador (nombre, email): los logs de Vercel se retienen según el plan del equipo y sólo los ve quien tiene acceso al proyecto `otc-plaform`. No los copies a canales abiertos; después de cargar el cobro, alcanza con anotar el id del evento.
   - **200 con `status: "error"` y `reintentable: false`**: se guardó pero falló por un dato que no se puede grabar (fecha o número inválido). Reintentar no cambiaría nada, así que el proveedor no reintenta; queda en `error` para el reproceso una vez corregida la causa. En GHL también pasa con un evento sin id de GHL (payload de Workflow): el reintento no lo encontraría y lo duplicaría.
   - **500 "El evento se está procesando"**: llegó un reintento mientras el original seguía en curso. Es normal; el proveedor vuelve a intentar y termina en `duplicate`.
2. Revisar `payment_webhook_events` de esa org: eventos en `unmapped` o `error` (leer `error_message`).
3. Recuperar:
   - Whop reintenta ~3 días ante un no-2xx: si se arregla la causa dentro de ese plazo, llegan solos.
   - **Commas no reintenta.** Hay que pedirle al cliente la lista de cobros del período y cargarlos a mano (no existe backfill por API: `[EMBUDOS-PAGOS-BACKFILL]`).
   - Eventos guardados en `unmapped`, `error` o trabados en `pending`: `scripts/reprocesar-webhooks.ts` (desde `apps/web`, con `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` de producción). Primero sin `--aplicar` para ver cuántos hay; después con `--aplicar` (opcional `--org <uuid>`).
4. **Nunca cargues un cobro con monto cero o inventado** porque no se pudo leer el payload: queda sin mapear y se anota.

### C · Un cron no corre o falla
1. Vercel → Crons: ¿figura? ¿Última ejecución? Vercel → Logs filtrando la ruta.
2. Si responde **500 "CRON_SECRET is not configured"** o **401**: la variable falta o cambió. Revisar en Vercel y redeployar.
3. Si es un cron con fan-out (reportes, inteligencia, tono, métricas de contenido): mirar QStash → Logs; los workers pueden responder 200 aunque el trabajo haya fallado (`[INTELIGENCIA-SIN-REINTENTO]`).
4. Re-ejecutar a mano para una org:
   ```bash
   curl -X POST "https://<app>/api/cron/<cron>?organizationId=<uuid>" -H "Authorization: Bearer $CRON_SECRET"
   ```
   Ojo: no hay lock entre corridas (`[AUD-SALUD-3]`) y los reportes se pueden duplicar (`[REPORTES-DUPLICADOS]`).
5. Lo que no se recupera: el snapshot de anuncios del día (`capture-ad-metrics`) si Zernio no respondió; queda el hueco.

### D · Se agotó o rechazan la clave de IA (Anthropic)
1. Logs: `[anthropic] La clave propia de la organización … fue rechazada` (401/403) o errores de créditos (400 `billing_error`).
2. **Clave de una org rechazada**: el sistema la marca `invalid`, el founder ve la barra roja y se sigue con la global **si existe** (`ANTHROPIC_API_KEY`; `[ENV-ANTHROPIC-VERCEL]`). Avisar a la org para que cargue una nueva.
3. **Clave de una org sin créditos**: no cae a la global (`[IA-CLAVE-SIN-CREDITOS]`). Avisar a la org.
4. **La clave global sin créditos o rechazada**: afecta a todas las orgs sin clave propia. Recargar créditos en la consola de Anthropic o cargar una clave nueva en Vercel y redeployar. El reel-worker usa su propia copia (`fly secrets set ANTHROPIC_API_KEY=…`).
5. Después: re-disparar los crons de IA del día que fallaron (§C.4). El costo por org se ve en `/super-admin/costs`.

### E · Supabase en sólo lectura o sin cupo de Storage
1. Síntoma: errores `cannot execute INSERT in a read-only transaction`, o subidas de archivos que fallan.
2. Mientras dure, **los webhooks de pagos pierden cobros** (responden 200 sin guardar). Priorizar.
3. Salidas: pasar a Pro (lo más rápido y, además, activa backups) o liberar espacio. Para liberar: hacer el dump (§0) y recién después borrar; Supabase explica cómo salir del modo sólo lectura en *Database size → Disabling read-only mode*.

### F · Se filtró un secreto
Primero **cuál** y **dónde vive** (tabla de `docs/auditoria/backups-y-recuperacion.md` §5):

| Secreto | Qué hacer ya | Cuidado |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Regenerar en Supabase → Settings → API keys; actualizar **Vercel, Fly y Railway**; redeploy de los tres | Es acceso total a la base de todas las orgs: tratar como fuga de datos (§G para avisar) |
| `ENCRYPTION_MASTER_KEY` | Rotar la service role primero (sin ella lo cifrado no se lee). Después rotar la clave con [`rotacion-master-key.md`](./rotacion-master-key.md): nueva como actual, vieja como `ENCRYPTION_MASTER_KEY_PREVIOUS`, script de re-cifrado, sacar la vieja | Nunca cambiarla sin cargar la anterior: rompe todas las integraciones cifradas. Si ya se cambió por error: volver a cargar el valor anterior |
| `CRON_SECRET` | Nuevo valor en Vercel + redeploy | — |
| `WORKER_AUTH_SECRET` | Nuevo valor en Vercel y `fly secrets set`; redeploy | Los jobs ya encolados con el valor viejo fallan: re-disparar |
| `LIMITLESS_WEBHOOK_SECRET` / `OTC_WEBHOOK_SECRET` | Nuevo valor en Vercel y Railway | El bot da 401 hasta que se actualicen los dos |
| Secreto de webhook de una org (Whop, Commas, GHL, Calendly, Fathom) | Regenerar en el proveedor y reconectar en Limitless | Durante el cambio pueden rechazarse webhooks (ver §B) |
| Otros (Stripe, Mercado Pago, OAuth, Resend, OpenAI, Anthropic) | Regenerar en el proveedor y actualizar Vercel | — |

Después: revisar logs del proveedor por uso indebido, y si hubo acceso a datos, §G.

### G · Una organización ve datos de otra
Es el incidente más grave (fuga entre clientes).
1. **Contener**: si se identifica la pantalla o action, rollback del último deploy si coincide; si no, pausar la org afectada o desactivar el módulo desde el super admin. No borrar nada.
2. **Preservar evidencia**: capturas del usuario, hora exacta, org de quien vio y org de los datos, logs de Vercel de ese momento, dump (§0).
3. **Diagnosticar**: suele ser una lectura con `createAdminClient()` sin filtro por `organization_id`, una policy sin filtro, el portfolio del holding (`[HOLDING-PORTFOLIO-ROL]`) o la org activa del holding mal resuelta. Ver `docs/arquitectura/auth-organizaciones-y-permisos.md`.
4. **Avisar** a las organizaciones cuyos datos quedaron expuestos (a definir por el equipo quién y cómo; considerar obligaciones legales de protección de datos).

### H · Se borraron datos por error (baja de org, script, migración)
1. Parar lo que esté borrando (cancelar el deploy, el script, el cron).
2. Dump inmediato (§0) para no empeorar.
3. Sin backup (plan Free) **no hay restauración**: reconstruir con lo que se pueda (tabla "Qué se puede reconstruir" de la auditoría): re-sincronizar proveedores, pedir al cliente los archivos y la carga manual.
4. Una baja de org hecha por el super admin queda en `super_admin_deletions` (quién, cuándo, resultado), pero los datos no se recuperan.

### I · El bot de Discord o el worker de reels no responden
- Bot: Railway → Logs. Al arrancar dice si falta una variable y si la clave de Supabase es la service role. Los mensajes enviados mientras estuvo caído **no se recuperan** (`[DISCORD-BACKFILL]`).
- Worker: `fly status` / `fly logs`. Arranca en frío con el primer job. Un job fallido no se reintenta solo: el usuario tiene que volver a generar.

## 4. A quién avisar

**A definir por el equipo.** Completar:

| Rol | Quién | Cómo contactarlo |
|---|---|---|
| Responsable técnico de guardia | _a definir_ | _a definir_ |
| Dueño de las cuentas (Supabase, Vercel, Fly, Railway) | _a definir_ (hoy una sola cuenta es dueña de Supabase y un solo usuario administra Vercel) | _a definir_ |
| Quién avisa a los clientes y por qué canal | _a definir_ | _a definir_ |
| Contacto de cada proveedor (soporte Supabase, Vercel, Whop, Commas, Zernio) | _a definir_ | _a definir_ |

Regla sugerida: si afecta a cobros (§B, §E) o a datos de clientes (§F, §G, §H), avisar al responsable técnico **y** al dueño del negocio en el momento, no al final.

## 5. Cómo cerrar un incidente

1. Confirmar que se recuperó el servicio (chequeo rápido de §2) y lo que se perdió (cobros, mensajes, reportes).
2. Escribir un post-mortem corto en `docs/historial/incidente-AAAA-MM-DD-<slug>.md`:
   - **Qué pasó** (en palabras simples) y **línea de tiempo** (detección, contención, resolución, con hora).
   - **Impacto**: orgs afectadas, datos o cobros perdidos, cuánto tiempo.
   - **Causa raíz** y por qué no se detectó antes.
   - **Qué se hizo** y **qué queda**: ítems nuevos en `PENDIENTES.md` (con ID) y entrada en `CHANGES.md`.
   - Sin culpas personales: se describe el sistema, no a quién.
3. Si faltó algo en este runbook, corregirlo en el mismo cambio.
