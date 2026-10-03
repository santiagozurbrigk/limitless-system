# Documentación de Limitless

Reorganizada el 2026-09-23: cada documento de esta carpeta se verificó contra el código del commit
`038caca`. **Si un doc contradice al código, manda el código**, y el doc se corrige en el mismo cambio.

## Por dónde empezar (dev nuevo, ~1 hora)

1. [`arquitectura/vision-general.md`](./arquitectura/vision-general.md): stack, monorepo, estructura de
   `apps/web`, convenciones y cómo viaja una request.
2. [`arquitectura/auth-organizaciones-y-permisos.md`](./arquitectura/auth-organizaciones-y-permisos.md):
   organizaciones, holding, roles y permisos por módulo. Es lo que más se rompe sin saberlo.
3. [`arquitectura/base-de-datos.md`](./arquitectura/base-de-datos.md): migraciones, RLS e inventario de
   tablas por área.
4. El doc del área que vayas a tocar (tabla de abajo) y su sección en [`../PENDIENTES.md`](../PENDIENTES.md).

## Producto y backlog (sin leer código)

| Doc | Qué cubre |
|---|---|
| [`FUNCIONAL.md`](./FUNCIONAL.md) | **Documento funcional**: qué puede hacer el usuario en cada área y si funciona hoy, con sus pendientes. Base del backlog |
| [`ESTADO_PARA_EQUIPO.md`](./ESTADO_PARA_EQUIPO.md) | Resumen de una página: estado por área, problemas graves y decisiones pendientes |
| [`backlog/`](./backlog/README.md) | `PENDIENTES.md` exportado a CSV para importar a Jira, y el script que lo genera |
| [`backlog/historias.md`](./backlog/historias.md) | **Historias de usuario** (una por funcionalidad que hoy no funciona bien), con sus criterios y tareas técnicas, exportables a Jira |
| [`auditoria/`](./auditoria/README.md) | **Informe de auditoría** del 2026-09-23: resumen ejecutivo, aislamiento entre organizaciones, secretos y autenticación, modelo de amenazas, confiabilidad, backups y el plan de remediación |

## Áreas del producto

Cada doc sigue la misma estructura: qué es, pantallas y rutas, modelo de datos, cómo fluye el dato,
integraciones, reglas de negocio no obvias, limitaciones, tests y archivos clave.

| Área | Doc | Rutas principales |
|---|---|---|
| Clientes (CRM, ficha, 1-1, import) | [`areas/clientes.md`](./areas/clientes.md) | `/clients` |
| ↳ Recorrido, campos configurables y wins | [`areas/clientes-recorrido-y-wins.md`](./areas/clientes-recorrido-y-wins.md) | `/clients/checkpoints`, `/clients/wins`, `/clients/campos`, `/clients/revision` |
| ↳ Add-on growth partners (clientes de clientes, onboarding por link) | [`areas/clientes-growth-partners.md`](./areas/clientes-growth-partners.md) | `/onboarding-cliente/[token]` |
| Ventas (bandeja, closing, llamadas, cobros, métricas) | [`areas/ventas.md`](./areas/ventas.md) | `/sales/*` |
| Marketing (contenido Zernio, anuncios, UTMs, formularios, Trial Reels) | [`areas/marketing.md`](./areas/marketing.md) | `/marketing/*` |
| Embudos y Lanzamientos | [`areas/embudos.md`](./areas/embudos.md) | `/funnels`, `/lanzamientos` |
| Agente de negocio e IA (agente, RAG, BYOK, reportes, inteligencia) | [`areas/agente-ia.md`](./areas/agente-ia.md) | `/agent`, `/business-context/*`, `/executive-reports/*`, `/intelligence` |
| Operaciones y equipo (tablero, SOPs, inputs, equipo) | [`areas/operaciones.md`](./areas/operaciones.md) | `/workboard`, `/operations/*`, `/team` |
| Finanzas | [`areas/finanzas.md`](./areas/finanzas.md) | `/finance/*` |
| Producto (avatares, ofertas, value ladder) | [`areas/producto.md`](./areas/producto.md) | `/product/*` |
| Plataforma (panel, onboarding del founder, ajustes, integraciones, super admin) | [`areas/plataforma.md`](./areas/plataforma.md) | `/dashboard`, `/settings`, `/integrations`, `/super-admin/*` |
| Discord (bot y su integración) | [`areas/discord.md`](./areas/discord.md) | `apps/discord-bot` |

## Arquitectura (transversal)

| Doc | Qué cubre |
|---|---|
| [`arquitectura/vision-general.md`](./arquitectura/vision-general.md) | Stack, monorepo, estructura, convenciones, sistemas externos |
| [`arquitectura/auth-organizaciones-y-permisos.md`](./arquitectura/auth-organizaciones-y-permisos.md) | Sesión, org efectiva, holding, roles, permisos, add-ons, modo demo |
| [`arquitectura/base-de-datos.md`](./arquitectura/base-de-datos.md) | Migraciones, RLS, funciones SQL, tablas por área, tablas huérfanas |
| [`arquitectura/jobs-webhooks-y-colas.md`](./arquitectura/jobs-webhooks-y-colas.md) | Los crons, los webhooks entrantes, QStash, rate limit, Sentry |
| [`arquitectura/seguridad.md`](./arquitectura/seguridad.md) | Secretos y cifrado, auth de crons y webhooks, headers |
| [`arquitectura/diagramas.md`](./arquitectura/diagramas.md) | El sistema en 7 diagramas: contexto, contenedores, del lead al cliente, agente de IA, ingesta, multi-tenant |
| [`arquitectura/decisiones/`](./arquitectura/decisiones/README.md) | Registro de decisiones de arquitectura (ADR): por qué el sistema es como es, y cuándo escribir uno nuevo |

## Integraciones

| Doc | Qué cubre |
|---|---|
| [`integraciones/README.md`](./integraciones/README.md) | Mapa de todos los proveedores: para qué, transporte, tablas, área, estado |
| [`integraciones/apis-sin-documentacion.md`](./integraciones/apis-sin-documentacion.md) | Suposiciones sin verificar sobre APIs externas, y la regla para agregar una |
| [`external-apis/`](./external-apis/README.md) | Copia local de la documentación oficial (GoHighLevel, VTurb, Whop, Commas, Hyros, WebinarJam, Fathom) |

## Operación

| Doc | Qué cubre |
|---|---|
| [`operacion/entorno-y-deploy.md`](./operacion/entorno-y-deploy.md) | Setup local, variables de entorno verificadas, Vercel, Fly, Railway, migraciones, git |
| [`operacion/testing.md`](./operacion/testing.md) | Typecheck, lint, Vitest, Playwright, CI y cobertura por área |
| [`operacion/verificacion-manual.md`](./operacion/verificacion-manual.md) | Lo que hay que probar a mano con cuentas reales, por área |
| [`operacion/alertas.md`](./operacion/alertas.md) | Qué manda a Sentry cada proceso de fondo y qué reglas de alerta (mail) crear |
| [`operacion/discord-bot-deploy.md`](./operacion/discord-bot-deploy.md) | Runbook del bot de Discord en Railway |
| [`operacion/incidentes.md`](./operacion/incidentes.md) | Qué hacer cuando algo se rompe en producción (runbook de incidentes) |

## Diseño

| Doc | Qué cubre |
|---|---|
| [`diseno/ui-y-navegacion.md`](./diseno/ui-y-navegacion.md) | Notch nav, `packages/ui`, patrones de UI |
| [`diseno/design-system.md`](./diseno/design-system.md) | Tokens, color, tipografía, componentes |
| [`diseno/componentes-21st.md`](./diseno/componentes-21st.md) | Relevamiento de componentes de 21st.dev (sin decidir) |

## Specs vigentes

Documentos de diseño que el código cita por número de sección (`§9.1`, etc.). No se reescriben: se
actualizan en el lugar.

| Spec | Qué es |
|---|---|
| [`specs/FUNNELS_ARCHITECTURE.md`](./specs/FUNNELS_ARCHITECTURE.md) | Arquitectura del motor de embudos (regla central: `null` ≠ `0`) |
| [`specs/FUNNELS_SOURCE_MAP.md`](./specs/FUNNELS_SOURCE_MAP.md) | Qué fuente alimenta cada medida de embudo |
| [`specs/ONBOARDING_PLAN.md`](./specs/ONBOARDING_PLAN.md) | Onboarding guiado del founder |
| [`specs/TRACKERS_EXCEL_VS_LIMITLESS.md`](./specs/TRACKERS_EXCEL_VS_LIMITLESS.md) | Los trackers en Excel contra lo que tiene Limitless |

## Historial y archivo

- [`historial/`](./historial/): informes con fecha, que describen el estado de ese momento. Incluye
  [la auditoría de esta reorganización](./historial/auditoria-docs-2026-09-23.md) (qué ítems viejos se dieron por
  resueltos y con qué evidencia), la auditoría de backend y el diff de la base del 2026-09-22, y el
  [historial de cambios de julio–agosto](./historial/CHANGES-2026-07-a-08.md).
- [`archivo/`](./archivo/README.md): documentos reemplazados. **No los uses como referencia.**

## Mantener esto vivo

- Si cambiás cómo funciona un área, actualizá su doc en el mismo PR, y su fila en `FUNCIONAL.md` si cambia lo que el usuario puede hacer.
- Si cambia `PENDIENTES.md`, regenerá el CSV: `python3 docs/backlog/pendientes_a_jira.py` (falla si un P0/P1 no tiene criterio de aceptación).
- Lo abierto va a `PENDIENTES.md`; lo que no se puede probar va a `operacion/verificacion-manual.md`.
- Un doc nuevo va en la carpeta de su tipo y se agrega a este índice.
