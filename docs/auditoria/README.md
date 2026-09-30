# Informe de auditoría del sistema — Limitless

| | |
|---|---|
| **Fecha** | 2026-09-23 |
| **Código auditado** | `038caca` (`main`), monorepo `santiagozurbrigk/limitless-system` |
| **Producción** | Supabase `nrzlylzbmsuowzhpdnjl` (sólo estructura y agregados, **nunca filas de clientes** ni escrituras), Vercel (nombres de variables y agregados de errores, sin descifrar valores) |
| **Regla de la auditoría** | **No se modificó código.** Se documentó el sistema que existe; los arreglos van por el [plan de remediación](./plan-de-remediacion.md) |
| **Para quién** | Agustín (producto), Fernando (Scrum Master / dev senior), Martín (backlog), Santiago y Matías (desarrollo) |

## 1. Resumen ejecutivo

**Qué es el sistema.** Limitless es una app multi-organización (Next.js 15 en Vercel + Supabase) con 228
funcionalidades en 10 áreas, 147 tablas, 84 endpoints, 19 tareas programadas y 21 integraciones. La descripción
funcional está en [`../FUNCIONAL.md`](../FUNCIONAL.md) y la técnica en [`../README.md`](../README.md).

**Lo que está bien.** La separación entre organizaciones **en las tablas** está bien diseñada y encendida: las
147 tablas tienen reglas por organización y ninguna deja leer datos ajenos por sí sola. Los webhooks verifican
firmas, el historial de git no tiene secretos (895 commits revisados), el navegador no recibe claves privadas, y
la documentación ahora coincide con el código (cerca de 220 correcciones en 47 documentos).

**Lo que preocupa.** Cinco riesgos concentran casi todo:

1. **No hay backups.** Producción está en el plan gratuito de Supabase: si se borra o corrompe algo, no hay de
   dónde recuperarlo. El almacenamiento de archivos está al 80 % de su cupo.
2. **Hay formas concretas de romper la separación entre organizaciones** fuera de las tablas: conectar una
   integración a otra organización (OAuth), abrir archivos de otra organización, el holding y un espacio de
   archivos abierto a cualquier usuario.
3. **Dentro de una organización, los roles no protegen nada**: un usuario de sólo lectura puede editar,
   darse permisos y hasta **borrar la organización entera** con una sola llamada.
4. **Se pueden perder cobros y datos sin aviso**: webhooks de pago que responden "OK" sin haber guardado, y
   procesos que fallan en silencio.
5. **Nadie se entera cuando algo falla**: no hay alertas. En los últimos 7 días hubo ~3.000 fallas de IA, 849
   rechazos de Zernio y 168 fallas de GoHighLevel que nadie vio.

**Números.** El backlog tiene 359 ítems. Los 105 urgentes (13 P0 y 92 P1) tienen severidad, riesgo, impacto
y criterio de aceptación:

| | Crítica | Alta | Media | Baja | Total |
|---|---|---|---|---|---|
| **P0** | 7 | 5 | 1 | 0 | 13 |
| **P1** | 12 | 31 | 42 | 7 | 92 |

**Qué hacer.** Esta semana, una **fase de contención** sin código o con migraciones de pocas líneas: backup,
cerrar la vista que borra organizaciones, el espacio de archivos abierto, rotar el secreto filtrado, alertas. Después, dos
sprints: acceso y aislamiento, y plata y datos. Detalle en el [plan de remediación](./plan-de-remediacion.md).

## 2. Alcance: qué cubre esta auditoría y qué no

| Dimensión | Cobertura | Dónde |
|---|---|---|
| Inventario del sistema y del repo | Completa | [`../arquitectura/vision-general.md`](../arquitectura/vision-general.md), [`../operacion/entorno-y-deploy.md`](../operacion/entorno-y-deploy.md) |
| Mapa del sistema y flujos de datos | Completa (7 diagramas) | [`../arquitectura/diagramas.md`](../arquitectura/diagramas.md) |
| Funcionalidades de punta a punta | Completa (228) | [`../FUNCIONAL.md`](../FUNCIONAL.md), [`../areas/`](../areas/) |
| Base de datos | Completa en esquema, RLS, funciones, storage y realtime | [`../arquitectura/base-de-datos.md`](../arquitectura/base-de-datos.md), [aislamiento](./aislamiento-entre-organizaciones.md) |
| Integraciones | Completa | [`../integraciones/`](../integraciones/README.md) |
| IA | Parcial: modelos, contexto, herramientas, costos registrados y reintentos. **No se evaluaron los prompts ni la calidad de las respuestas** | [`../areas/agente-ia.md`](../areas/agente-ia.md) |
| Seguridad | Completa en aislamiento, secretos, autenticación y modelo de amenazas. **No hubo pruebas de penetración** con una segunda organización real | [aislamiento](./aislamiento-entre-organizaciones.md), [secretos](./secretos-y-autenticacion.md), [amenazas](./modelo-de-amenazas.md) |
| Confiabilidad y observabilidad | Completa | [confiabilidad](./confiabilidad-y-monitoreo.md) |
| Backups, recuperación e incidentes | Completa | [backups](./backups-y-recuperacion.md), [`../operacion/incidentes.md`](../operacion/incidentes.md) |
| Decisiones de arquitectura | 12 ADRs | [`../arquitectura/decisiones/`](../arquitectura/decisiones/README.md) |
| **Calidad de código** (tipos, duplicación, funciones gigantes, manejo de errores) | **No hecha** | — |
| **Rendimiento** (tiempos, consultas lentas, bundle) | **No hecha**: sólo síntomas encontrados de rebote | — |
| **Costos por cliente** | **No hecha**: hay registro de tokens, no un costo por organización completo | — |

## 3. Arquitectura

**Evaluación.** Arquitectura clásica y adecuada para el tamaño: monolito Next.js con Server Actions, Supabase con
RLS como barrera entre organizaciones, colas (QStash) y dos servicios satélite (worker de video en Fly, bot de
Discord en Railway). Las 12 decisiones grandes están registradas en [ADRs](../arquitectura/decisiones/README.md).
En 7 de ellas el motivo original no quedó escrito, y el ADR lo dice.

**Deuda de diseño principal.** Los permisos se aplican en las pantallas y no en el servidor (ADR-005), cuando la
especificación original pedía lo contrario. Además, la regla "guardar el payload crudo y nunca inventar un valor"
(ADR-010) se incumple en los webhooks de pago y en Fathom.

## 4. Base de datos

**Evaluación.** Sólida en el aislamiento entre organizaciones: 138 de 147 tablas OK y 9 para revisar, ninguna con
falla directa. Las 16 tablas de secretos no son legibles por los usuarios.

**Hallazgos.** Hay diferencias entre producción y el repo en Storage, Realtime y permisos de funciones
(`[DB-DRIFT-STORAGE-REALTIME]`). Una vista escribible permite borrar la organización propia
(`[DB-VISTA-CLAUDE-STATUS-ESCRIBIBLE]`, P0). Las claves foráneas no exigen que ambos lados sean de la misma
organización (`[DB-FK-MISMA-ORG]`). Detalle en [aislamiento](./aislamiento-entre-organizaciones.md).

## 5. Seguridad

**Evaluación.** Los controles entre organizaciones están en su lugar en la capa de tablas. Los huecos están en las
capas que rodean a esa barrera y en la identidad de los usuarios.

| Hallazgo | Sev. | Ítem |
|---|---|---|
| Cualquier miembro puede borrar su organización entera vía una vista **Resuelto el 2026-09-29 (SCRUM-9, `20260928200000`).** | Crítica | `[DB-VISTA-CLAUDE-STATUS-ESCRIBIBLE]` (P0) |
| Conectar una integración a otra organización (cookie OAuth sin firmar) **Resuelto el 2026-09-30 (SCRUM-10): la org sale de la sesión y la de la cookie sólo tiene que coincidir; sin HMAC.** | Crítica | `[OAUTH-ESTADO-SIN-FIRMA]` (P0) |
| Espacio de archivos `import-files` legible y borrable por cualquiera **Resuelto el 2026-09-29 (SCRUM-12; el bucket se borró).** | Crítica | `[SEG-BUCKET-IMPORT-FILES]` (P0) |
| Un miembro desactivado sigue entrando **Resuelto el 2026-09-29 (SCRUM-8, `20260929110000`).** | Crítica | `[EQUIPO-DESACTIVAR-NO-BLOQUEA]` (P0) |
| Permisos sólo en pantallas; un miembro puede darse más permisos | Alta | `[PERMISOS-SERVER-ACTIONS]` (P0) y sus partes por área |
| Rutas de archivos escribibles por el usuario que el servidor abre sin validar | Crítica | `[STORAGE-RUTA-DESDE-FILA]` (P1) |
| Identificadores de cuentas externas escribibles que deciden a qué org va un evento **Resuelto el 2026-09-30 (SCRUM-82, `20260930110000`).** | Crítica | `[SEG-RLS-IDENTIFICADORES-EXTERNOS]` (P1) |
| Holding: miembros sin permiso leen y escriben en los negocios | Crítica | `[HOLDING-PORTFOLIO-ROL]` (P1) |
| Secreto del worker de video en URLs y logs | Crítica | `[TRIAL-SECRET-EN-URL]` (P1) |
| Altas de cuentas para emails ajenos; sin MFA | Crítica / Alta | `[AUTH-ALTA-EMAIL-AJENO]`, `[AUTH-MFA-Y-POLITICA]` (P1) |

Detalle: [aislamiento](./aislamiento-entre-organizaciones.md), [secretos y autenticación](./secretos-y-autenticacion.md),
[modelo de amenazas](./modelo-de-amenazas.md), [`../arquitectura/seguridad.md`](../arquitectura/seguridad.md).

## 6. Integraciones

**Evaluación.** 21 integraciones, cada una con su resumen verificado contra la copia local de la documentación del
proveedor. Las firmas de webhooks están bien. Las debilidades son tres:
- una integración con token vencido sigue figurando como conectada (`[INTEGRACIONES-ERROR-SIN-MARCA]`);
- los tokens OAuth se guardan en texto plano (`[AUD-SEG-2]`);
- varias integraciones nunca se probaron con cuentas reales (ver [`../operacion/verificacion-manual.md`](../operacion/verificacion-manual.md)).

## 7. Motor de IA

**Evaluación.** Bien armado en contexto (JIT, compaction, RAG por organización) y en registro de uso
(`token_usage`). Tiene tres debilidades:
- el agente no cae a la clave global cuando la de la organización falla (`[AGENTE-SIN-FALLBACK-CLAVE]`);
- una clave inválida generó ~3.000 reintentos en 7 días (`[1A1-CLAVE-ANTHROPIC-ROTA]`);
- inteligencia y reportes leen tablas viejas vacías (`[INTELIGENCIA-FUENTES-LEGACY]`).

No se auditó la calidad de los prompts. Detalle en [`../areas/agente-ia.md`](../areas/agente-ia.md).

## 8. Confiabilidad

**Evaluación.** El sistema guarda bien, pero avisa mal. Hay pérdidas silenciosas en tres lugares:
- webhooks de pago que responden "OK" sin haber guardado (`[EMBUDOS-WEBHOOK-PERDIDA]`);
- reintentos legítimos descartados (`[AUD-CONF-5]`);
- la sync de Fathom saltea para siempre una llamada que no pudo guardar (`[FATHOM-SYNC-CURSOR]`).

Además, varios crons se cortan a los 60 segundos (`[CRONS-CORTE-60S]`). Detalle en [confiabilidad](./confiabilidad-y-monitoreo.md).

## 9. Observabilidad

**Evaluación.** Sentry está configurado pero sólo recibe los errores que nadie atrapa. No hay alertas
(`[OBS-SIN-ALERTAS]`), no hay chequeo de salud ni monitor de disponibilidad (`[MONITOREO-Y-ALERTAS]`), y la página
de Infraestructura del super admin muestra estados fijos. Los logs no llevan la organización ni un id de request
(`[LOGS-SIN-CONTEXTO]`), y algunos guardan datos personales (`[LOGS-DATOS-SENSIBLES]`).

## 10. Backups y recuperación

**Evaluación.** Es el riesgo más alto del sistema:
- no hay backups de la base ni de los archivos (`[DR-BACKUPS-SUPABASE]`), y nunca se probó una restauración;
- la clave maestra de cifrado no se puede rotar y no hay copia verificada (`[SEC-MASTER-KEY-ROTACION]`);
- no hay entorno de prueba separado: los previews usan producción (`[ENTORNO-STAGING]`).

Ya existe un runbook de incidentes: [`../operacion/incidentes.md`](../operacion/incidentes.md). Detalle en [backups](./backups-y-recuperacion.md).

## 11. Deuda técnica

Está clasificada en [`PENDIENTES.md`](../../PENDIENTES.md) por área, prioridad y severidad, y exportada a Jira
([`../backlog/`](../backlog/README.md)). Fuera de la seguridad, la deuda más visible para el usuario es la
siguiente:
- pantallas que leen tablas viejas vacías: métricas de DMs, Overview de Marketing, Conexión con Ventas e Inteligencia;
- código muerto sin llamador, anotado por área;
- 89 archivos de test con 1.134 casos, que cubren lógica pura; casi no hay pruebas de flujos completos.

## 12. Prioridades a revisar

La severidad sugiere mover estas prioridades. **No se cambiaron**: lo deciden Agustín y Fernando.

| Ítem | Hoy | Severidad | Sugerencia |
|---|---|---|---|
| `[TRIAL-SECRET-EN-URL]` | P1 | Crítica | P0: el secreto ya está en logs y permite leer archivos de otras orgs |
| `[HOLDING-PORTFOLIO-ROL]` | P1 | Crítica | P0 si hay holdings con miembros que no son admin |
| `[SEG-REEL-WORKER-AUTH]` | P1 | Crítica | P0 si el worker de Fly no tiene cargado el secreto (confirmar con `fly secrets list`) |
| `[AUTH-CALLBACK-NEXT]` | P0 | Media | P1/P2: hoy no hay un camino práctico para explotarlo (el arreglo igual es corto) |
| `[CLOSING-LIST-1000]` | P0 | Alta | Medir cuántas organizaciones superan 1.000 turnos antes de sostenerlo como P0 |
| `[EQUIPO-CUSTOM-ROLE-ORG]`, `[OPS-STORAGE-BUCKETS]`, `[ENV-ZERNIO-WEBHOOK-SECRET]`, `[ZERNIO-WEBHOOK-SIN-EVENTOS]`, `[EMBUDOS-INSTRUMENTATION-DESACTUALIZADA]`, `[COBROS-AVISAR-PERMISOS]`, `[T-5]`, `[AUD-SEG-9]` | P1 | Baja/Media | P2 o P3 |

## 13. Preguntas abiertas

- ¿Se pasa Supabase a un plan pago? ¿Qué pérdida de datos (RPO) y tiempo de recuperación (RTO) se aceptan?
- ¿`ZERNIO_API_KEY` y `WORKER_AUTH_SECRET` en producción tienen valores reales? ¿Qué secretos tiene cargados el worker de Fly?
- ¿Hay holdings con miembros que no son admin? ¿Alguna organización supera los 1.000 turnos?
- ¿Tiene Sentry reglas de alerta configuradas? ¿Quién recibe las alertas?
- ¿El alta de cuentas debe ser pública?

## 14. Cómo se hizo (método)

1. **Alineación de la documentación con el código**: 51 documentos contrastados afirmación por afirmación, más un
   chequeo mecánico de cada ruta, función y enlace citado.
2. **Inventario funcional**: 228 funcionalidades seguidas de la pantalla a la base, con estado y evidencia.
3. **Formato de hallazgo** en el backlog: hecho con evidencia, severidad, riesgo, impacto, recomendación y
   criterio de aceptación. La severidad se evaluó por separado de la prioridad.
4. **Auditorías específicas** en paralelo: aislamiento (base y aplicación), secretos y autenticación, modelo de
   amenazas, confiabilidad y monitoreo, backups y recuperación.
5. **Verificación de los hallazgos críticos**: los de producción se confirmaron dos veces, por el frente que los
   encontró y por una consulta independiente al catálogo:
   - el espacio de archivos abierto;
   - el plan gratuito sin backups;
   - la vista que borra organizaciones;
   - el callback de OAuth.
6. **Diagramas y ADRs** reconstruidos desde el código y el historial.

**Trazabilidad.** Cada afirmación de estos documentos cita su evidencia (`archivo:línea`, migración, policy o
consulta al catálogo), y cada problema tiene un ID en [`PENDIENTES.md`](../../PENDIENTES.md). Los datos de
producción llevan la fecha en que se midieron.

## Documentos de esta auditoría

| Documento | Qué responde |
|---|---|
| [`plan-de-remediacion.md`](./plan-de-remediacion.md) | En qué orden arreglar, con dependencias y decisiones pendientes |
| [`aislamiento-entre-organizaciones.md`](./aislamiento-entre-organizaciones.md) | ¿Puede la org A ver o tocar datos de la org B? (tabla por tabla, y cada uso de service role) |
| [`secretos-y-autenticacion.md`](./secretos-y-autenticacion.md) | ¿Hay secretos expuestos? ¿Cómo se autentica y qué falta? |
| [`modelo-de-amenazas.md`](./modelo-de-amenazas.md) | Quién podría atacar qué, por dónde, y qué lo impide |
| [`confiabilidad-y-monitoreo.md`](./confiabilidad-y-monitoreo.md) | Si falla cada flujo: qué pasa, cómo nos enteramos, cómo se recupera |
| [`backups-y-recuperacion.md`](./backups-y-recuperacion.md) | Backups, deploy, rollback, rotación de secretos, qué se puede reconstruir |
| [`../operacion/incidentes.md`](../operacion/incidentes.md) | Qué hacer cuando algo se rompe |
| [`../arquitectura/diagramas.md`](../arquitectura/diagramas.md) | El sistema en 7 diagramas |
| [`../arquitectura/decisiones/`](../arquitectura/decisiones/README.md) | Por qué el sistema es como es (12 ADRs) |
