# Documento funcional de Limitless

Qué puede hacer hoy cada usuario en cada área del producto y si realmente funciona. Es el documento de
requerimientos del que sale el backlog: cada fila es candidata a una épica o historia de usuario, y sus
pendientes ya están en [`PENDIENTES.md`](../PENDIENTES.md) y en [`backlog/jira-import.csv`](./backlog/jira-import.csv).

Armado el 2026-09-23 contrastando cada funcionalidad con el código (commit `038caca` más la auditoría de docs
del mismo día). Las filas marcadas **Funciona** se chequearon una por una: la pantalla existe y llama a la
lógica que dice. **Si una fila contradice al código, manda el código**, y la fila se corrige en el mismo cambio.

## Cómo se lee

| Estado | Significa |
|---|---|
| **Funciona** | Construida y conectada de punta a punta, sin un problema P0/P1 abierto que la rompa. Puede tener mejoras P2/P3 pendientes, citadas en su fila |
| **Con fallas** | Existe y se usa, pero hay un bug o problema de seguridad P0/P1 abierto que la afecta |
| **No funciona** | Está en pantalla pero hoy no cumple su función (por ejemplo, siempre aparece vacía) |
| **A medias** | Una parte está construida y otra no: pantalla sin lógica, lógica sin pantalla, datos de ejemplo |
| **Sin verificar** | Depende de una integración externa que nunca se probó con una cuenta real, o nunca se usó en producción |

Dos convenciones para que la columna de estado siga distinguiendo algo:

- **Permisos.** Hoy los permisos por módulo sólo esconden pantallas: cualquier miembro del equipo puede
  ejecutar las acciones de cualquier área (`[PERMISOS-SERVER-ACTIONS]`, P0). Eso afecta casi todas las
  filas; en cada área se marca **Con fallas** sólo la fila de permisos (y en Finanzas, las de plata), y en
  el resto el ítem aparece citado sin bajar el estado.
- **Columna Octubre.** Está vacía a propósito. La completa Agustín con `Sí` / `No` / `Después`: define qué
  entra en el release de la segunda semana de octubre, y con eso qué pendientes van primero en los sprints.

Cada área cierra con **Prometido y no existe** (lo que las especificaciones viejas de `docs/archivo/` y
`docs/specs/` describen y el código no tiene) y **Legacy visible** (pantallas viejas que siguen accesibles).
Los detalles técnicos de cada área están en su doc de [`areas/`](./areas/).

**Quién lo mantiene.** Quien agregue, saque o cambie una funcionalidad actualiza su fila acá en el mismo
cambio, igual que el doc técnico del área.

## Resumen por área

| Área | Funcionalidades | Funciona | Con fallas | No funciona | A medias | Sin verificar |
|---|---|---|---|---|---|---|
| [Plataforma](#plataforma) | 30 | 11 | 14 | 1 | 3 | 1 |
| [Clientes](#clientes) | 28 | 20 | 5 | 0 | 1 | 2 |
| [Ventas](#ventas) | 28 | 12 | 10 | 3 | 2 | 1 |
| [Marketing](#marketing) | 27 | 9 | 7 | 4 | 3 | 4 |
| [Embudos y Lanzamientos](#embudos-y-lanzamientos) | 24 | 11 | 3 | 1 | 3 | 6 |
| [Agente de negocio e IA](#agente-de-negocio-e-ia) | 28 | 13 | 10 | 1 | 3 | 1 |
| [Operaciones y equipo](#operaciones-y-equipo) | 23 | 14 | 5 | 1 | 2 | 1 |
| [Finanzas](#finanzas) | 12 | 6 | 4 | 0 | 2 | 0 |
| [Producto](#producto) | 15 | 13 | 0 | 0 | 2 | 0 |
| [Discord](#discord) | 13 | 0 | 2 | 0 | 1 | 10 |
| **Total** | **228** | **109** | **60** | **11** | **22** | **26** |

Lecturas rápidas:

- **Discord** está casi todo **Sin verificar**: nunca se probó contra un servidor real (`[DISCORD-SIN-PROBAR]`).
- **Plataforma, Marketing y Ventas** concentran las fallas: permisos, el tope de 1.000 turnos de Closing
  (`[CLOSING-LIST-1000]`) y pantallas que leen el inbox viejo, que está vacío.
- **Producto y Clientes** son las áreas más sanas.

## Plataforma

Lo que rodea a los módulos de negocio: entrar a la cuenta, quién ve qué (roles y permisos), la vista de holding para quien maneja varios negocios, la puesta en marcha del founder nuevo, el Panel General, Ajustes, el tablero de Integraciones y la navegación. Incluye también el panel interno de Super Admin, que usa sólo el staff de Limitless para dar de alta, seguir y dar de baja a los clientes.

Doc técnico: [`docs/areas/plataforma.md`](./areas/plataforma.md) · permisos y holding: [`docs/arquitectura/auth-organizaciones-y-permisos.md`](./arquitectura/auth-organizaciones-y-permisos.md)

| ID | Funcionalidad | Estado | Pendientes que la afectan | Evidencia | Octubre |
|---|---|---|---|---|---|
| F-PLA-01 | El usuario puede entrar con email y contraseña; tras 5 intentos fallidos ese email queda bloqueado 15 minutos | Con fallas | `LOGIN-RATE-LIMIT`, `AUTH-CALLBACK-NEXT`, `EQUIPO-DESACTIVAR-NO-BLOQUEA`, `TESTS-AUTH` | [`arquitectura/auth-organizaciones-y-permisos.md` § Cómo fluye una request](./arquitectura/auth-organizaciones-y-permisos.md#cómo-fluye-una-request) · `app/login/page.tsx` | |
| F-PLA-02 | Cualquiera puede crearse una cuenta founder (con su propia organización) desde "Crear cuenta" en el login | Con fallas | `SIGNUP-PUBLICO` | [`arquitectura/auth-organizaciones-y-permisos.md` § Alta de cuentas](./arquitectura/auth-organizaciones-y-permisos.md#alta-de-cuentas) · `components/auth/supabase-login-form.tsx` | |
| F-PLA-03 | El usuario puede recuperar una contraseña olvidada | A medias | `AUTH-RECUPERAR-PASSWORD`, `AUTH-CALLBACK-NEXT` | [`areas/plataforma.md` § Fuera de plataforma](./areas/plataforma.md#fuera-de-plataforma) · `components/auth/supabase-login-form.tsx` (el link "¿Olvidaste tu contraseña?" no hace nada; `app/auth/recover` y `app/auth/update-password` existen pero nada manda el mail) | |
| F-PLA-04 | Una cuenta creada por Limitless, por un holding o por el founder al sumar a alguien de su equipo entra con contraseña temporal, que vence a las 24 h, y está obligada a cambiarla en el primer ingreso | Funciona | — | [`arquitectura/auth-organizaciones-y-permisos.md` § Alta de cuentas](./arquitectura/auth-organizaciones-y-permisos.md#alta-de-cuentas) · `app/auth/force-password-change/page.tsx` | |
| F-PLA-05 | El founder puede sumar a una persona a su equipo con un rol: el sistema crea la cuenta con contraseña temporal y le muestra las credenciales para que se las pase (no se manda mail; el flujo `/invite?token=` es legado y nada genera invitaciones) | Funciona | `INVITE-ROL-SIN-VALIDAR`, `ROL-MEMBER-SIN-CATALOGO` | [`arquitectura/auth-organizaciones-y-permisos.md` § Alta de cuentas](./arquitectura/auth-organizaciones-y-permisos.md#alta-de-cuentas) · `app/invite/page.tsx` | |
| F-PLA-06 | El founder puede crear roles que definen, para cada uno de los 13 módulos, "sin acceso", "ver" o "completo", y asignarlos a su equipo | Con fallas | `PERMISOS-SERVER-ACTIONS`, `PERMISOS-VERIFICAR-SESION`, `ROL-MEMBER-SIN-CATALOGO` | [`arquitectura/auth-organizaciones-y-permisos.md` § Permisos por módulo](./arquitectura/auth-organizaciones-y-permisos.md#permisos-por-módulo) · `app/(platform)/team/page.tsx` | |
| F-PLA-07 | El sistema le bloquea a un miembro las pantallas de los módulos donde no tiene acceso y se los esconde del menú | Con fallas | `PERMISOS-SERVER-ACTIONS`, `PERMISOS-LAYOUT-NAV-SUAVE`, `PERMISOS-FOUNDER-AREA`, `PERMISOS-SIN-ROL-NAV`, `PERMISOS-VERIFICAR-SESION` | [`arquitectura/auth-organizaciones-y-permisos.md` § Permisos por módulo](./arquitectura/auth-organizaciones-y-permisos.md#permisos-por-módulo) · `app/(platform)/layout.tsx` | |
| F-PLA-08 | El usuario navega con la barra superior (notch nav) y con la paleta ⌘K; los menús se adaptan a los add-ons de su organización | Con fallas | `PERMISOS-LAYOUT-NAV-SUAVE`, `NAV-PALETA-PERMISOS`, `ADDONS-HOLDING`, `NAV-1` | [`arquitectura/auth-organizaciones-y-permisos.md` § Add-ons](./arquitectura/auth-organizaciones-y-permisos.md#add-ons) · `components/navigation/notch-nav/platform-notch-nav.tsx` | |
| F-PLA-09 | Un holding puede ver su portfolio de negocios con sus números en `/holding` | Con fallas | `HOLDING-PORTFOLIO-ROL` | [`arquitectura/auth-organizaciones-y-permisos.md` § Holding: qué org ve cada request](./arquitectura/auth-organizaciones-y-permisos.md#holding-qué-org-ve-cada-request) · `app/(platform)/holding/page.tsx` | |
| F-PLA-10 | Un holding puede entrar a uno de sus negocios, operarlo como si fuera el founder y volver a la vista del holding | Con fallas | `HOLDING-PORTFOLIO-ROL`, `ADDONS-HOLDING`, `AUD-SALUD-ORG-HOLDING` | [`arquitectura/auth-organizaciones-y-permisos.md` § Holding: qué org ve cada request](./arquitectura/auth-organizaciones-y-permisos.md#holding-qué-org-ve-cada-request) · `components/holding/holding-business-switcher.tsx` | |
| F-PLA-11 | Un holding puede dar de alta un negocio nuevo (con su founder y contraseña temporal) y elegir cómo le cobra; un holding nuevo completa un asistente de alta | Funciona | — | [`areas/plataforma.md` § Pantallas y rutas](./areas/plataforma.md#pantallas-y-rutas) · `app/(platform)/onboarding/holding/page.tsx`, `components/holding/add-business-modal.tsx` | |
| F-PLA-12 | Un founder nuevo no entra a la plataforma hasta completar 3 pasos: moneda y zona horaria, oferta principal y avatar; si ya los tenía cargados, se saltea | Funciona | `ONBOARDING-VERIFICAR`, `ONBOARDING-SKIP-SIN-UI` | [`areas/plataforma.md` § Onboarding del founder](./areas/plataforma.md#onboarding-del-founder) · `app/(platform)/onboarding/page.tsx` | |
| F-PLA-13 | El founder ve en el Panel una lista de configuración pendiente (fuente de datos, primer embudo, histórico, equipo) con contador en la barra, y puede ocultar ítems | Funciona | `ONBOARDING-VERIFICAR` | [`areas/plataforma.md` § Onboarding del founder](./areas/plataforma.md#onboarding-del-founder) · `components/onboarding/setup-checklist.tsx` | |
| F-PLA-14 | El sistema muestra un recorrido guiado la primera vez que alguien entra a Embudos, Contenido, Agente y Bandeja | Funciona | `ONBOARDING-VERIFICAR` | [`areas/plataforma.md` § Onboarding del founder](./areas/plataforma.md#onboarding-del-founder) · `components/onboarding/tour-runner.tsx` | |
| F-PLA-15 | El founder ve en el Panel General sus KPIs, embudo de ventas, ingresos, ventas, ranking de closers y métricas de redes | Con fallas | `CLOSING-LIST-1000`, `EMBUDO-PANEL-DMS`, `DASHBOARD-CODIGO-MUERTO` | [`areas/plataforma.md` § Panel General](./areas/plataforma.md#panel-general) · `app/(platform)/dashboard/page.tsx` | |
| F-PLA-16 | El founder puede ver en el Panel métricas propias (custom) | A medias | `DASHBOARD-CODIGO-MUERTO` | [`areas/plataforma.md` § Limitaciones conocidas y deuda](./areas/plataforma.md#limitaciones-conocidas-y-deuda) · `components/dashboard/dashboard-page-content.tsx` (se piden al servidor y no se dibujan) | |
| F-PLA-17 | El usuario puede editar su perfil y cambiar su contraseña desde Ajustes | Funciona | — | [`areas/plataforma.md` § Ajustes](./areas/plataforma.md#ajustes) · `app/(platform)/settings/page.tsx` | |
| F-PLA-18 | El equipo puede editar los datos generales de la organización (nombre, web, moneda, zona horaria) desde Ajustes | Con fallas | `PERMISOS-SERVER-ACTIONS` | [`areas/plataforma.md` § Ajustes](./areas/plataforma.md#ajustes) · `app/(platform)/settings/page.tsx` | |
| F-PLA-19 | El usuario puede elegir qué avisos recibir por mail (reporte semanal, conversación nueva, turno confirmado, venta cerrada, sugerencia de SOP) y en la app (conversación nueva, turno confirmado, venta cerrada, alerta de ghosting) | No funciona | `NOTIFICACIONES-EMAIL-SIN-ENVIO` | [`areas/plataforma.md` § Ajustes](./areas/plataforma.md#ajustes) · `components/settings/settings-form.tsx` (las preferencias se guardan, pero ningún proceso las lee ni manda esos mails) | |
| F-PLA-20 | El founder puede cargar su propia clave de Claude (se valida antes de guardarse cifrada) para que la IA de su organización corra con ella | Con fallas | `PERMISOS-SERVER-ACTIONS`, `1A1-CLAVE-ANTHROPIC-ROTA`, `BYOK-DESCIFRADO-SILENCIOSO` | [`areas/plataforma.md` § Ajustes](./areas/plataforma.md#ajustes) · `components/settings/claude-api-key-settings.tsx` | |
| F-PLA-21 | El founder ve todas las integraciones agrupadas por categoría, con su estado e incidencias, y puede conectar, configurar y desconectar cada una | Con fallas | `PERMISOS-SERVER-ACTIONS`, `INTEGRACIONES-VERIFICAR`, `INTEGRACIONES-PLAYWRIGHT` | [`areas/plataforma.md` § Integraciones (la pantalla)](./areas/plataforma.md#integraciones-la-pantalla) · `app/(platform)/integrations/page.tsx` | |
| F-PLA-22 | El founder puede importar su histórico de clientes y ventas desde Excel/CSV, GoHighLevel o ClickUp | Con fallas | `CLIENTES-IMPORT-EXCEL-MONTOS`, `CLICKUP-MONTOS` | [`areas/plataforma.md` § Pantallas y rutas](./areas/plataforma.md#pantallas-y-rutas) · `app/(platform)/integrations/import/page.tsx` (Excel y GHL), `components/integrations/clickup-import-wizard.tsx` (ClickUp, desde su tarjeta en Integraciones) | |
| F-PLA-23 | El founder puede ver el Área del fundador (`/founder`) con el último resumen de Inteligencia | Con fallas | `PERMISOS-FOUNDER-AREA`, `FOUNDER-AREA` | [`areas/plataforma.md` § Limitaciones conocidas y deuda](./areas/plataforma.md#limitaciones-conocidas-y-deuda) · `app/(founder)/founder/page.tsx` | |
| F-PLA-24 | El staff de Limitless entra al panel interno con su propio login y ve todas las organizaciones y usuarios (con último ingreso) | Funciona | — | [`areas/plataforma.md` § Super Admin](./areas/plataforma.md#super-admin) · `app/superadmin/login/page.tsx`, `app/(super-admin)/super-admin/organizations/page.tsx` | |
| F-PLA-25 | El staff puede dar de alta un founder, crear holdings y sus negocios, y en el detalle de cada organización cambiar estado, MRR, notas, add-ons y regenerar la contraseña temporal | Funciona | `ONBOARDING-SKIP-SIN-UI`, `ADDONS-HOLDING` | [`areas/plataforma.md` § Super Admin](./areas/plataforma.md#super-admin) · `app/(super-admin)/super-admin/organizations/[id]/page.tsx` | |
| F-PLA-26 | El staff puede dar de baja una organización o una persona (con vista previa del alcance, confirmación por nombre y registro de lo que falló) | Sin verificar | `BAJAS-SIN-PROBAR`, `DELETION-COMENTARIO-FK` | [`areas/plataforma.md` § Bajas (super admin)](./areas/plataforma.md#bajas-super-admin) · `components/super-admin/deletion-dialog.tsx` | |
| F-PLA-27 | El staff ve el costo de IA y el margen estimado por organización, los conteos de infraestructura y en qué paso del onboarding quedó cada cliente | Funciona | — | [`areas/plataforma.md` § Super Admin](./areas/plataforma.md#super-admin) · `app/(super-admin)/super-admin/costs/page.tsx`, `app/(super-admin)/super-admin/onboarding/page.tsx` | |
| F-PLA-28 | El staff ve un puntaje de salud (0–100) por cliente | A medias | `CLIENT-HEALTH-LEGACY` | [`areas/plataforma.md` § Super Admin](./areas/plataforma.md#super-admin) · `app/(super-admin)/super-admin/client-health/page.tsx` (una de las 4 señales lee una tabla vacía: el máximo real es 75) | |
| F-PLA-29 | El staff ve la lista de espera y las pruebas gratis confirmadas desde `/prueba` | Funciona | `WAITLIST-HUERFANO` | [`areas/plataforma.md` § Fuera de plataforma](./areas/plataforma.md#fuera-de-plataforma) · `app/(super-admin)/super-admin/trials/page.tsx` | |
| F-PLA-30 | El staff mantiene un "cerebro de IA general" (documentos que el agente de todas las organizaciones usa como contexto), con carga desde archivo o Google Drive y resúmenes por lote | Con fallas | `IA-CLAVE-DE-CLIENTE-EN-SUPERADMIN`, `AUD-SEG-9` | [`areas/plataforma.md` § Super Admin](./areas/plataforma.md#super-admin) · `app/(super-admin)/super-admin/ai-brain/page.tsx` | |

### Prometido y no existe

- **Panel "entendé tu negocio en 30 segundos"** con resumen ejecutivo, riesgos, oportunidades, cambios de la semana, métricas operativas y recomendaciones de IA (`docs/archivo/UI_UX_SPEC.md` pantalla 1, `docs/archivo/ESTADO_PLATAFORMA.md` § Panel General): **existe distinto**. Los componentes están escritos pero ninguno se muestra; el Panel es KPIs, embudo, ingresos, ventas y closers.
- **Integraciones con Loom, Notion, Airtable, Google Docs y Google Sheets** (`docs/archivo/PROJECT_CONSTITUTION.md` módulo Integrations, `docs/archivo/UI_UX_SPEC.md` pantalla 10): **no existen**. El tablero tiene Zernio, ManyChat, Calendly, GHL, Fathom, Typeform, YouTube, VTurb, WebinarJam, Hyros, Whop, Commas, Discord, ClickUp y Google Forms.
- **Roles fijos Founder / Admin / Project Manager / Setter / Operator / Viewer** (`docs/archivo/PROJECT_CONSTITUTION.md` módulo 6): **existe distinto**. Hay roles armados por el founder con niveles por módulo; todo invitado queda como "member". Los nombres viejos sólo sobreviven en el catálogo del código.
- **"El super admin crea las cuentas a mano; el founder pide usuarios"** (`docs/archivo/PROJECT_CONSTITUTION.md` § Account creation): **existe distinto**. Hay alta pública desde el login (`SIGNUP-PUBLICO`) y el founder crea las cuentas de su equipo (con contraseña temporal) sin pasar por Limitless.
- **El super admin marca `skip_onboarding` para una org trabada** (`docs/specs/ONBOARDING_PLAN.md` § Decisiones cerradas, punto 1): **no existe**. No hay botón; hoy se hace por SQL (`ONBOARDING-SKIP-SIN-UI`).
- **Costos por organización: Claude, embeddings, storage, infraestructura, rentabilidad y márgenes** (`docs/archivo/UI_UX_SPEC.md` pantalla 14): **existe distinto**. Se mide sólo el costo de Claude; el margen es MRR cargado a mano menos ese costo, y la infraestructura se estima como 15% del costo de tokens. Embeddings y storage no se miden.
- **Alertas de Discord en la salud de clientes del super admin** (`docs/archivo/ESTADO_PLATAFORMA.md` § Phase 2, `docs/archivo/PHASE_2.md`): **no existe**. El puntaje de salud no mira Discord.
- **Layout con sidebar a la izquierda y panel de contexto a la derecha** (`docs/archivo/UI_UX_SPEC.md` § Global layout): **existe distinto**. La navegación es una barra superior (notch nav); el sidebar de plataforma se eliminó.
- **Avisos por mail configurables** (`docs/archivo/UI_UX_SPEC.md` pantalla 12, "Notifications"): la pantalla existe, **los mails no**. El doc técnico menciona "mails de bienvenida" por Resend, pero la función de bienvenida no se llama desde ningún lado.

### Legacy visible

- Link "¿Olvidaste tu contraseña?" en `/login` y en `/superadmin/login` que no hace nada.
- Pestaña Notificaciones de Ajustes: nueve interruptores (cinco de mail, cuatro en la app) que se guardan y no disparan nada.
- `/redesign-preview`: pantalla interna de diseño, sin datos, accesible para cualquier usuario logueado y libre de permisos.
- `/demo` y `/design-system` (tour estático y catálogo de componentes) siguen públicos.
- `/api/waitlist` sigue público sin ningún formulario que lo use desde que se borró la landing (`WAITLIST-HUERFANO`); `/super-admin/waitlist` lista lo que entra por ahí.
- Tarjeta de ManyChat en Integraciones y señal "conversaciones" en la salud de clientes: alimentan / leen el inbox viejo, que quedó vacío desde que la bandeja pasó a Zernio (`CLIENT-HEALTH-LEGACY`).
- Pestaña "Mi Calendly" en Ajustes que aparece sólo si el nombre del rol contiene "closer" (`SETTINGS-CLOSER-POR-NOMBRE`).
- `/team/members` y `/team/roles` redirigen a `/team`; `/superadmin/dashboard` redirige a `/super-admin/organizations` (restos de la fase de maqueta).

---

## Clientes

El módulo de entrega: dónde está parado cada cliente después de la venta, qué le falta, cómo viene y qué logró.
Lo usan el founder y el equipo de fulfillment (coaches, CSM). Incluye el recorrido por fases con hitos, el registro
de wins para marketing, la revisión semanal y, para las organizaciones con el add-on «growth partners», los clientes
de cada cliente, su facturación y un formulario de onboarding por link. Plan, cuotas y pagos no viven acá: están en Ventas → Cobros.

Doc técnico: [`docs/areas/clientes.md`](./areas/clientes.md) · [`docs/areas/clientes-recorrido-y-wins.md`](./areas/clientes-recorrido-y-wins.md) · [`docs/areas/clientes-growth-partners.md`](./areas/clientes-growth-partners.md)

| ID | Funcionalidad | Estado | Pendientes que la afectan | Evidencia | Octubre |
|---|---|---|---|---|---|
| F-CLI-01 | El sistema crea el cliente solo cuando el equipo marca una llamada como cerrada en Closing, con su atribución de origen (UTM, lead magnet) | Funciona | `CLIENTES-SIN-MAIL` | [`areas/clientes.md` § Cómo fluye el dato](./areas/clientes.md#cómo-fluye-el-dato) · `providers/platform-data-provider.tsx` → `app/clients/actions.ts` | |
| F-CLI-02 | El founder o el equipo pueden dar de alta un cliente a mano y borrarlo desde la lista | Funciona | `ALTA-CLIENTES-PROBAR` | [`areas/clientes.md` § Pantallas y rutas](./areas/clientes.md#pantallas-y-rutas) · `app/(platform)/clients/page.tsx` → `components/clients/new-client-dialog.tsx` | |
| F-CLI-03 | El equipo (con Clientes en «full») puede cargar clientes en bloque desde un CSV o un Excel («Cargar clientes»; si una fila falla no se carga ninguna) | Con fallas | `CLIENTES-SIN-MAIL`, `T-3` | [`areas/clientes.md` § Cómo fluye el dato](./areas/clientes.md#cómo-fluye-el-dato) · `components/clients/import-clients-dialog.tsx` | |
| F-CLI-04 | Quien tiene acceso a Integraciones puede importar clientes desde un Excel (en Integraciones → Importar), sin duplicar por nombre | Con fallas | `CLIENTES-IMPORT-EXCEL-MONTOS`, `CLIENTES-SIN-MAIL`, `T-3`, `CLIENTES-TECHO-1000` | [`areas/clientes.md` § Limitaciones conocidas y deuda](./areas/clientes.md#limitaciones-conocidas-y-deuda) · `app/(platform)/integrations/import/page.tsx` → `app/clients/import-actions.ts` | |
| F-CLI-05 | El equipo ve la tabla de entrega: fase del recorrido, próxima tarea (tildable), satisfacción, última 1-1, columnas configurables, búsqueda y filtros | Con fallas | `CLIENTES-ETAPA-TABLA-VS-FICHA`, `CLIENTES-TECHO-1000`, `FICHA-CUSTOM-EN-LA-LISTA`, `AVISO-Y-SATISFACCION-SIN-PROBAR` | [`areas/clientes.md` § Pantallas y rutas](./areas/clientes.md#pantallas-y-rutas) · `components/clients/clients-list.tsx` → `app/clients/clients-board-actions.ts` | |
| F-CLI-06 | El equipo abre la ficha del cliente: encabezado con estado, franja de indicadores (1-1, tareas, recorrido, satisfacción), contexto del cierre, llamadas de venta vinculadas y atajo a Cobros | Funciona | `FICHA-LENTA`, `CLIENTES-TECHO-1000`, `AVISO-Y-SATISFACCION-SIN-PROBAR` | [`areas/clientes.md` § Pantallas y rutas](./areas/clientes.md#pantallas-y-rutas) · `app/(platform)/clients/[id]/page.tsx` → `components/clients/client-detail.tsx` | |
| F-CLI-07 | El equipo sube una sesión 1-1 pegando el link de la grabación de Fathom, y la IA extrae las tareas acordadas (con botón para reintentar) | Funciona | `1A1-MANUALES-SIN-PROBAR`, `1A1-CLAVE-ANTHROPIC-ROTA` | [`areas/clientes.md` § Cómo fluye el dato](./areas/clientes.md#cómo-fluye-el-dato) · `components/clients/upload-one-on-one-dialog.tsx` → `app/fathom/manual-upload-actions.ts` | |
| F-CLI-08 | El equipo gestiona las tareas del cliente: crear, tildar, borrar y mandar al Tablero de trabajo sin duplicar | Funciona | — | [`areas/clientes.md` § Cómo fluye el dato](./areas/clientes.md#cómo-fluye-el-dato) · `components/clients/client-tasks-section.tsx` → `app/clients/task-actions.ts` | |
| F-CLI-09 | El equipo edita el detalle de una tarea ya creada | A medias | `1A1-EDITAR-DETALLE` | [`areas/clientes.md` § Limitaciones conocidas y deuda](./areas/clientes.md#limitaciones-conocidas-y-deuda) · `app/clients/task-actions.ts` (sin pantalla) | |
| F-CLI-10 | El equipo lleva notas del cliente y marca su satisfacción (siempre con fecha y autor) | Funciona | `AVISO-Y-SATISFACCION-SIN-PROBAR` | [`areas/clientes.md` § Modelo de datos](./areas/clientes.md#modelo-de-datos) · `components/clients/client-notes-section.tsx`, `client-satisfaction-section.tsx` → `app/clients/tracking-actions.ts` | |
| F-CLI-11 | El equipo ve en la ficha el historial del cliente (llamadas procesadas, onboarding) y su actividad en Discord | Funciona | — | [`areas/clientes.md` § Integraciones externas](./areas/clientes.md#integraciones-externas) · `components/clients/client-timeline.tsx`, `client-discord-activity.tsx` | |
| F-CLI-12 | El equipo asigna a mano las grabaciones de Fathom que el sistema no pudo atribuir a un cliente, y siembra las identidades desde el CRM | Con fallas | `CLIENTES-PENDING-CALLS-HUERFANA`, `B-SEMBRAR-IDENTIDADES` | [`areas/clientes.md` § Pantallas y rutas](./areas/clientes.md#pantallas-y-rutas) · `app/(platform)/clients/pending-calls/page.tsx` → `app/fathom/actions.ts` | |
| F-CLI-13 | El founder configura campos propios para clientes, wins e hitos (listas, texto, número, monto, fecha con aviso), elige cuáles se ven en la tabla y archiva sin perder datos | Funciona | `AVISO-Y-SATISFACCION-SIN-PROBAR`, `C0-JOURNEY-STAGES-UI` | [`areas/clientes-recorrido-y-wins.md` § Pantallas y rutas](./areas/clientes-recorrido-y-wins.md#pantallas-y-rutas) · `app/(platform)/clients/campos/page.tsx` → `app/clients/custom-field-actions.ts` | |
| F-CLI-14 | El equipo completa en la ficha los campos configurables del cliente, con validación (un monto ilegible se rechaza, no se guarda como cero) | Funciona | — | [`areas/clientes-recorrido-y-wins.md` § Reglas de negocio y decisiones no obvias](./areas/clientes-recorrido-y-wins.md#reglas-de-negocio-y-decisiones-no-obvias) · `components/clients/client-custom-fields-section.tsx` → `app/clients/client-custom-fields-actions.ts` | |
| F-CLI-15 | El founder arma el recorrido del cliente: fases y hitos con plazo, estado que fija y métricas a pedir (o carga uno de ejemplo) | Funciona | `AVISO-Y-SATISFACCION-SIN-PROBAR` | [`areas/clientes-recorrido-y-wins.md` § Pantallas y rutas](./areas/clientes-recorrido-y-wins.md#pantallas-y-rutas) · `app/(platform)/clients/checkpoints/page.tsx` → `app/clients/checkpoint-actions.ts` | |
| F-CLI-16 | El equipo registra y deshace hitos del recorrido en la ficha, y puede fijar la fase a mano | Funciona | `CUSTOM-ERRORES-PRIMERO`, `FASE-REFRESCO-CARO`, `AVISO-Y-SATISFACCION-SIN-PROBAR` | [`areas/clientes-recorrido-y-wins.md` § Cómo fluye el dato](./areas/clientes-recorrido-y-wins.md#cómo-fluye-el-dato) · `components/clients/checkpoints/client-journey-section.tsx` → `app/clients/checkpoint-event-actions.ts`, `stage-actions.ts` | |
| F-CLI-17 | El sistema marca como «trabado» al cliente que se pasó del plazo de su próximo hito (sólo si el hito anterior está registrado: el que nunca arrancó o tiene fase fijada a mano nunca figura trabado) | Funciona | `FASE-MANUAL-SIN-PLAZOS` | [`areas/clientes-recorrido-y-wins.md` § Reglas de negocio y decisiones no obvias](./areas/clientes-recorrido-y-wins.md#reglas-de-negocio-y-decisiones-no-obvias) · `lib/checkpoints/stalled.ts` | |
| F-CLI-18 | El sistema propone hitos alcanzados a partir de mensajes de Discord y llamadas de entrega (todos los días), y el equipo los acepta o descarta desde la ficha | Funciona | `PROPUESTAS-CALIDAD-SIN-VER`, `C3-ORIGEN-PROPUESTA`, `PROPUESTAS-FATHOM-SIN-RESUMEN`, `B-SEMBRAR-IDENTIDADES` | [`areas/clientes-recorrido-y-wins.md` § Cómo fluye el dato](./areas/clientes-recorrido-y-wins.md#cómo-fluye-el-dato) · `app/api/cron/daily-signals/route.ts` → `app/clients/checkpoint-derived-actions.ts` | |
| F-CLI-19 | El equipo registra wins de clientes con medida comparable, permiso de publicación, usos en marketing, capturas y filtro «Falta captura» | Funciona | `TRACKERS-PERMISOS-VACIOS`, `A-PROBAR-CAPTURAS`, `CUSTOM-ERRORES-PRIMERO`, `WINS-BORRADORES-HUERFANOS`, `AVISO-Y-SATISFACCION-SIN-PROBAR` | [`areas/clientes-recorrido-y-wins.md` § Modelo de datos](./areas/clientes-recorrido-y-wins.md#modelo-de-datos) · `app/(platform)/clients/wins/page.tsx` → `app/clients/win-actions.ts` | |
| F-CLI-20 | El equipo ve el caso de cada cliente «punto inicial → punto final» y carga su punto de partida, meta y fecha de egreso (a mano) | Funciona | `OBJETIVO-DOS-LUGARES`, `TRACKERS-EGRESO-MANUAL` | [`areas/clientes-recorrido-y-wins.md` § Reglas de negocio y decisiones no obvias](./areas/clientes-recorrido-y-wins.md#reglas-de-negocio-y-decisiones-no-obvias) · `components/clients/wins/wins-dashboard.tsx` → `app/clients/win-actions.ts`, `tracking-actions.ts` | |
| F-CLI-21 | El equipo convierte testimonios detectados en Discord en wins (solapa Candidatos); desde llamadas de Fathom todavía no | Funciona | `A-ENGANCHES-W3` | [`areas/clientes-recorrido-y-wins.md` § Integraciones externas](./areas/clientes-recorrido-y-wins.md#integraciones-externas) · `components/clients/wins/win-candidates.tsx` → `app/discord/actions.ts` | |
| F-CLI-22 | El equipo hace la revisión semanal: trabados, por tener un resultado, cerca del egreso y en riesgo, con una anotación por cliente | Funciona | `CLIENTES-SEÑALES-DOS-SILENCIOS`, `TRACKERS-RIESGO-PAGOS` | [`areas/clientes-recorrido-y-wins.md` § Reglas de negocio y decisiones no obvias](./areas/clientes-recorrido-y-wins.md#reglas-de-negocio-y-decisiones-no-obvias) · `app/(platform)/clients/revision/page.tsx` → `app/clients/tracking-actions.ts` | |
| F-CLI-23 | Cada miembro ve y hace en Clientes sólo lo que su permiso de módulo permite (completo / sólo lectura / sin acceso) | Con fallas | `PERMISOS-SERVER-ACTIONS/clientes`, `PERMISOS-SERVER-ACTIONS`, `ALTA-CLIENTES-PROBAR` | [`areas/clientes.md` § Reglas de negocio y decisiones no obvias](./areas/clientes.md#reglas-de-negocio-y-decisiones-no-obvias) · `app/(platform)/layout.tsx`, `app/clients/*.ts` | |
| F-CLI-24 | (Add-on growth partners) El equipo carga los creadores de cada growth partner con sus datos de Marketing, Ventas y Sistemas, usa la plantilla de 22 campos y pasa los datos viejos al creador que corresponde | Funciona | `CLIENTES-DE-CLIENTES-PROBAR` | [`areas/clientes-growth-partners.md` § Pantallas y rutas](./areas/clientes-growth-partners.md#pantallas-y-rutas) · `components/clients/client-sub-clients-card.tsx` → `app/clients/sub-client-actions.ts` | |
| F-CLI-25 | (Add-on) El equipo registra cuánto factura por mes el negocio del cliente y ve último mes, variación, mejor mes y tendencia | Funciona | `FACTURACION-MONEDAS` | [`areas/clientes-growth-partners.md` § Reglas de negocio y decisiones no obvias](./areas/clientes-growth-partners.md#reglas-de-negocio-y-decisiones-no-obvias) · `components/clients/client-revenue-card.tsx` → `app/clients/revenue-actions.ts` | |
| F-CLI-26 | (Add-on) El equipo genera un link de onboarding por creador; el creador completa el formulario público por pasos, sin cuenta, y sus respuestas llenan la ficha con historial de envíos | Sin verificar | `ONBOARDING-CLIENTES-PROBAR`, `ONBOARDING-CLIENTES-RESTO` | [`areas/clientes-growth-partners.md` § Cómo fluye el dato](./areas/clientes-growth-partners.md#cómo-fluye-el-dato) · `app/onboarding-cliente/[token]/page.tsx` → `app/onboarding-cliente/actions.ts`, `components/clients/sub-client-onboarding.tsx` | |
| F-CLI-27 | (Add-on) El equipo comparte un link general de onboarding y asigna o descarta desde la bandeja «sin asignar» lo que llega (creando el cliente si hace falta) | Sin verificar | `ONBOARDING-CLIENTES-PROBAR` | [`areas/clientes-growth-partners.md` § Cómo fluye el dato](./areas/clientes-growth-partners.md#cómo-fluye-el-dato) · `components/clients/client-onboarding-inbox.tsx` → `app/clients/onboarding-link-actions.ts` | |
| F-CLI-28 | (Add-on) El sistema marca en la lista a los clientes «Sin novedades» hace N días (umbral configurable) y avisa fechas próximas de los creadores (ej. próximo lanzamiento) | Funciona | `CLIENTES-SEÑALES-DOS-SILENCIOS` | [`areas/clientes-growth-partners.md` § Modelo de datos](./areas/clientes-growth-partners.md#modelo-de-datos) · `components/clients/clients-list.tsx` → `app/clients/signals-actions.ts` | |

### Prometido y no existe

- **Ficha con pagos y cuotas** (`docs/archivo/ESTADO_PLATAFORMA.md` § 6 «Clientes»: «Perfil: pagos, cuotas, Fathom, insights IA»): existe distinto. Plan, cuotas, pagos y adeudado se mudaron a Ventas → Cobros; la ficha sólo tiene un atajo a Cobros para quien tiene acceso a Ventas.
- **Vista `/clients/testimonials` con export para marketing** (`docs/archivo/PHASE_2.md` y `ESTADO_PLATAFORMA.md`): existe distinto. Los testimonios de Discord aparecen como «Candidatos» dentro de `/clients/wins` y se convierten en wins; no hay pantalla propia ni exportación.
- **Testimonios detectados «automáticamente»** (`docs/archivo/PHASE_2.md`): existe distinto. La IA propone candidatos, pero nada se registra solo: una persona tiene que aceptar cada win y cada hito.
- **Ficha de caso con creencias, restricciones y proceso** (`docs/specs/TRACKERS_EXCEL_VS_LIMITLESS.md`, recomendación 6): no existe. El logro sigue siendo un único texto.
- **Checklist de contenido por caso** (historia, carrusel, reel, entrevista…) (misma spec, recomendación 7): no existe. Los usos del win son filas libres que registran lo hecho, no señalan lo que falta.
- **Caso de éxito como entidad curada, separada del log de wins** (misma spec, recomendación 10): no existe; todo es un win.
- **Revisión mensual de patrones** (misma spec, recomendación 9): no existe. Sólo está la revisión semanal.
- **Responsable (coach) asignado a cada cliente** (misma spec, § 1.6): no existe; no hay forma de asignar un cliente a una persona.
- **Dos formas de negocio (1 a 1 y simplificado)** y **puntos A/B como rango publicable** (misma spec, § 1.7 y § 2.7): no existen. Limitless asume una sola forma y exige un número.
- **Fecha de egreso calculada desde la duración del plan** (misma spec, § 1.3): existe distinto. La fecha se carga a mano.

### Legacy visible

- «Llamadas sin asociar» (`/clients/pending-calls`) sólo se alcanza escribiendo la URL o desde el contador del menú mobile; el tooltip de «Última 1-1» la nombra sin link.
- Hay dos importadores de clientes con reglas distintas: «Cargar clientes» (CSV, en la lista; no lee mail) e «Importar» (Excel, en Integraciones; lee el mail y no lo guarda, inventa montos y fechas).
- Conviven un «estado» fijo del cliente (pendiente de onboarding, onboarding hecho, activo, caso de éxito) y la fase configurable del recorrido; deshacer un hito no revierte el estado. Para quien usa la pantalla, son dos maneras de decir dónde está el cliente.
- El «apodo» del cliente se sigue mostrando debajo del nombre en la tabla, pero ya no se puede editar desde la ficha.
- Dos «Objetivo» con el mismo nombre: el campo configurable de la ficha y la meta medible del dashboard de wins.
- Una organización sin el add-on que tenía cargados valores en la vieja tarjeta «Información del cliente» ya no los ve en la ficha (los datos siguen en la base).

---

## Ventas

El tramo comercial del negocio: los DMs con leads, los turnos de la llamada de cierre y su seguimiento, las grabaciones de esas llamadas con análisis IA, las métricas del proceso y lo que cada cliente debe. Lo usan el founder, los setters y los closers que tengan permiso sobre el módulo Ventas.

Doc técnico: [`docs/areas/ventas.md`](./areas/ventas.md)

| ID | Funcionalidad | Estado | Pendientes que la afectan | Evidencia | Octubre |
|---|---|---|---|---|---|
| F-VEN-01 | El equipo puede ver en una sola bandeja, en vivo, los DMs de Instagram, WhatsApp y demás cuentas conectadas a Zernio, con los mensajes que se refrescan solos cada 30 segundos | Funciona | `API-TIMEOUTS` | [`areas/ventas.md` § Bandeja (Zernio)](./areas/ventas.md#bandeja-zernio) · `app/(platform)/sales/inbox/page.tsx` | |
| F-VEN-02 | El equipo puede responder un DM desde la bandeja sin salir de Limitless | Funciona | `API-TIMEOUTS` | [`areas/ventas.md` § Bandeja (Zernio)](./areas/ventas.md#bandeja-zernio) · `components/sales/zernio-inbox-panel.tsx` | |
| F-VEN-03 | El equipo puede pedir con un botón un análisis IA de la conversación (etiqueta, calificación, riesgo de ghosting, si se mandó la agenda, próximo mensaje sugerido), que queda guardado | Funciona | `ZERNIO-ANALISIS-UNTRUSTED`, `ZERNIO-EMOJIS-JSX` | [`areas/ventas.md` § Bandeja (Zernio)](./areas/ventas.md#bandeja-zernio) · `components/sales/zernio-side-panel.tsx` | |
| F-VEN-04 | El equipo puede ver el recorrido del lead (de qué contenido o link vino, si agendó, si compró) al lado del chat | A medias | `LEGACY-INBOX-BORRAR`, `T-9` | [`areas/ventas.md` § Legacy: qué se puede borrar](./areas/ventas.md#legacy-qué-se-puede-borrar) · `components/sales/lead-journey-inline.tsx` | |
| F-VEN-05 | El sistema importa los turnos del Calendly del negocio (al instante por webhook y cada hora) y cada turno queda colgado de su lead por mail | Con fallas | `CALENDLY-CRONS-SUPERPUESTOS`, `CALENDLY-WEBHOOK-REPLAY`, `TOKENS-TEXTO-PLANO` | [`areas/ventas.md` § Turnos → leads → seguimiento](./areas/ventas.md#turnos--leads--seguimiento) · `lib/calendly/sync-events.ts` | |
| F-VEN-06 | El sistema importa cada hora los turnos de los calendarios de GoHighLevel elegidos, y el founder puede filtrar Closing por calendario | Funciona | — | [`areas/ventas.md` § Turnos → leads → seguimiento](./areas/ventas.md#turnos--leads--seguimiento) · `app/(platform)/sales/closing/page.tsx` | |
| F-VEN-07 | Cada closer puede conectar su propio Calendly en Ajustes y sus turnos entran atribuidos a él | Con fallas | `CALENDLY-CLOSER-SIN-LEAD`, `CALENDLY-CRONS-SUPERPUESTOS`, `LLAMADAS-CANCELED-BY` | [`areas/ventas.md` § Turnos → leads → seguimiento](./areas/ventas.md#turnos--leads--seguimiento) · `components/settings/closer-calendly-settings.tsx` | |
| F-VEN-08 | El founder y los closers pueden ver los turnos en calendario y en lista, filtrar por estado y abrir un turno con su detalle | Con fallas | `CLOSING-LIST-1000`, `CLOSING-HOLDING-MEZCLA`, `LEGACY-INBOX-BORRAR` | [`areas/ventas.md` § Pantallas y rutas](./areas/ventas.md#pantallas-y-rutas) · `components/closing/closing-overview.tsx` | |
| F-VEN-09 | El closer puede cargar que un turno no cerró o fue no-show, con motivo, notas y próximo paso, y los syncs no pisan lo que cargó a mano | Funciona | `CALENDLY-TESTS` | [`areas/ventas.md` § Reglas de negocio y decisiones no obvias](./areas/ventas.md#reglas-de-negocio-y-decisiones-no-obvias) · `components/closing/call-outcome-modal.tsx` | |
| F-VEN-10 | El closer puede marcar una venta como cerrada: se crea el cliente, se vincula al lead y se registra el primer pago con comprobante | Con fallas | `CLOSING-CIERRE-ATOMICO` | [`areas/ventas.md` § Resultado de un turno (cliente)](./areas/ventas.md#resultado-de-un-turno-cliente) · `components/closing/payment-modal.tsx` | |
| F-VEN-11 | El equipo puede seguir a cada lead en una tabla (estado calculado a partir de sus turnos, próximo paso, fecha, responsable, notas, búsqueda y filtro de pendientes) y ver su hilo completo de turnos | Funciona | `SEGUIMIENTO-ESCALA`, `VENTAS-E2E` | [`areas/ventas.md` § Turnos → leads → seguimiento](./areas/ventas.md#turnos--leads--seguimiento) · `app/sales/lead-actions.ts` | |
| F-VEN-12 | El founder puede crear sus propios valores de próximo paso y de calificación (con color y comportamiento: pide fecha / cierra el hilo), editarlos y archivarlos | Funciona | — | [`areas/ventas.md` § Reglas de negocio y decisiones no obvias](./areas/ventas.md#reglas-de-negocio-y-decisiones-no-obvias) · `app/sales/follow-up-options-actions.ts` | |
| F-VEN-13 | El closer puede calificar al lead antes y después de la llamada | A medias | `LLAMADAS-FASE-2-PULIR` | [`areas/ventas.md` § Turnos → leads → seguimiento](./areas/ventas.md#turnos--leads--seguimiento) · `components/closing/lead-detail-drawer.tsx` | |
| F-VEN-14 | El founder puede ver el ranking de closers (cierres, facturación, comisión) en la pestaña Equipo de Closing | No funciona | `CLOSER-AMOUNT-CLOSED` | [`areas/ventas.md` § Limitaciones conocidas y deuda](./areas/ventas.md#limitaciones-conocidas-y-deuda) · `components/closing/closers-ranking.tsx` | |
| F-VEN-15 | El founder puede ver las métricas de cierre por rango de fechas (tasa de cierre, tasa de asistencia, cierres, no-shows, facturación) y, si no hay datos, las importadas de Excel | Funciona | `METRICAS-SHOW-RATE`, `METRICAS-SNAPSHOT-FALLBACK`, `METRICAS-SENA` | [`areas/ventas.md` § Métricas](./areas/ventas.md#métricas) · `app/(platform)/sales/metrics/page.tsx` | |
| F-VEN-16 | El founder puede ver las métricas de DMs (leads, tasa de agendamiento, tasa de fantasma, tiempo de respuesta, estado de conversaciones) | No funciona | `EMBUDO-PANEL-DMS`, `LEGACY-INBOX-BORRAR` | [`areas/ventas.md` § Métricas](./areas/ventas.md#métricas) · `components/sales/sales-metrics-redesign.tsx` | |
| F-VEN-17 | El founder puede ver facturación y comisión estimada por closer en Métricas | Con fallas | `CLOSING-LIST-1000` | [`areas/ventas.md` § Métricas](./areas/ventas.md#métricas) · `components/sales/closer-performance-panel.tsx` | |
| F-VEN-18 | El founder puede ver el ranking del equipo por puntaje de llamadas y las objeciones más frecuentes | Con fallas | `FATHOM-DEEP-ANALISIS-ALCANCE`, `RANKING-TREND-FIJO` | [`areas/ventas.md` § Métricas](./areas/ventas.md#métricas) · `components/sales/sales-team-performance-section.tsx` | |
| F-VEN-19 | El founder puede ver las llamadas de venta grabadas con Fathom y su análisis IA | Con fallas | `FATHOM-DEEP-ANALISIS-ALCANCE` | [`areas/ventas.md` § Fathom → Llamadas](./areas/ventas.md#fathom--llamadas) · `app/(platform)/sales/llamadas/page.tsx` | |
| F-VEN-20 | El sistema trae cada hora las grabaciones de Fathom de la cuenta del negocio (desde la conexión en adelante) y las procesa | Funciona | `TOKENS-TEXTO-PLANO`, `API-TIMEOUTS` | [`areas/ventas.md` § Fathom → Llamadas](./areas/ventas.md#fathom--llamadas) · `app/api/integrations/fathom/process/route.ts` | |
| F-VEN-21 | Cada miembro del equipo puede conectar su propia cuenta de Fathom y sus grabaciones llegan solas; las no vinculadas quedan privadas de quien grabó | No funciona | `FATHOM-WEBHOOK-MIEMBRO-ROTO`, `B-FATHOM-NUNCA-PROBADO`, `FATHOM-PRIVACIDAD-LEAD` | [`areas/ventas.md` § Fathom → Llamadas](./areas/ventas.md#fathom--llamadas) · `components/integrations/fathom-member-accounts.tsx` | |
| F-VEN-22 | El sistema cruza cada grabación con el turno de la agenda y la clasifica como venta, entrega o equipo | Sin verificar | `LLAMADAS-VERIFICAR-FATHOM`, `B-SEMBRAR-IDENTIDADES`, `FATHOM-CRUCE-AGENDA-DESCONECTADO` | [`areas/ventas.md` § Fathom → Llamadas](./areas/ventas.md#fathom--llamadas) · `lib/fathom/match-appointment.ts` | |
| F-VEN-23 | El sistema genera un análisis profundo de cada llamada de venta (puntaje por sección, objeciones, si vendió) atribuido a su closer | Con fallas | `FATHOM-DEEP-ANALISIS-ALCANCE` | [`areas/ventas.md` § Limitaciones conocidas y deuda](./areas/ventas.md#limitaciones-conocidas-y-deuda) · `lib/fathom/process-call.ts` | |
| F-VEN-24 | El founder puede vincular a mano una grabación de venta que no cruzó ningún turno (Integraciones → Fathom) | Funciona | — | [`areas/ventas.md` § Pantallas y rutas](./areas/ventas.md#pantallas-y-rutas) · `components/integrations/unlinked-recordings-panel.tsx` | |
| F-VEN-25 | El founder puede asociar a un cliente las grabaciones pendientes y cargar las identidades de sus clientes desde el CRM | Con fallas | `FATHOM-CLIENTID-SIN-VALIDAR`, `B-SEMBRAR-IDENTIDADES` | [`areas/ventas.md` § Pantallas y rutas](./areas/ventas.md#pantallas-y-rutas) · `components/clients/pending-fathom-calls.tsx` | |
| F-VEN-26 | El founder puede ver en Cobros, por cliente, su plan, días restantes, tipo de pago, lo adeudado y el monto, y filtrar los que tienen saldo | Funciona | `COBROS-PROBAR` | [`areas/ventas.md` § Cobros](./areas/ventas.md#cobros) · `app/(platform)/sales/cobros/page.tsx` | |
| F-VEN-27 | El founder puede registrar una cuota pagada (con o sin comprobante) y ver el historial de pagos de cada cliente | Funciona | `COBROS-PROBAR`, `VENTAS-E2E` | [`areas/ventas.md` § Cobros](./areas/ventas.md#cobros) · `components/sales/client-payments-section.tsx` | |
| F-VEN-28 | El founder puede limitar por rol quién ve Ventas y los montos de cobros en Clientes | Con fallas | `PERMISOS-SERVER-ACTIONS/ventas`, `COBROS-AVISAR-PERMISOS` | [`areas/ventas.md` § Reglas de negocio y decisiones no obvias](./areas/ventas.md#reglas-de-negocio-y-decisiones-no-obvias) · `app/(platform)/layout.tsx` | |

### Prometido y no existe

- **Métricas de setters y comparación entre setters** (`docs/archivo/UI_UX_SPEC.md` § Sales Metrics, `docs/archivo/PROJECT_CONSTITUTION.md` § Sales Metrics): no existe. Sólo hay rendimiento por closer.
- **Métricas de DMs: tasa de agendamiento, tasa de fantasma, tiempo de respuesta, mensajes por agenda, conversaciones sin responder** (mismas specs): existe distinto. Las tarjetas están en la pantalla pero leen la tabla del inbox viejo, que está vacía: siempre dan 0. "Demora de seguimiento" y "tiempo hasta agendar" no existen.
- **Detección automática de agendas a partir del chat** (link de calendario + frases como "listo, agendado"; `PROJECT_CONSTITUTION.md` § Booking Detection): existe distinto. El análisis IA marca si se mandó la agenda y si el lead agendó, pero sólo cuando alguien aprieta el botón en la conversación, y ese dato no alimenta ninguna métrica.
- **Panel de análisis de la bandeja con señales automáticas de tiempo de respuesta, ghosting y agenda** (`UI_UX_SPEC.md` § Sales Inbox): existe distinto. Es un análisis manual por conversación; no hay tiempo de respuesta.
- **Arquitectura Instagram → ManyChat → inbox, de sólo lectura, sin enviar mensajes ni puntuar leads** (`PROJECT_CONSTITUTION.md` § Sales Architecture / MVP Restrictions): existe distinto. La bandeja es Zernio en vivo, permite responder y califica leads con IA; ManyChat quedó como legacy.
- **Cerrar un deal en Closing etiqueta la conversación como «closeado» en el inbox** (`docs/archivo/ESTADO_PLATAFORMA.md` § Ventas): existe distinto. El código lo intenta, pero sobre el inbox viejo vacío; en la bandeja de Zernio no se ve nada.
- **Comisiones del equipo atribuidas por closer en cada deal** (`ESTADO_PLATAFORMA.md` § Mejoras post-Phase 1): existe distinto. Métricas muestra una comisión *estimada* con un porcentaje fijo; no hay pantalla para fijar la comisión de cada closer (la función existe pero nadie la llama).
- **Avisos por email/push de cuotas vencidas y deals sin seguimiento** (`ESTADO_PLATAFORMA.md` § Mejoras post-Phase 1): no existe.
- **Vista previa de la grabación de Fathom dentro del turno** (en el drawer de Closing): existe un recuadro gris que dice "Vista previa" sin contenido; no muestra la grabación ni su análisis.

### Legacy visible

- **ManyChat** sigue apareciendo en Integraciones como conectable, pero lo que trae va a una tabla que ninguna pantalla muestra.
- **Tarjetas de DMs en Métricas** (leads, agendamiento, fantasma, tiempo de respuesta, "Conversaciones", tendencia semanal): leen el inbox viejo y siempre muestran 0.
- **Tramo de DMs del embudo del Panel General**: mismo origen, siempre vacío.
- **Recuadro "Vista previa" de Fathom** en el detalle del turno de Closing: placeholder sin función.
- **Indicador de tendencia** del ranking del equipo en Métricas: siempre dice "estable".
- **Etiquetas con emojis** en la bandeja, contra la regla de diseño.
- Por detrás (no se ve, pero corre): cada pantalla de la plataforma carga y escucha en tiempo real el inbox viejo, y siguen agendados los crons de DMs de Instagram. Detalle y orden de borrado en `docs/areas/ventas.md` § Legacy.

---

## Marketing

Todo lo que el founder publica y cómo rinde: la biblioteca de contenido que se trae sola desde Zernio (posts, reels, historias, videos de YouTube), las métricas de cada pieza, el análisis con IA, las cinco versiones de prueba de un reel (Trial Reels), los anuncios de Meta, los comentarios, los formularios con puntaje de leads, los links UTM y los lead magnets. Lo usan el founder y el equipo con permiso de Marketing. No publica directo en Instagram: todo sale como borrador en Zernio.

Doc técnico: [`docs/areas/marketing.md`](./areas/marketing.md)

| ID | Funcionalidad | Estado | Pendientes que la afectan | Evidencia | Octubre |
|---|---|---|---|---|---|
| F-MKT-01 | El founder puede ver su biblioteca de contenido (posts, reels, historias, videos) traída de Zernio, filtrarla por tipo y ordenarla por fecha, vistas o engagement; se actualiza sola al entrar si pasaron más de 30 minutos | Con fallas | `MKT-HOLDING-ORG`, `MKT-CONTENT-LIMITE-50`, `AUDITORIA §3 confiabilidad 11` | [`areas/marketing.md` § Contenido desde Zernio](./areas/marketing.md#contenido-desde-zernio) · `app/(platform)/marketing/content/page.tsx` | |
| F-MKT-02 | El sistema importa las historias de Instagram de las últimas 24 horas y las muestra como historias (no como reels) | Sin verificar | `BUG-1`, `ZERNIO-DOCS` | [`areas/marketing.md` § Reglas de negocio](./areas/marketing.md#reglas-de-negocio-y-decisiones-no-obvias) · `app/marketing/content/sync-actions.ts` | |
| F-MKT-03 | El sistema actualiza las métricas de cada pieza (likes, vistas, alcance, guardados…) todos los días a las 03:00 hora Argentina, sin pisar con ceros cuando Zernio no manda datos | Funciona | `AUDITORIA §3 confiabilidad 11`, `T-11`, `ZERNIO-METRICAS-429` | [`areas/marketing.md` § Contenido desde Zernio](./areas/marketing.md#contenido-desde-zernio) · `app/api/cron/sync-content-metrics/route.ts` | |
| F-MKT-04 | El founder puede abrir el detalle de una pieza y ver sus métricas comparadas con el promedio de su contenido | Con fallas | `MKT-HOLDING-ORG`, `MKT-CONTENT-LIMITE-50` | [`areas/marketing.md` § Pantallas y rutas](./areas/marketing.md#pantallas-y-rutas) · `app/(platform)/marketing/content/[id]/page.tsx` | |
| F-MKT-05 | El founder puede vincular un archivo de Google Drive a una pieza, desde el detalle o desde el explorador "Administrar" | Con fallas | `MKT-HOLDING-ORG`, `PERMISOS-SERVER-ACTIONS/marketing` | [`areas/marketing.md` § Pantallas y rutas](./areas/marketing.md#pantallas-y-rutas) · `app/(platform)/marketing/administrar/page.tsx` | |
| F-MKT-06 | El founder puede crear una carpeta nueva en Drive desde "Administrar" | No funciona | `MKT-DRIVE-CARPETA` | [`areas/marketing.md` § Reglas de negocio](./areas/marketing.md#reglas-de-negocio-y-decisiones-no-obvias) · `app/marketing/content/drive-actions.ts` | |
| F-MKT-07 | El founder puede pedir un análisis con IA de una pieza con video de Drive (transcripción, gancho, formato, llamado a la acción) | Con fallas | `MKT-HOLDING-ORG` | [`areas/marketing.md` § Contenido desde Zernio](./areas/marketing.md#contenido-desde-zernio) · `app/marketing/content/actions.ts` | |
| F-MKT-08 | El founder puede ver variantes de una pieza generadas por IA en la solapa "Borradores" (hoy sólo las crea el agente; no se pueden publicar a Zernio desde la pantalla) | A medias | `MKT-CODIGO-MUERTO` | [`areas/marketing.md` § Contenido desde Zernio](./areas/marketing.md#contenido-desde-zernio) · `app/(platform)/marketing/content/page.tsx` | |
| F-MKT-09 | El founder puede generar cinco versiones de prueba de un reel (Trial Reels) y previsualizarlas | Con fallas | `TRIAL-SECRET-EN-URL`, `MKT-HOLDING-ORG`, `TRIAL-FALLBACK-ROTO` | [`areas/marketing.md` § Trial Reels](./areas/marketing.md#trial-reels) · `app/marketing/content/reel-variation-actions.ts` | |
| F-MKT-10 | El founder puede elegir qué versiones de Trial Reels subir y el sistema las deja como borradores en Zernio, escalonadas en el tiempo, y le avisa por mail al terminar | Con fallas | `TRIAL-SECRET-EN-URL`, `TRIAL-RETRY-GENERACION` | [`areas/marketing.md` § Trial Reels](./areas/marketing.md#trial-reels) · `app/api/queue/publish-reel-variation/route.ts` | |
| F-MKT-11 | El founder puede usar su propia música en la versión con música de Trial Reels | No funciona | `TRIAL-REELS-MUSICA`, `TRIAL-4` | [`areas/marketing.md` § Limitaciones conocidas](./areas/marketing.md#limitaciones-conocidas-y-deuda) · `components/marketing/trial-reels/reel-music-upload.tsx` | |
| F-MKT-12 | El sistema borra los videos de Trial Reels con más de 30 días | Funciona | `TRIAL-CLEANUP-LOOP` | [`areas/marketing.md` § Trial Reels](./areas/marketing.md#trial-reels) · `app/api/cron/cleanup-trial-reels/route.ts` | |
| F-MKT-13 | El founder puede ver sus anuncios de Meta con gasto y resultados, en general y por pieza de contenido | Funciona | — | [`areas/marketing.md` § Resto](./areas/marketing.md#resto) · `app/(platform)/marketing/anuncios/page.tsx` | |
| F-MKT-14 | El sistema guarda todos los días el gasto de anuncios del día anterior para el histórico de Embudos | Sin verificar | `EMBUDOS-CUENTAS-REALES`, `EMBUDOS-CRON-ERRORES` | [`areas/marketing.md` § Resto](./areas/marketing.md#resto) · `app/api/cron/capture-ad-metrics/route.ts` | |
| F-MKT-15 | El equipo puede ver los comentarios de todas las cuentas y responderlos u ocultarlos desde Comentarios; en el detalle de cada pieza se ven sólo en lectura | Funciona | — | [`areas/marketing.md` § Resto](./areas/marketing.md#resto) · `app/(platform)/comentarios/page.tsx` | |
| F-MKT-16 | El sistema recibe al instante de Zernio los comentarios y mensajes nuevos (webhook) | Sin verificar | `ZERNIO-WEBHOOK-SIN-EVENTOS`, `ZERNIO-DOCS` | [`areas/marketing.md` § Resto](./areas/marketing.md#resto) · `app/api/integrations/zernio/webhook/route.ts` | |
| F-MKT-17 | El founder puede ver en el Overview de Marketing sus KPIs, embudo y mapa de calor de contenido | No funciona | `MKT-OVERVIEW-LEGACY`, `AUDITORIA §3 salud 1` | [`areas/marketing.md` § Reglas de negocio](./areas/marketing.md#reglas-de-negocio-y-decisiones-no-obvias) · `app/(platform)/marketing/page.tsx` | |
| F-MKT-18 | El founder puede ver cómo se reparte su contenido entre Autoridad, Atracción, Nutrición y Venta, con una lectura de la IA | Funciona | — | [`areas/marketing.md` § Pantallas y rutas](./areas/marketing.md#pantallas-y-rutas) · `app/(platform)/marketing/page.tsx` | |
| F-MKT-19 | El founder puede ver qué contenido trajo más ventas y el recorrido de sus compradores (Conexión con Ventas, y la sección "Atribución de ventas" del detalle) | No funciona | `MKT-SALES-CONN-VACIA`, `EMBUDO-PANEL-DMS` | [`areas/marketing.md` § Reglas de negocio](./areas/marketing.md#reglas-de-negocio-y-decisiones-no-obvias) · `app/(platform)/marketing/sales-connection/page.tsx` | |
| F-MKT-20 | El founder puede generar un reporte con IA de los patrones de su contenido analizado (está en Conexión con Ventas, pantalla oculta del menú: se entra por URL) | Funciona | `MKT-SALES-CONN-VACIA` | [`areas/marketing.md` § Contenido desde Zernio](./areas/marketing.md#contenido-desde-zernio) · `app/marketing/content/pattern-report-actions.ts` | |
| F-MKT-21 | El founder puede ver sus formularios de Typeform y Google Forms, sincronizarlos (solos cada hora o con un botón), ver las respuestas con puntaje de lead por IA y desconectarlos | Con fallas | `MKT-FORMS-SIN-RESPUESTAS`, `AUDITORIA-ABIERTOS §6`, `PERMISOS-SERVER-ACTIONS/marketing` | [`areas/marketing.md` § Formularios](./areas/marketing.md#formularios) · `app/(platform)/marketing/forms/page.tsx` | |
| F-MKT-22 | El founder puede crear links UTM para videos de YouTube (con link de ManyChat) y ver clics, leads, agendas y ventas de cada uno | Funciona | `MKT-UTM-SELECTOR-VIDEOS`, `T-5` | [`areas/marketing.md` § UTMs](./areas/marketing.md#utms) · `app/(platform)/marketing/utms/page.tsx` | |
| F-MKT-23 | El sistema atribuye a cada link UTM los clics, leads, llamadas agendadas y ventas (por coincidencia de email o nombre) | Sin verificar | `T-5` | [`areas/marketing.md` § UTMs](./areas/marketing.md#utms) · `app/api/utm/track/route.ts` | |
| F-MKT-24 | El founder puede crear, editar y borrar lead magnets y ver sus leads | Funciona | — | [`areas/marketing.md` § Resto](./areas/marketing.md#resto) · `app/(platform)/marketing/lead-magnets/page.tsx` | |
| F-MKT-25 | El sistema registra quién pidió cada lead magnet (hoy sólo desde el análisis de DMs; Typeform, Google Forms, landing y ManyChat no capturan) | A medias | `MKT-LEAD-MAGNETS-CAPTURA` | [`areas/marketing.md` § Resto](./areas/marketing.md#resto) · `lib/marketing/lead-magnets-internal.ts` | |
| F-MKT-26 | El founder puede ver la lista de sus automatizaciones de ManyChat (sólo lectura) | Funciona | — | [`areas/marketing.md` § Resto](./areas/marketing.md#resto) · `app/(platform)/marketing/automatizaciones/page.tsx` | |
| F-MKT-27 | El sistema trae los videos de YouTube del canal y sus métricas (sólo al conectar; después quedan congeladas) | A medias | `YT-SIN-CRON`, `MKT-SCOPE-YT-UPLOAD` | [`areas/marketing.md` § Contenido desde Zernio](./areas/marketing.md#contenido-desde-zernio) · `lib/google/sync-youtube.ts` | |

### Prometido y no existe

- **Overview con 6 métricas, 6 gráficos e insights IA** (`docs/archivo/ESTADO_PLATAFORMA.md` § Marketing): existe distinto. La pantalla está, pero los KPIs, el embudo y el mapa de calor salen de la tabla vieja de Instagram (una sola org la llena); para quien usa sólo Zernio quedan vacíos. Sólo el gráfico de distribución por etiqueta usa el contenido de Zernio.
- **Biblioteca en grilla o lista, con búsqueda** (`ESTADO_PLATAFORMA.md`): existe distinto. Hay grilla, filtro por tipo y orden; no hay vista de lista ni buscador, y muestra como máximo 50 piezas (en producción hay 150).
- **Detalle de publicación con conversaciones, agendas, revenue influenciado y % de recorrido** (`ESTADO_PLATAFORMA.md`): existe distinto. El detalle tiene Métricas, Análisis, Comentarios, Anuncios, Variantes y Trial Reels; la sección "Atribución de ventas" siempre dice "Sin atribución" porque nada la calcula.
- **Conexión con Ventas: ranking por ventas, recorridos de compradores, patrones IA** (`ESTADO_PLATAFORMA.md`): existe, pero oculta del menú y vacía (lee el inbox viejo de ManyChat, sin datos). Sólo el reporte de patrones funciona.
- **Instagram vía Make** (`ESTADO_PLATAFORMA.md`): no existe. El contenido entra por Zernio.
- **Sincronización contenido de Instagram ↔ recorridos en la bandeja** (`ESTADO_PLATAFORMA.md`, próximos pasos): no existe.
- **Minuto del CTA en cada video de YouTube, % de audiencia que llega y comparación entre videos** (`docs/archivo/OPERATIONAL_NOTES.md` § YouTube): no existe en pantalla. Los componentes quedaron huérfanos y no se ven.
- **YouTube sincronizado por cron hacia la tabla de contenido vieja** (`docs/archivo/INTEGRACIONES_MAPA.md`): existe distinto. Se sincroniza una sola vez, al conectar, y va a la biblioteca nueva.
- **Gasto de anuncios sólo en vivo, sin guardar** (`docs/specs/FUNNELS_ARCHITECTURE.md`, etapa Spend): existe distinto. Hoy hay una foto diaria del gasto, aunque en producción todavía tiene 0 filas.

### Legacy visible

- **Overview de Marketing**: la pantalla principal del módulo muestra datos de la integración vieja de Instagram; para casi todas las orgs se ve vacía.
- **Conexión con Ventas** (`/marketing/sales-connection`): oculta del menú pero accesible por URL; siempre vacía.
- **Sección "Atribución de ventas"** en el detalle de cada pieza: siempre vacía.
- **Botón "Nueva carpeta"** en Administrar: siempre da error.
- **Sincronización de Instagram por la vía vieja** (cada hora y cada 5 minutos) sigue corriendo en segundo plano aunque el contenido ya entra por Zernio.
- **Selector de videos del generador de UTMs**: lista videos de la tabla vieja; con una conexión de YouTube nueva queda vacío (se puede cargar el título a mano).
- **Canales de lead magnets** Typeform, Google Forms, landing y ManyChat: se pueden elegir en el formulario pero no registran leads.

---

## Embudos y Lanzamientos

Embudos le muestra al founder si una oferta vende y dónde se rompe el camino, desde el anuncio hasta el cobro. Junta en un solo lugar números que hoy viven en anuncios, llamadas, formularios, cobros y herramientas externas (GoHighLevel, VTurb, WebinarJam, Hyros, Whop y Commas), y los ordena en las mismas siete etapas para cualquier tipo de embudo (webinar, VSL con llamada, DM). Sólo mide: no se cargan datos a mano. Lanzamientos está apagado. De ese módulo sólo sigue vivo que las tareas del Tablero se pueden asignar a un lanzamiento.

Doc técnico: [`docs/areas/embudos.md`](./areas/embudos.md)

| ID | Funcionalidad | Estado | Pendientes que la afectan | Evidencia | Octubre |
|---|---|---|---|---|---|
| F-EMB-01 | El founder puede ver el listado de sus embudos, cada uno con su precio y cuántos pasos tienen fuente de datos | Funciona | `EMBUDOS-GESTION-INSTANCIAS` | [`areas/embudos.md` § Pantallas y rutas](./areas/embudos.md#pantallas-y-rutas) · `app/(platform)/funnels/page.tsx` | |
| F-EMB-02 | El founder puede crear un embudo desde una plantilla (Webinar, VSL con llamada, DM) con nombre, precio y moneda; algunos pasos vienen con fuente asignada | Funciona | `EMBUDOS-PERMISOS-ACCIONES`, `EMBUDOS-GESTION-INSTANCIAS` | [`areas/embudos.md` § Cómo fluye el dato](./areas/embudos.md#cómo-fluye-el-dato) · `components/funnels/funnel-create-form.tsx` | |
| F-EMB-03 | El founder puede elegir de dónde sale el número de cada paso (fuente más su parámetro: etapa de GHL, video de VTurb, webinar o formulario). Sólo se ofrecen las fuentes que sirven para esa etapa | Funciona | `EMBUDOS-PERMISOS-ACCIONES` | [`areas/embudos.md` § Catálogo de fuentes por etapa](./areas/embudos.md#catálogo-de-fuentes-por-etapa) · `app/(platform)/funnels/[funnelId]/configurar/page.tsx` | |
| F-EMB-04 | El founder puede ver el detalle de un embudo: las 7 etapas, la tabla de pasos con la fuente de cada cifra y avisos que separan "paso sin fuente" de "fuente sin número" | Funciona | `EMBUDOS-SIGNAL-INCONSISTENTE`, `EMBUDOS-TIMEOUTS` | [`areas/embudos.md` § El motor (lib/funnels)](./areas/embudos.md#el-motor-libfunnels) · `app/(platform)/funnels/[funnelId]/page.tsx` | |
| F-EMB-05 | El founder puede ver los tres indicadores clave de cada tipo de embudo (north-star, indicador adelantado y la tasa que manda) | Funciona | — | [`areas/embudos.md` § El motor (lib/funnels)](./areas/embudos.md#el-motor-libfunnels) · `app/(platform)/funnels/[funnelId]/page.tsx` | |
| F-EMB-06 | El founder puede cambiar el período (7, 30 o 90 días) y pasar de un embudo a otro sin perder el período elegido | Funciona | `EMBUDOS-TIMEZONE` | [`areas/embudos.md` § Pantallas y rutas](./areas/embudos.md#pantallas-y-rutas) · `components/funnels/funnel-switcher.tsx` | |
| F-EMB-07 | El founder puede ver los KPIs universales (CAC, ROAS, costo y ganancia por lead, ticket promedio, LTV, etc.), con la etiqueta [Meta] o [Hyros] según de dónde sale la cifra | Con fallas | `EMBUDOS-MEDIDAS-POR-EMBUDO`, `EMBUDOS-MONEDAS`, `EMBUDOS-CUENTAS-REALES` | [`areas/embudos.md` § Reglas de negocio y decisiones no obvias](./areas/embudos.md#reglas-de-negocio-y-decisiones-no-obvias) · `components/funnels/funnel-kpi-panel.tsx` | |
| F-EMB-08 | El sistema muestra "sin datos" (nunca un cero falso) cuando un paso no tiene fuente, le falta un parámetro, la integración falla o la org nunca tuvo datos | Funciona | `EMBUDOS-SIGNAL-INCONSISTENTE`, `EMBUDOS-GHL-WON` | [`areas/embudos.md` § Reglas de negocio y decisiones no obvias](./areas/embudos.md#reglas-de-negocio-y-decisiones-no-obvias) · `lib/funnels/source-signal.ts` | |
| F-EMB-09 | El founder puede ver en el índice qué herramientas del estándar faltan o están incompletas, con una nota de qué cubre cada una | Funciona | (resuelto en SCRUM-60) | [`areas/embudos.md` § Limitaciones conocidas y deuda](./areas/embudos.md#limitaciones-conocidas-y-deuda) · `lib/funnels/instrumentation.ts` | |
| F-EMB-10 | El sistema mide los pasos que salen de datos propios de Limitless: llamadas de cierre (agendadas, asistidas, cerradas), clientes nuevos, cobros de clientes y respuestas de formularios | Funciona | `EMBUDOS-SIGNAL-INCONSISTENTE` | [`areas/embudos.md` § Catálogo de fuentes por etapa](./areas/embudos.md#catálogo-de-fuentes-por-etapa) · `lib/funnels/resolve.ts` | |
| F-EMB-11 | El embudo DM mide conversaciones abiertas, respondidas y con turno agendado del inbox | No funciona | `EMBUDOS-DM-DEFAULTS`, `EMBUDOS-SIGNAL-INCONSISTENTE`, `EMBUDO-PANEL-DMS` | [`areas/embudos.md` § Catálogo de fuentes por etapa](./areas/embudos.md#catálogo-de-fuentes-por-etapa) · `lib/funnels/sources.ts` | |
| F-EMB-12 | El sistema guarda todas las noches el gasto, alcance, impresiones y clicks del día anterior de cada anuncio de Meta (vía Zernio) | Sin verificar | `EMBUDOS-CRON-ERRORES`, `EMBUDOS-MEDIDAS-POR-EMBUDO` | [`areas/embudos.md` § Cómo fluye el dato](./areas/embudos.md#cómo-fluye-el-dato) · `app/api/cron/capture-ad-metrics/route.ts` | |
| F-EMB-13 | El sistema cuenta los comentarios del inbox de Zernio (todas las cuentas conectadas, sin filtrar por red) como disparadores del embudo DM | Sin verificar | `EMBUDOS-CUENTAS-REALES` | [`areas/embudos.md` § Integraciones externas](./areas/embudos.md#integraciones-externas) · `lib/zernio/triggers.ts` | |
| F-EMB-14 | El founder puede conectar Whop y Commas desde Integraciones, y el sistema registra por webhook cobros, reembolsos y valor contratado | Con fallas | `EMBUDOS-WEBHOOK-PERDIDA`, `EMBUDOS-PAGOS-VERIFICAR`, `EMBUDOS-CUENTAS-REALES`, `EMBUDOS-PAGOS-BACKFILL` | [`areas/embudos.md` § Integraciones externas](./areas/embudos.md#integraciones-externas) · `components/integrations/settings/payment-settings.tsx` | |
| F-EMB-15 | El sistema calcula compras repetidas, retención y LTV con los cobros de los últimos 365 días | Sin verificar | `EMBUDOS-PAGOS-VERIFICAR`, `EMBUDOS-MONEDAS`, `EMBUDOS-PAGOS-BACKFILL` | [`areas/embudos.md` § Reglas de negocio y decisiones no obvias](./areas/embudos.md#reglas-de-negocio-y-decisiones-no-obvias) · `lib/payments/retention.ts` | |
| F-EMB-16 | El founder puede traer los pipelines de GoHighLevel, generar la URL del webhook, y el sistema arma su propio historial de cambios de etapa de las oportunidades | Con fallas | `EMBUDOS-WEBHOOK-PERDIDA`, `EMBUDOS-GHL-ENTREGA`, `EMBUDOS-GHL-BACKFILL`, `EMBUDOS-GHL-WON`, `EMBUDOS-GHL-WEBHOOK-HARDENING` | [`areas/embudos.md` § Integraciones externas](./areas/embudos.md#integraciones-externas) · `components/integrations/settings/ghl-opportunities-settings.tsx` | |
| F-EMB-17 | El founder puede conectar VTurb y traer sus videos, y el embudo muestra visitas, reproducciones, % visto, llegadas al pitch y clicks al CTA del VSL | Sin verificar | `EMBUDOS-CUENTAS-REALES`, `EMBUDOS-VTURB-PITCH`, `EMBUDOS-TIMEOUTS` | [`areas/embudos.md` § Integraciones externas](./areas/embudos.md#integraciones-externas) · `components/integrations/settings/vturb-settings.tsx` | |
| F-EMB-18 | El founder puede conectar WebinarJam/EverWebinar, sincronizar a mano webinars y registrantes, y cargar el segundo del pitch; el embudo muestra registrados, asistentes y quiénes se quedaron hasta la oferta | Sin verificar | `WEBINARJAM-API-KEY`, `EMBUDOS-SYNC-PROGRAMADO`, `EMBUDOS-WJ-SCHEDULE-NULL`, `EMBUDOS-CUENTAS-REALES` | [`areas/embudos.md` § Integraciones externas](./areas/embudos.md#integraciones-externas) · `components/integrations/settings/webinarjam-settings.tsx` | |
| F-EMB-19 | El founder puede conectar Hyros, elegir modelo de atribución y cuentas publicitarias, y ver revenue y gasto atribuidos, opt-ins y visitantes | Sin verificar | `EMBUDOS-CUENTAS-REALES`, `EMBUDOS-MEDIDAS-POR-EMBUDO`, `EMBUDOS-TIMEOUTS` | [`areas/embudos.md` § Integraciones externas](./areas/embudos.md#integraciones-externas) · `components/integrations/settings/hyros-settings.tsx` | |
| F-EMB-20 | Sólo los miembros con permiso "Embudos" ven el módulo y pueden entrar a sus pantallas | Funciona | `EMBUDOS-PERMISOS-ACCIONES` | [`areas/embudos.md` § Pantallas y rutas](./areas/embudos.md#pantallas-y-rutas) · `app/(platform)/layout.tsx` | |
| F-EMB-21 | El founder puede ver en semáforo si cada paso y cada KPI está sano, en observación o por debajo del estándar | A medias | `EMBUDOS-SALUD` | [`areas/embudos.md` § El motor (lib/funnels)](./areas/embudos.md#el-motor-libfunnels) · `lib/funnels/health-bands.ts` | |
| F-EMB-22 | El sistema guarda la historia de cada embudo por período y manda un pulso diario | A medias | `EMBUDOS-SNAPSHOTS` | [`areas/embudos.md` § Modelo de datos](./areas/embudos.md#modelo-de-datos) · `lib/funnels/resolve.ts` | |
| F-EMB-23 | El founder puede crear lanzamientos con objetivos, cargar métricas diarias y generar un post-mortem con IA | A medias | `LANZAMIENTOS-DORMIDO` | [`areas/embudos.md` § Lanzamientos](./areas/embudos.md#lanzamientos) · `app/(platform)/lanzamientos/page.tsx` | |
| F-EMB-24 | El equipo puede asignar tareas del Tablero de trabajo a un lanzamiento y filtrar por lanzamiento | Funciona | `LANZAMIENTOS-DORMIDO` | [`areas/embudos.md` § Lanzamientos](./areas/embudos.md#lanzamientos) · `app/(platform)/workboard/page.tsx` | |

### Prometido y no existe

- **Varias instancias por oferta con números propios** (FUNNELS_ARCHITECTURE §1, decisión 1). Existe distinto: se pueden crear varios embudos, pero el gasto, la facturación y todos los KPIs de dinero son de la org entera. Dos embudos de $27 y de $5.000 muestran el mismo CAC, ROAS y LTV.
- **Estado de salud con semáforo y `diagnoseFunnel()`** (FUNNELS_ARCHITECTURE §10, Fase 2; §6.3 "índice con estado de salud de un vistazo" y "switcher con indicador de salud"). No existe en la pantalla: el cálculo de las bandas está hecho y tiene tests, pero está en pausa; `diagnoseFunnel()` no existe ni en código. El índice muestra "N de M pasos con fuente" y el switcher no tiene indicador.
- **Vista comparativa `/funnels/comparar`** (FUNNELS_ARCHITECTURE §6.3). No existe. La ruta está declarada, pero abrirla da 404.
- **Sidebar dinámico con una entrada por embudo** (FUNNELS_ARCHITECTURE §6.3). No existe. La navegación tiene un solo acceso "Embudos" que lleva al índice.
- **Snapshots, historia y pulso diario** (FUNNELS_ARCHITECTURE §10, Fase 5; §8 "falta el pulso diario"). Existe distinto: los snapshots no existen (la tabla está creada pero nada escribe en ella); el pulso diario sí existe como reporte ejecutivo de toda la org (F-IA-19), pero no incluye números de los embudos.
- **Reporte en horario EST** (FUNNELS_ARCHITECTURE §1, decisión 7; §3.7). Existe distinto: el horario del embudo se guarda y se muestra, pero los períodos se cortan en UTC.
- **Whop/Fanbasis "cubierto por Stripe + Mercado Pago"** (FUNNELS_ARCHITECTURE §7). Existe distinto: los embudos sólo leen los cobros de Whop y Commas. Los de Stripe y Mercado Pago no llegan a ningún embudo.
- **El embudo DM hardcodeado del Panel General pasa a ser la instancia DM del motor** (FUNNELS_ARCHITECTURE §8). No pasó: el Panel sigue con su propio "Embudo de conversión", que no usa el motor.
- **Activación como add-on por super-admin y permiso separado `funnels_config`** (FUNNELS_ARCHITECTURE §1 decisión 6, §8). Existe distinto: Embudos aparece siempre y lo filtra un solo permiso `funnels`. No hay permiso aparte para editar fuentes.
- **Lanzamientos como CRUD funcionando, con métricas diarias, tareas y post-mortem IA** (`docs/archivo/OPERATIONAL_NOTES.md` § Módulo Lanzamientos). Existe distinto: las páginas dicen "Próximamente". El backend y los componentes existen, pero ninguna página los usa.

### Legacy visible

- `/lanzamientos` y `/lanzamientos/[id]` se pueden abrir por URL y muestran "Próximamente". El ítem de la barra está deshabilitado.
- Los defaults del embudo DM apuntan al inbox viejo (ManyChat/Unipile), que quedó vacío con el paso a Zernio. Un DM recién creado muestra ceros y "sin datos" mezclados.
- En el Panel General sigue el "Embudo de conversión" hardcodeado, paralelo al módulo Embudos y con otra lógica.

---

## Agente de negocio e IA

Es el "cerebro" de Limitless. El founder y su equipo le pueden preguntar a un agente que lee los datos reales del negocio (ventas, clientes, finanzas, marketing, operaciones) y que arma tareas, documentos y propuestas para el modelo de negocio. Además, la plataforma sola, sin que nadie apriete nada, genera informes de inteligencia y reportes ejecutivos (diario, semanal y mensual) y aprende cómo escribe el founder. La base de conocimiento es donde el negocio carga sus documentos para que la IA los tenga en cuenta. Cada organización puede usar su propia clave de Claude.

Doc técnico: [`docs/areas/agente-ia.md`](./areas/agente-ia.md)

| ID | Funcionalidad | Estado | Pendientes que la afectan | Evidencia | Octubre |
|---|---|---|---|---|---|
| F-IA-01 | El founder y el equipo pueden chatear con el agente de negocio y ver la respuesta escribiéndose en vivo, con historial de conversaciones y título automático | Con fallas | `AGENTE-SIN-FALLBACK-CLAVE`, `AUDITORIA-ABIERTOS §3.6`, `AGENTE-COMPACTION-FRAGIL`, `AGENTE-CACHE-INEFECTIVO` | [`areas/agente-ia.md` § Agente (camino vivo: SSE)](./areas/agente-ia.md#agente-camino-vivo-sse) · `app/(platform)/agent/page.tsx` | |
| F-IA-02 | El founder puede ordenar las conversaciones del agente por etapa del negocio, que le da contexto a las respuestas | Funciona | — | [`areas/agente-ia.md` § Pantallas y rutas](./areas/agente-ia.md#pantallas-y-rutas) · `app/(platform)/agent/stage/[stageId]/page.tsx` | |
| F-IA-03 | El agente puede consultar datos reales de todos los módulos (resumen del negocio, clientes, ventas, llamadas de cierre, finanzas, marketing, lead magnets, operaciones) | Con fallas | `PERMISOS-SERVER-ACTIONS/agente-ia`, `INTELIGENCIA-FUENTES-LEGACY` | [`areas/agente-ia.md` § Tools del agente](./areas/agente-ia.md#tools-del-agente-agent_chat_tools-20) · `lib/agent/data-reader-handlers.ts` | |
| F-IA-04 | El agente puede crear, buscar y actualizar tareas del tablero de trabajo | Funciona | — | [`areas/agente-ia.md` § Tools del agente](./areas/agente-ia.md#tools-del-agente-agent_chat_tools-20) · `app/agent/workboard-actions.ts` | |
| F-IA-05 | El agente puede analizar una pieza de contenido, proponer variantes y decir cuál es el contenido que mejor rinde | Funciona | — | [`areas/agente-ia.md` § Tools del agente](./areas/agente-ia.md#tools-del-agente-agent_chat_tools-20) · `lib/agent/agent-tool-handler.ts` | |
| F-IA-06 | El agente puede generar archivos descargables (Excel, CSV, Word, PDF) desde el chat | Funciona | `AGENTE-LINKS-VENCIDOS` | [`areas/agente-ia.md` § Tools del agente](./areas/agente-ia.md#tools-del-agente-agent_chat_tools-20) · `lib/agent/document-generator.ts` | |
| F-IA-07 | El agente puede proponer cambios al modelo de negocio (avatar, producto, escalón de la escalera de valor, framework de ventas, propuesta de valor) y el founder los aprueba o rechaza desde el chat | Funciona | — | [`areas/agente-ia.md` § Tools del agente](./areas/agente-ia.md#tools-del-agente-agent_chat_tools-20) · `app/agent/graph-proposal-actions.ts` | |
| F-IA-08 | El founder puede ver respuestas largas en un panel "Canvas" y exportarlas a Word | Funciona | — | [`areas/agente-ia.md` § Canvas](./areas/agente-ia.md#canvas) · `components/agent/canvas-panel.tsx` | |
| F-IA-09 | El founder puede guardar un Canvas en la base de conocimiento | A medias | `RAG-CANVAS-INVISIBLE` | [`areas/agente-ia.md` § Canvas](./areas/agente-ia.md#canvas) · `app/agent/canvas-actions.ts` | |
| F-IA-10 | El agente puede crear un SOP en borrador cuando se lo piden en el chat | Con fallas | `AUDITORIA-ABIERTOS §3.6` | [`areas/agente-ia.md` § Reglas de negocio y decisiones no obvias](./areas/agente-ia.md#reglas-de-negocio-y-decisiones-no-obvias) · `lib/agent/stream-agent-message.ts` | |
| F-IA-11 | El founder puede activar búsqueda en internet para que el agente la use en la respuesta | Funciona | — | [`areas/agente-ia.md` § Tools del agente](./areas/agente-ia.md#tools-del-agente-agent_chat_tools-20) · `components/ui/ai-prompt-box.tsx` | |
| F-IA-12 | El founder puede dictarle al agente por voz y el sistema lo pasa a texto | Funciona | — | [`areas/agente-ia.md` § Transcripción de voz](./areas/agente-ia.md#transcripción-de-voz) · `app/api/agent/transcribe/route.ts` | |
| F-IA-13 | El agente responde con el contexto del negocio: datos de la org, documentos indexados, el "cerebro global" de Limitless y búsqueda semántica en la base de conocimiento | Con fallas | `PERMISOS-SERVER-ACTIONS/agente-ia`, `AUDITORIA-ABIERTOS §3.6` | [`areas/agente-ia.md` § Agente (camino vivo: SSE)](./areas/agente-ia.md#agente-camino-vivo-sse) · `lib/agent/jit-context.ts` | |
| F-IA-14 | El founder puede cargar notas y PDFs en la base de conocimiento, organizarlos en categorías propias y ver el estado de indexado sin recargar | Funciona | `RAG-INGESTA-SIN-REINTENTO` | [`areas/agente-ia.md` § Base de conocimiento y RAG](./areas/agente-ia.md#base-de-conocimiento-y-rag) · `app/(platform)/business-context/documents/page.tsx` | |
| F-IA-15 | El founder puede importar Google Docs y Google Sheets a la base de conocimiento (no se pueden volver a sincronizar) | A medias | `KB-GOOGLE-SIN-RESYNC`, `RAG-INGESTA-SIN-REINTENTO` | [`areas/agente-ia.md` § Base de conocimiento y RAG](./areas/agente-ia.md#base-de-conocimiento-y-rag) · `components/business-context/knowledge-base-page.tsx` | |
| F-IA-16 | El founder puede ver en la base de conocimiento las llamadas de Fathom y abrir cada documento en un visor | Funciona | — | [`areas/agente-ia.md` § Pantallas y rutas](./areas/agente-ia.md#pantallas-y-rutas) · `app/(platform)/business-context/[id]/page.tsx` | |
| F-IA-17 | El sistema indexa solo para el agente los SOPs activos, los inputs semanales, el contexto de producto y las llamadas de Fathom | Funciona | `RAG-SOP-HUERFANO` | [`areas/agente-ia.md` § Base de conocimiento y RAG](./areas/agente-ia.md#base-de-conocimiento-y-rag) · `lib/rag/ingest.ts` | |
| F-IA-18 | El sistema genera dos veces por día un informe de inteligencia (insights, recomendaciones, cuellos de botella, oportunidades, memoria) que el founder ve en Inteligencia y en el Área del fundador | Con fallas | `INTELIGENCIA-FUENTES-LEGACY`, `INTELIGENCIA-SIN-REINTENTO`, `REPORTES-DUPLICADOS`, `CRONS-ORGS-INACTIVAS` | [`areas/agente-ia.md` § Inteligencia y reportes ejecutivos (crons)](./areas/agente-ia.md#inteligencia-y-reportes-ejecutivos-crons) · `app/(platform)/intelligence/page.tsx` | |
| F-IA-19 | El sistema genera cada mañana un pulso diario del negocio | Con fallas | `REPORTES-PULSO-DIARIO`, `INTELIGENCIA-FUENTES-LEGACY`, `REPORTES-VENTANA-FIJA` | [`areas/agente-ia.md` § Inteligencia y reportes ejecutivos (crons)](./areas/agente-ia.md#inteligencia-y-reportes-ejecutivos-crons) · `lib/executive-reports/generate-daily.ts` | |
| F-IA-20 | El sistema genera cada lunes un reporte ejecutivo semanal | Con fallas | `INTELIGENCIA-FUENTES-LEGACY`, `REPORTES-SEMANA-ETIQUETA`, `REPORTES-DUPLICADOS` | [`areas/agente-ia.md` § Inteligencia y reportes ejecutivos (crons)](./areas/agente-ia.md#inteligencia-y-reportes-ejecutivos-crons) · `lib/executive-reports/generate-weekly.ts` | |
| F-IA-21 | El sistema genera el día 1 un reporte ejecutivo mensual | No funciona | `REPORTES-MENSUAL-MES-EQUIVOCADO`, `INTELIGENCIA-FUENTES-LEGACY` | [`areas/agente-ia.md` § Limitaciones conocidas y deuda](./areas/agente-ia.md#limitaciones-conocidas-y-deuda) · `lib/executive-reports/generate-monthly.ts` | |
| F-IA-22 | El founder puede ver el historial de reportes ejecutivos y abrir el detalle de cada uno desde el panel de la barra superior | Funciona | — | [`areas/agente-ia.md` § Pantallas y rutas](./areas/agente-ia.md#pantallas-y-rutas) · `app/(platform)/executive-reports/history/page.tsx` | |
| F-IA-23 | El founder puede generar a mano el primer reporte semanal (Operaciones, ejecutivo e inteligencia) cuando todavía no hay ninguno | Funciona | `REPORTES-GENERACION-MANUAL`, `REPORTES-DUPLICADOS` | [`areas/agente-ia.md` § Inteligencia y reportes ejecutivos (crons)](./areas/agente-ia.md#inteligencia-y-reportes-ejecutivos-crons) · `app/executive-reports/report-generation-actions.ts` | |
| F-IA-24 | El sistema analiza cada lunes cómo escribe el founder y usa ese tono como contexto para el agente | Con fallas | `INTELIGENCIA-SIN-REINTENTO`, `CRONS-ORGS-INACTIVAS`, `INTELIGENCIA-FUENTES-LEGACY` | [`areas/agente-ia.md` § Inteligencia y reportes ejecutivos (crons)](./areas/agente-ia.md#inteligencia-y-reportes-ejecutivos-crons) · `lib/founder-tone/analyze-tone.ts` | |
| F-IA-25 | El founder puede cargar su propia clave de Claude en Ajustes; el sistema la valida y avisa con una barra roja si deja de funcionar | Con fallas | `1A1-CLAVE-ANTHROPIC-ROTA`, `PERMISOS-SERVER-ACTIONS/agente-ia`, `IA-CLAVE-SIN-CREDITOS` | [`areas/agente-ia.md` § BYOK y fallback de clave](./areas/agente-ia.md#byok-y-fallback-de-clave) · `components/settings/claude-api-key-settings.tsx` | |
| F-IA-26 | Si la clave propia de la org es rechazada, el sistema sigue trabajando con la clave de Limitless | Sin verificar | `1A1-CLAVE-ANTHROPIC-ROTA`, `IA-CLAVES-INVALIDAS`, `AGENTE-SIN-FALLBACK-CLAVE` | [`areas/agente-ia.md` § BYOK y fallback de clave](./areas/agente-ia.md#byok-y-fallback-de-clave) · `lib/ai/credential-resolver.ts` | |
| F-IA-27 | El sistema registra el costo de cada uso de IA por organización, visible para el staff de Limitless | A medias | `IA-COSTOS-INCOMPLETOS`, `IA-CLAVE-DE-CLIENTE-EN-SUPERADMIN` | [`areas/agente-ia.md` § Prompt caching y costo](./areas/agente-ia.md#prompt-caching-y-costo) · `lib/track-token-usage.ts` | |
| F-IA-28 | El staff de Limitless puede cargar un "cerebro global" de documentos que el agente de todas las organizaciones usa como contexto | Con fallas | `IA-CLAVE-DE-CLIENTE-EN-SUPERADMIN` | [`areas/agente-ia.md` § Reglas de negocio y decisiones no obvias](./areas/agente-ia.md#reglas-de-negocio-y-decisiones-no-obvias) · `app/(super-admin)/super-admin/ai-brain/library/page.tsx` | |

### Prometido y no existe

- **Claude Opus para SOPs y razonamiento complejo** (`docs/archivo/AI_ENGINE_SPEC.md`, `docs/archivo/PROJECT_CONSTITUTION.md`): no existe. Opus no se usa en ningún lado; los SOPs y los análisis pesados van con Sonnet, que además hoy apunta a la versión 4.5 aunque el código diga 4.6.
- **Detección de reservas por IA** ("booking detection", en las dos specs): no existe. La tarea está definida en la configuración de modelos pero nadie la llama.
- **Prompt caching "obligatorio" del contexto del negocio, la biblioteca de SOPs y la metodología de ventas** (`AI_ENGINE_SPEC.md`): existe distinto. Se cachea el contexto que la IA elige para cada pregunta, que cambia de mensaje a mensaje, así que casi nunca se reaprovecha.
- **Knowledge graph / memoria organizacional con tipos de memoria (estática, operativa, de ventas, histórica)** (`PROJECT_CONSTITUTION.md`, `AI_ENGINE_SPEC.md`): existe distinto. Hay búsqueda semántica sobre documentos y una lista de "memoria" en el informe de inteligencia; no hay grafo de conocimiento.
- **SOP Intelligence: la IA detecta problemas repetidos, sugiere SOPs y avisa cuando un SOP quedó desactualizado, roto o falta** (`PROJECT_CONSTITUTION.md`): no existe. El agente sólo arma un SOP en borrador si se lo piden en el chat; el estado "desactualizado" existe pero nadie lo marca automáticamente.
- **Reportes con patrones, cambios operativos y detección de sobrecarga** (`PROJECT_CONSTITUTION.md`): existe distinto. Los reportes traen resumen, riesgos, cuellos de botella, recomendaciones y estado por departamento; no hay patrones ni detección de sobrecarga del equipo.
- **Visor de documento con transcripción, resumen, insights y SOPs vinculados** (`docs/archivo/UI_UX_SPEC.md`, pantalla 9): existe distinto. El visor tiene "Contenido" y "Resumen", y el resumen son los primeros 280 caracteres del texto, no un resumen hecho por IA; no hay insights ni SOPs vinculados.
- **Exportar reportes ejecutivos a PDF** (`docs/archivo/ESTADO_PLATAFORMA.md`): no existe.
- **Funciones "futuras": pronósticos operativos, recomendaciones de contratación, predicción de ingresos, asignación de recursos y planeamiento estratégico** (`AI_ENGINE_SPEC.md`): no existen. El "AI COO Chat" sí existe (es el agente).
- **OAuth de Claude como alternativa a la clave propia** (lo sigue nombrando `CLAUDE.md`): no existe más; sólo se puede cargar una clave `sk-ant-`.

### Legacy visible

- `/intelligence/insights`, `/recommendations`, `/bottlenecks`, `/opportunities` y `/ai-memory`: no son pantallas, redirigen a secciones de `/intelligence`.
- `/agent/project/[id]`: redirige a `/agent` (los proyectos ya no tienen pantalla).
- `/founder` ("Área del fundador") muestra el mismo informe de inteligencia que `/intelligence`: son dos entradas para lo mismo.
- La pantalla de reportes ejecutivos dice "No hay generación manual", pero el botón de Inteligencia y Operaciones genera el ejecutivo semanal a mano.
- El Canvas guardado en la base de conocimiento no aparece en la pantalla de la base, pero el agente lo sigue usando y no hay forma de borrarlo.
- El chat flotante del agente ya no se muestra, pero su versión vieja sigue en el código y se puede invocar (`AGENTE-CAMINO-LEGACY`).

---

## Operaciones y equipo

Todo lo que el negocio usa para operar por dentro: el tablero donde el equipo carga y mueve su trabajo, los
procedimientos escritos (SOPs), el pulso semanal por departamento que después resume la IA, y la gestión de quién
entra a la cuenta y qué puede ver. Lo usan el founder y el equipo interno; ningún cliente final ve nada de acá.

Doc técnico: [`docs/areas/operaciones.md`](./areas/operaciones.md)

| ID | Funcionalidad | Estado | Pendientes que la afectan | Evidencia | Octubre |
|---|---|---|---|---|---|
| F-OPS-01 | El equipo puede crear, editar, borrar y mover tareas en un tablero Kanban de cuatro columnas (por hacer, en curso, revisión, hecho), con área, prioridad, vencimiento y etiquetas | Funciona | `PERMISOS-SERVER-ACTIONS/ops-fin-prod`, `WORKBOARD-CARGA-DUPLICADA` | [`areas/operaciones.md` § Tablero](./areas/operaciones.md#tablero) · `app/(platform)/workboard/page.tsx` | |
| F-OPS-02 | El equipo puede asignar una tarea a varios responsables y filtrar el tablero por responsable | Funciona | — | [`areas/operaciones.md` § Reglas de negocio](./areas/operaciones.md#reglas-de-negocio-y-decisiones-no-obvias) · `lib/workboard/mapper.ts` | |
| F-OPS-03 | El equipo puede ver las tareas en una vista de calendario mensual | Funciona | — | [`areas/operaciones.md` § Pantallas y rutas](./areas/operaciones.md#pantallas-y-rutas) · `components/workboard/workboard-calendar.tsx` | |
| F-OPS-04 | El equipo puede cerrar una tarea y cargar el tiempo que le dedicó; queda registrado quién la cerró y cuándo, y reabrirla lo limpia (hoy sólo si se cierra desde el detalle: arrastrándola en el Kanban no se registra) | Con fallas | `WORKBOARD-CIERRE-ARRASTRANDO` | [`areas/operaciones.md` § Tablero](./areas/operaciones.md#tablero) · `components/workboard/log-time-modal.tsx` | |
| F-OPS-05 | El founder puede ver un reporte de horas y costo por persona (el costo necesita la tarifa por hora del miembro, que hoy no se puede cargar desde ninguna pantalla; el tiempo de una tarea compartida va todo al primer responsable) | A medias | `EQUIPO-TARIFA-SIN-UI`, `WORKBOARD-TIEMPO-PRIMER-RESPONSABLE` | [`areas/operaciones.md` § Reglas de negocio](./areas/operaciones.md#reglas-de-negocio-y-decisiones-no-obvias) · `components/workboard/workboard-time-report.tsx` | |
| F-OPS-06 | El equipo puede trabajar por sprints: crear uno con objetivo y área foco (cierra el anterior sin preguntar), filtrar por área y ver la retrospectiva | Funciona | — | [`areas/operaciones.md` § Tablero](./areas/operaciones.md#tablero) · `components/workboard/workboard-sprint-header.tsx` | |
| F-OPS-07 | El equipo puede vincular a una tarea un SOP, documentos de la base de conocimiento y archivos adjuntos (PDF, Office o imagen, hasta 25 MB) | Funciona | `OPS-STORAGE-BUCKETS` | [`areas/operaciones.md` § Tablero](./areas/operaciones.md#tablero) · `app/workboard/task-link-actions.ts` | |
| F-OPS-08 | El sistema crea o actualiza tareas del tablero desde el agente, desde las propuestas de Fathom y desde "mandar al tablero" en las tareas de un cliente | Con fallas | `WORKBOARD-ASIGNACION-AGENTE` | [`areas/operaciones.md` § Tablero](./areas/operaciones.md#tablero) · `app/agent/workboard-actions.ts` | |
| F-OPS-09 | El founder puede generar un SOP con IA a partir de un objetivo y contexto escrito, revisarlo, editarlo y guardarlo | Funciona | `PERMISOS-SERVER-ACTIONS/ops-fin-prod` | [`areas/operaciones.md` § SOPs](./areas/operaciones.md#sops) · `app/(platform)/operations/sops/page.tsx` | |
| F-OPS-10 | El equipo puede consultar la biblioteca de SOPs y abrir cada uno en modo lectura, con sus capturas dentro de los pasos | Funciona | `OPS-STORAGE-BUCKETS` | [`areas/operaciones.md` § Pantallas y rutas](./areas/operaciones.md#pantallas-y-rutas) · `app/(platform)/sops/[id]/page.tsx` | |
| F-OPS-11 | El founder puede subir un video (por ejemplo un Loom) y el sistema lo transcribe y escribe el SOP, listando lo que el video no aclara | Sin verificar | `D-SOPS-VIDEO-NUNCA-CORRIO`, `OPS-SOP-VIDEO-MEMORIA`, `OPS-SOP-VIDEO-NO-SE-BORRA` | [`areas/operaciones.md` § SOPs](./areas/operaciones.md#sops) · `app/api/queue/process-sop-video/route.ts` | |
| F-OPS-12 | El sistema sugiere SOPs a escribir cuando una misma tarea se completó 3 o más veces en los últimos 30 días | Funciona | — | [`areas/operaciones.md` § SOPs](./areas/operaciones.md#sops) · `lib/sops/suggest-sops.ts` | |
| F-OPS-13 | El founder puede editar o borrar un SOP ya guardado, con historial de versiones | A medias | `SOPS-EDITAR` | [`areas/operaciones.md` § Limitaciones conocidas](./areas/operaciones.md#limitaciones-conocidas-y-deuda) · `app/sops/actions.ts` | |
| F-OPS-14 | El sistema suma cada SOP activo a la memoria del agente de negocio | Funciona | — | [`areas/operaciones.md` § SOPs](./areas/operaciones.md#sops) · `app/sops/actions.ts` | |
| F-OPS-15 | El equipo puede cargar cada semana un input por departamento (texto + puntaje 1 a 5), editarlo o borrarlo si es suyo, y ver el historial | Funciona | `OPS-SEMANA-UTC` | [`areas/operaciones.md` § Inputs y reporte semanal](./areas/operaciones.md#inputs-y-reporte-semanal) · `app/(platform)/operations/inputs/page.tsx` | |
| F-OPS-16 | El equipo puede dejar un "input rápido" sin pasar por el formulario completo (hoy reemplaza el input que la misma persona cargó para ese departamento esa semana) | Funciona | `OPS-INPUT-RAPIDO-PISA` | [`areas/operaciones.md` § Inputs y reporte semanal](./areas/operaciones.md#inputs-y-reporte-semanal) · `components/operations/team-input-form.tsx` | |
| F-OPS-17 | El equipo puede pedirle a la IA el reporte semanal (resumen, riesgos, cuellos de botella, recomendaciones) cuando hay inputs de 2 o más departamentos | Funciona | `PERMISOS-SERVER-ACTIONS/ops-fin-prod` | [`areas/operaciones.md` § Inputs y reporte semanal](./areas/operaciones.md#inputs-y-reporte-semanal) · `app/operations/actions.ts` | |
| F-OPS-18 | El founder puede ver el overview de Operaciones: el último reporte semanal y el estado de cada departamento | Funciona | — | [`areas/operaciones.md` § Pantallas y rutas](./areas/operaciones.md#pantallas-y-rutas) · `app/(platform)/operations/overview/page.tsx` | |
| F-OPS-19 | El founder puede dar de alta a un miembro con un rol; el sistema le genera una contraseña temporal que el miembro cambia en su primer ingreso | Con fallas | `EQUIPO-CUSTOM-ROLE-ORG`, `EQUIPO-ADMIN` | [`areas/operaciones.md` § Equipo](./areas/operaciones.md#equipo) · `app/(platform)/team/page.tsx` | |
| F-OPS-20 | El founder puede crear roles personalizados y decidir por módulo (13 módulos) si el rol no tiene acceso, sólo ve o tiene acceso completo | Con fallas | `PERMISOS-SERVER-ACTIONS/ops-fin-prod`, `PERMISOS-SERVER-ACTIONS` | [`areas/operaciones.md` § Reglas de negocio](./areas/operaciones.md#reglas-de-negocio-y-decisiones-no-obvias) · `lib/auth/get-current-permissions.ts` | |
| F-OPS-21 | El founder puede cambiarle el rol a un miembro | Con fallas | `EQUIPO-CUSTOM-ROLE-ORG` | [`areas/operaciones.md` § Equipo](./areas/operaciones.md#equipo) · `app/team/actions.ts` | |
| F-OPS-22 | El founder puede desactivar a un miembro para que deje de entrar | No funciona | `EQUIPO-DESACTIVAR-NO-BLOQUEA` | [`areas/operaciones.md` § Limitaciones conocidas](./areas/operaciones.md#limitaciones-conocidas-y-deuda) · `app/team/actions.ts` | |
| F-OPS-23 | El sistema muestra el grupo "Operaciones" (Overview, Inputs) en el menú sólo a las cuentas con ese add-on | Funciona | `OPS-ADDONS-SOLO-MENU` | [`areas/operaciones.md` § Pantallas y rutas](./areas/operaciones.md#pantallas-y-rutas) · `lib/navigation/sidebar-modules.ts` | |

### Prometido y no existe

- **Inputs semanales por voz o audio** (`docs/archivo/PROJECT_CONSTITUTION.md` § Weekly Inputs, `docs/archivo/UI_UX_SPEC.md` Screen 5): no existe; sólo texto y puntaje (la grabación de voz se sacó).
- **Reporte semanal con "patrones", "cambios operativos" y "detección de sobrecarga"** (`PROJECT_CONSTITUTION.md` § AI Outputs): existe distinto: el reporte trae sólo resumen, riesgos, cuellos de botella y recomendaciones.
- **Reporte semanal generado solo cada semana** (implícito en `PROJECT_CONSTITUTION.md` "AI creates reports"): no existe; ningún proceso automático lo genera, hay que apretar el botón.
- **La IA detecta problemas, errores y explicaciones repetidas y propone SOPs** (`PROJECT_CONSTITUTION.md` § SOP Intelligence): existe distinto: sólo cuenta tareas terminadas con el mismo título (3+ en 30 días). No lee conversaciones ni llamadas.
- **"SOPs vivos": la IA detecta SOPs desactualizados, rotos o faltantes** (`PROJECT_CONSTITUTION.md` § Living SOPs): no existe. El estado "desactualizado" existe pero nada lo detecta, y tampoco se puede editar un SOP a mano.
- **Creador de SOP con "Resultado esperado" y adjuntos** (`UI_UX_SPEC.md` Screen 7, `docs/archivo/AI_ENGINE_SPEC.md` § SOP Generation AI): existe distinto: objetivo, departamento y contexto; las capturas sólo se suman en el mismo flujo de creación.
- **Alta de usuarios hecha por el super admin a pedido del founder** (`PROJECT_CONSTITUTION.md` § Account Creation): existe distinto: el founder da el alta él mismo desde Equipo con contraseña temporal.
- **Un miembro desactivado no puede iniciar sesión** (`docs/archivo/OPERATIONAL_NOTES.md`): no es así; sigue entrando (`EQUIPO-DESACTIVAR-NO-BLOQUEA`).
- **Tarifa por hora del miembro editable en Equipo** (`docs/areas/operaciones.md` § Pantallas y rutas dice "Miembros (con tarifa por hora)"): la pantalla la lee pero no ofrece forma de cargarla.

### Legacy visible

- `/sops`: duplica la biblioteca de `/operations/sops` pero sin sugerencias; nada la linkea pero responde por URL (`OPS-LIMPIEZA`).
- `/invite?token=` y la lista de "invitaciones pendientes" en Equipo: restos de la invitación por email; hoy nada crea invitaciones, la lista siempre está vacía (`EQUIPO-INVITE-LEGADO`).
- Las rutas `/operations/*` y `/product/*` responden por URL aunque la cuenta no tenga el add-on que las muestra en el menú (`OPS-ADDONS-SOLO-MENU`).
- Temporizador de tareas: la base tiene campos para un timer en vivo que ninguna pantalla usa (`OPS-LIMPIEZA`).

---

## Finanzas

La vista de la plata del negocio: cuánto se facturó y se cobró en un período, qué queda por cobrar, cuánto cuesta
operar (gastos fijos, suscripciones, sueldos y comisiones del equipo) y el margen que queda. La usan el founder y
quien tenga el módulo Finanzas. No registra cobros: los toma de lo que se carga en Ventas → Cobros.

Doc técnico: [`docs/areas/finanzas.md`](./areas/finanzas.md)

| ID | Funcionalidad | Estado | Pendientes que la afectan | Evidencia | Octubre |
|---|---|---|---|---|---|
| F-FIN-01 | El founder puede ver los indicadores del período elegido: facturación, cash collected, margen contra un objetivo del 60% y lo que queda por cobrar | Funciona | `FIN-MONEDAS`, `PERMISOS-SERVER-ACTIONS/ops-fin-prod` | [`areas/finanzas.md` § Cómo fluye el dato](./areas/finanzas.md#cómo-fluye-el-dato) · `app/(platform)/finance/page.tsx` | |
| F-FIN-02 | El founder puede ver gráficos de ingresos por plataforma de cobro, facturación por tipo de pago y evolución mensual | Funciona | `FIN-MONEDAS` | [`areas/finanzas.md` § Pantallas y rutas](./areas/finanzas.md#pantallas-y-rutas) · `components/finance/finance-charts.tsx` | |
| F-FIN-03 | El sistema refleja en Finanzas, sin cargar nada dos veces, los cobros y clientes que se registran en Ventas → Cobros | Funciona | — | [`areas/finanzas.md` § Reglas de negocio](./areas/finanzas.md#reglas-de-negocio-y-decisiones-no-obvias) · `providers/finance-data-provider.tsx` | |
| F-FIN-04 | El sistema muestra los números del Excel importado cuando todavía no hay facturación cargada en la plataforma (si el Excel no trae cash collected, hoy lo estima como facturación menos gastos) | Funciona | `FINANZAS-BASELINE-CASH-ESTIMADO` | [`areas/finanzas.md` § Reglas de negocio](./areas/finanzas.md#reglas-de-negocio-y-decisiones-no-obvias) · `providers/finance-data-provider.tsx` | |
| F-FIN-05 | El founder puede cargar, editar, pausar y borrar gastos fijos (mensuales o anuales, por categoría y moneda) | Con fallas | `PERMISOS-SERVER-ACTIONS/ops-fin-prod`, `FIN-MONEDAS` | [`areas/finanzas.md` § Cómo fluye el dato](./areas/finanzas.md#cómo-fluye-el-dato) · `app/(platform)/finance/expenses/page.tsx` | |
| F-FIN-06 | El founder puede cargar, editar y borrar suscripciones (herramientas pagas del negocio) | Con fallas | `PERMISOS-SERVER-ACTIONS/ops-fin-prod`, `FIN-MONEDAS` | [`areas/finanzas.md` § Cómo fluye el dato](./areas/finanzas.md#cómo-fluye-el-dato) · `components/expenses/expenses-overview.tsx` | |
| F-FIN-07 | El founder puede definir la compensación de cada miembro (sueldo fijo y/o comisión por venta, por facturación, por upsell, por agenda o personalizada) y ver el gasto de equipo del mes | Con fallas | `PERMISOS-SERVER-ACTIONS/ops-fin-prod`, `FIN-PAYROLL-BASES` | [`areas/finanzas.md` § Reglas de negocio](./areas/finanzas.md#reglas-de-negocio-y-decisiones-no-obvias) · `lib/metrics/enrich-team-compensation.ts` | |
| F-FIN-08 | El sistema calcula la liquidación del mes por miembro (fijo + comisión según la base elegida; con base "personalizada" la comisión hoy da 0) | Con fallas | `PERMISOS-SERVER-ACTIONS/ops-fin-prod`, `FIN-PAYROLL-BASES`, `FIN-MESES-UTC` | [`areas/finanzas.md` § Cómo fluye el dato](./areas/finanzas.md#cómo-fluye-el-dato) · `app/finance/actions.ts` | |
| F-FIN-09 | El founder puede ver el resumen de gastos del período (fijos + suscripciones + equipo) y el margen resultante | Funciona | `FIN-MONEDAS` | [`areas/finanzas.md` § Cómo fluye el dato](./areas/finanzas.md#cómo-fluye-el-dato) · `lib/metrics/compute-expenses-summary.ts` | |
| F-FIN-10 | El founder puede dar de alta, editar y borrar las plataformas donde cobra (Configuración → Pagos), que después se eligen al registrar un cobro | Funciona | — | [`areas/finanzas.md` § Pantallas y rutas](./areas/finanzas.md#pantallas-y-rutas) · `components/settings/payment-platforms-settings-section.tsx` | |
| F-FIN-11 | El founder puede conectar su cuenta de Stripe para ver cobros y saldo | A medias | `FIN-STRIPE-MP-DECIDIR` | [`areas/finanzas.md` § Integraciones externas](./areas/finanzas.md#integraciones-externas) · `app/api/integrations/stripe/callback/route.ts` | |
| F-FIN-12 | El founder puede conectar Mercado Pago; el sistema mantiene la conexión viva cada día y recibe sus avisos de pago | A medias | `FIN-STRIPE-MP-DECIDIR`, `FIN-MP-WEBHOOK` | [`areas/finanzas.md` § Integraciones externas](./areas/finanzas.md#integraciones-externas) · `app/api/webhooks/mercadopago/route.ts` | |

### Prometido y no existe

- **Stripe, Wise y Mercado Pago alimentando Finanzas** (`docs/archivo/ESTADO_PLATAFORMA.md` § Próximos pasos): no existe. Stripe y Mercado Pago se pueden conectar sólo tipeando la URL (no se ofrecen en Integraciones) y ninguna pantalla muestra nada de ellas; Wise no existe. El registro interno de integraciones declara que traen pagos por webhook, y no es cierto.
- **Tarjeta "Balance por plataforma"** (`ESTADO_PLATAFORMA.md` § Finanzas y Gastos): existe distinto: se muestra lo cobrado por plataforma sumando los cobros cargados a mano, no el saldo real de la cuenta.
- **Cada número de Finanzas se agrega en la moneda de la organización y se agrupa por su zona horaria** (`docs/specs/ONBOARDING_PLAN.md` § A1): no existe. Se suman pesos y dólares como si fueran la misma moneda (`FIN-MONEDAS`) y el mes de la liquidación se corta en hora UTC (`FIN-MESES-UTC`).
- **Comisiones atribuidas por closer en cada venta** (`ESTADO_PLATAFORMA.md` § Mejoras post-Phase 1): existe distinto: la comisión por venta se asigna matcheando el nombre del closer; la comisión "por agenda" no es del setter sino de todas las agendas de la cuenta, y "Gastos de equipo" y "Liquidación" dan números distintos (`FIN-PAYROLL-BASES`).
- **Webhook de Mercado Pago que registra los pagos**: existe distinto: sólo actualiza la fecha de última sincronización; el pago no se guarda (`FIN-MP-WEBHOOK`).

### Legacy visible

- Las rutas de conexión de Stripe y Mercado Pago siguen respondiendo por URL aunque no se ofrecen, y el refresco diario de tokens de Mercado Pago sigue corriendo sin cuentas conectadas (`FIN-STRIPE-MP-DECIDIR`).

---

## Producto

La definición de lo que vende el negocio: el cliente ideal (avatar), las ofertas con su precio y lugar en la
escalera de valor, la oferta principal, la propuesta de valor y los guiones de venta. No vende ni cobra: es el
contexto con el que razona el agente de negocio, y lo que piden el onboarding y Lanzamientos. Lo carga el founder.

Doc técnico: [`docs/areas/producto.md`](./areas/producto.md)

| ID | Funcionalidad | Estado | Pendientes que la afectan | Evidencia | Octubre |
|---|---|---|---|---|---|
| F-PRO-01 | El founder puede crear, editar y borrar avatares (dolores, deseos, miedos, objeciones, datos demográficos) y marcar uno como principal | Funciona | `PRODUCTO-UNICIDAD`, `PERMISOS-SERVER-ACTIONS/ops-fin-prod` | [`areas/producto.md` § Cómo fluye el dato](./areas/producto.md#cómo-fluye-el-dato) · `app/(platform)/product/page.tsx` | |
| F-PRO-02 | El founder puede abrir la ficha de un avatar con insights cruzados con ventas | A medias | `PRODUCTO-METRICAS` | [`areas/producto.md` § Reglas de negocio](./areas/producto.md#reglas-de-negocio-y-decisiones-no-obvias) · `app/(platform)/product/avatar/[id]/page.tsx` | |
| F-PRO-03 | El founder puede crear, editar y borrar ofertas (tipo, precio, moneda, modalidad de cobro, bonos, garantía, avatar al que apunta) | Funciona | `PERMISOS-SERVER-ACTIONS/ops-fin-prod` | [`areas/producto.md` § Cómo fluye el dato](./areas/producto.md#cómo-fluye-el-dato) · `app/(platform)/product/offer/[id]/page.tsx` | |
| F-PRO-04 | El founder puede ver estadísticas por oferta: clientes, ingresos del mes, tasa de cierre y objeción principal | A medias | `PRODUCTO-METRICAS` | [`areas/producto.md` § Reglas de negocio](./areas/producto.md#reglas-de-negocio-y-decisiones-no-obvias) · `lib/product/offer-metrics.ts` | |
| F-PRO-05 | El founder puede armar la escalera de valor: ordenar las ofertas, editar cada escalón y marcar cuál es la oferta principal | Funciona | `PRODUCTO-VALUE-LADDER-TABLA`, `PRODUCTO-UNICIDAD` | [`areas/producto.md` § Reglas de negocio](./areas/producto.md#reglas-de-negocio-y-decisiones-no-obvias) · `app/(platform)/product/value-ladder/page.tsx` | |
| F-PRO-06 | El founder puede escribir y guardar la propuesta de valor en cuatro campos (a quién, qué resultado, qué dolor saca, en cuánto tiempo) | Funciona | — | [`areas/producto.md` § Pantallas y rutas](./areas/producto.md#pantallas-y-rutas) · `app/(platform)/product/proposition/page.tsx` | |
| F-PRO-07 | El founder puede cargar, editar y borrar frameworks de venta (guiones, manejo de objeciones, seguimiento, onboarding) | Funciona | — | [`areas/producto.md` § Cómo fluye el dato](./areas/producto.md#cómo-fluye-el-dato) · `components/product/sales-frameworks-section.tsx` | |
| F-PRO-08 | El founder puede ver su negocio como un grafo (avatares, ofertas, frameworks) y acomodar los nodos; la posición se guarda | Funciona | `PRODUCTO-GRAFO-NOMBRE` | [`areas/producto.md` § Cómo fluye el dato](./areas/producto.md#cómo-fluye-el-dato) · `components/product/graph-view.tsx` | |
| F-PRO-09 | El founder puede alternar entre la vista de grafo, la espacial y la de detalle | Funciona | — | [`areas/producto.md` § Pantallas y rutas](./areas/producto.md#pantallas-y-rutas) · `components/product/product-module.tsx` | |
| F-PRO-10 | El founder puede pedirle a la IA que proponga avatar, ofertas, frameworks y propuesta de valor a partir de sus llamadas de Fathom, SOPs y documentos, revisarla y aplicarla | Funciona | — | [`areas/producto.md` § Cómo fluye el dato](./areas/producto.md#cómo-fluye-el-dato) · `components/product/product-rag-suggest.tsx` | |
| F-PRO-11 | El sistema le pasa al agente de negocio el avatar principal, hasta 5 ofertas activas, hasta 5 frameworks activos y la propuesta de valor; avatares, ofertas y frameworks se reindexan en su memoria cada vez que se guardan (al borrar un avatar o una oferta no se reindexa hasta el próximo guardado) | Funciona | — | [`areas/producto.md` § Cómo fluye el dato](./areas/producto.md#cómo-fluye-el-dato) · `lib/ai/org-context.ts` | |
| F-PRO-12 | El agente de negocio puede proponer altas o cambios en el grafo y el founder los aprueba o rechaza desde el chat | Funciona | — | [`areas/producto.md` § Modelo de datos](./areas/producto.md#modelo-de-datos) · `app/agent/graph-proposal-actions.ts` | |
| F-PRO-13 | El sistema guarda como oferta principal y avatar principal lo que el founder completa en el onboarding | Funciona | `PRODUCTO-GATE-OFERTA-DUP` | [`areas/producto.md` § Cómo fluye el dato](./areas/producto.md#cómo-fluye-el-dato) · `app/onboarding/actions.ts` | |
| F-PRO-14 | El sistema ofrece las ofertas cargadas para elegirlas al crear un lanzamiento | Funciona | — | [`areas/producto.md` § Cómo fluye el dato](./areas/producto.md#cómo-fluye-el-dato) · `app/lanzamientos/actions.ts` | |
| F-PRO-15 | El sistema muestra Producto en el menú sólo a las cuentas con ese add-on, y lo bloquea para los roles sin acceso a Operaciones | Funciona | `OPS-ADDONS-SOLO-MENU`, `PERMISOS-SERVER-ACTIONS/ops-fin-prod` | [`areas/producto.md` § Pantallas y rutas](./areas/producto.md#pantallas-y-rutas) · `lib/navigation/module-for-path.ts` | |

### Prometido y no existe

- **Escalones de la escalera de valor como entidad propia, vinculados a productos** (`docs/archivo/OPERATIONAL_NOTES.md` § Producto, tabla `value_ladder`): no existe en la práctica. La tabla está, pero nada la llena; la escalera es la lista de ofertas ordenada (`PRODUCTO-VALUE-LADDER-TABLA`).
- **Insights de IA del avatar a partir de datos reales de ventas** (`docs/archivo/pending-features-audit.md` § Avatar): no existe. Los "insights" repiten las objeciones cargadas en el propio avatar; la objeción frecuente de ventas nunca se carga (`PRODUCTO-METRICAS`).
- **Tasa de cierre y cierres por mes por oferta o por escalón** (`pending-features-audit.md` § Escalera de valor): existe distinto: la tasa de cierre que se muestra es la de toda la cuenta, no la de la oferta, y los clientes se asocian a la oferta por el nombre (renombrar una oferta le borra la historia).

---

## Discord

Un bot que lee los canales del servidor de Discord donde el negocio tiene a sus alumnos o clientes. Guarda lo que escriben, lo asigna a cada cliente del CRM y con eso muestra quién está activo y quién se quedó callado, detecta testimonios para convertirlos en casos de éxito y propone hitos del recorrido del cliente. Lo configura el founder desde Integraciones → Discord; el bot no responde preguntas ni modera.

Doc técnico: [`docs/areas/discord.md`](./areas/discord.md)

| ID | Funcionalidad | Estado | Pendientes que la afectan | Evidencia | Octubre |
|---|---|---|---|---|---|
| F-DIS-01 | El founder puede conectar su servidor de Discord desde Integraciones (instala el bot y queda asociado a su organización) | Sin verificar | `DISCORD-SIN-PROBAR`, `DISCORD-PERMISOS`, `E-RETENCION`, `REPO-RENOMBRADO-DEPLOYS` | [`areas/discord.md` § Pantallas y rutas](./areas/discord.md#pantallas-y-rutas) · `app/api/integrations/discord/callback/route.ts` | |
| F-DIS-02 | El founder puede desconectar Discord | A medias | `DISCORD-DESCONECTAR-SIN-UI`, `DISCORD-PERMISOS` | [`areas/discord.md` § Pantallas y rutas](./areas/discord.md#pantallas-y-rutas) · `app/discord/actions.ts` (`disconnectDiscordIntegrationAction` existe pero ningún botón la llama; la tarjeta no ofrece desconectar) | |
| F-DIS-03 | El founder elige qué canales se leen, y marca cada uno como "comunitario" o "de un cliente" (con sus dueños) y si es canal de logros | Sin verificar | `DISCORD-SIN-PROBAR`, `DISCORD-PERMISOS` | [`areas/discord.md` § Configuración](./areas/discord.md#configuración-appdiscordactionsts) · `app/(platform)/integrations/discord/page.tsx` | |
| F-DIS-04 | El sistema empieza a leer solo los canales nuevos cuyo nombre sigue un patrón (por defecto `cliente-`) y saluda pidiendo `!vincular` | Sin verificar | `DISCORD-SIN-PROBAR` | [`areas/discord.md` § Canal nuevo](./areas/discord.md#canal-nuevo-eventschannelcreatets) · `apps/discord-bot/src/events/channelCreate.ts` | |
| F-DIS-05 | El sistema guarda los mensajes de los canales leídos y los asigna a un cliente: por la persona vinculada o, si no, por el dueño único del canal; lo que escribe el equipo no se asigna | Sin verificar | `DISCORD-SIN-PROBAR`, `E-RETENCION`, `DISCORD-BOT-SIN-TESTS` | [`areas/discord.md` § Mensaje nuevo](./areas/discord.md#mensaje-nuevo-appsdiscord-botsrchandlersmessage-handlerts) · `apps/discord-bot/src/handlers/message-handler.ts` | |
| F-DIS-06 | Un alumno puede vincularse a su ficha de cliente escribiendo `!vincular su-email` en el servidor | Con fallas | `DISCORD-VINCULAR-EMAIL-AJENO`, `DISCORD-VINCULO-SIN-REATRIBUIR`, `DISCORD-BOT-SIN-TESTS` | [`areas/discord.md` § !vincular email](./areas/discord.md#vincular-email-link-handlerts) · `apps/discord-bot/src/handlers/link-handler.ts` | |
| F-DIS-07 | El founder resuelve desde un buzón los `!vincular` que no encontraron cliente (asignar a mano o descartar) | Con fallas | `DISCORD-VINCULO-SIN-REATRIBUIR`, `DISCORD-PERMISOS` | [`areas/discord.md` § Configuración](./areas/discord.md#configuración-appdiscordactionsts) · `components/integrations/discord-settings.tsx` | |
| F-DIS-08 | El founder ve quiénes escribieron en cada canal sin estar asociados, con una sugerencia de a qué cliente o miembro del equipo corresponden, y los asocia o marca como equipo (los mensajes viejos se reasignan) | Sin verificar | `DISCORD-SIN-PROBAR`, `DISCORD-PERMISOS` | [`areas/discord.md` § Configuración](./areas/discord.md#configuración-appdiscordactionsts) · `components/integrations/discord-channel-card.tsx` | |
| F-DIS-09 | El equipo ve en la ficha y en la lista de clientes la actividad de Discord de cada uno y una alerta cuando el cliente lleva 14 días sin escribir | Sin verificar | `DISCORD-SIN-PROBAR`, `DISCORD-VINCULO-SIN-REATRIBUIR` | [`areas/discord.md` § Actividad y silencio](./areas/discord.md#actividad-y-silencio-libdiscordactivityts-puro) · `components/clients/client-discord-activity.tsx` | |
| F-DIS-10 | El sistema detecta testimonios en los canales de logros y los propone como casos de éxito (wins) para que alguien los acepte | Sin verificar | `DISCORD-SIN-PROBAR`, `DISCORD-BOT-SIN-TESTS` | [`areas/discord.md` § Mensaje nuevo](./areas/discord.md#mensaje-nuevo-appsdiscord-botsrchandlersmessage-handlerts) · `components/clients/wins/win-candidates.tsx` | |
| F-DIS-11 | El sistema clasifica cada día con IA los mensajes nuevos (sentimiento, resumen, si requiere atención) y propone hitos del recorrido del cliente | Sin verificar | `DISCORD-SIN-PROBAR`, `1A1-CLAVE-ANTHROPIC-ROTA` | [`areas/discord.md` § Cómo fluye el dato](./areas/discord.md#cómo-fluye-el-dato) · `app/api/cron/daily-signals/route.ts` | |
| F-DIS-12 | El founder puede ponerle al bot un nombre y una foto propios en su servidor | Sin verificar | `DISCORD-PERFIL-SIN-PROBAR` | [`areas/discord.md` § Perfil del bot](./areas/discord.md#perfil-del-bot-libdiscordprofilets) · `components/integrations/discord-settings.tsx` | |
| F-DIS-13 | El founder puede poner el bot en modo silencioso: sigue leyendo pero no escribe nada en el servidor | Sin verificar | `DISCORD-SIN-PROBAR` | [`areas/discord.md` § Reglas de negocio y decisiones no obvias](./areas/discord.md#reglas-de-negocio-y-decisiones-no-obvias) · `components/integrations/discord-settings.tsx` | |

### Prometido y no existe

- **El bot manda cada mensaje a la aplicación (`/api/discord/message`), que lo guarda y lo clasifica al momento** (`docs/archivo/PHASE_2.md` § API y endpoints): **existe distinto**. El bot escribe directo en la base; la clasificación corre una vez por día; `/api/discord/message` quedó como un endpoint vacío (`DISCORD-STUB-MESSAGE`).
- **Clasificación por categoría (avance, testimonio, pregunta, problema) con motivo de la alerta** (`docs/archivo/PHASE_2.md` § Clasificación): **existe distinto**. Se guarda sentimiento, resumen, "requiere atención" y si es testimonio; no hay categoría ni motivo.
- **Pantalla `/clients/testimonials` para marcar testimonios usados o destacados y exportarlos a marketing** (`docs/archivo/PHASE_2.md` § Nuevo sub-módulo): **existe distinto**. Los testimonios aparecen como candidatos a win en Clientes → Wins; no hay export.
- **Alertas de Discord ("requiere atención") en la salud de clientes del super admin** (`docs/archivo/PHASE_2.md`, `docs/archivo/ESTADO_PLATAFORMA.md`): **no existe**. El marcador sólo se ve en la actividad de la ficha.
- **Testimonio detectado también por palabras clave en cualquier canal o por un canal de propósito "testimonios"** (`docs/archivo/PHASE_2.md` § Detección de testimonios): **existe distinto**. Sólo se buscan en canales marcados "de logros", con un pre-filtro de palabras y largo.

### Legacy visible

- `/api/discord/message` responde "ok" sin hacer nada y nadie lo llama (`DISCORD-STUB-MESSAGE`).
- Los nombres de variables `OTC_*` siguen aceptándose como respaldo en el bot y en la web (`REBRAND-EXTERNO`).
