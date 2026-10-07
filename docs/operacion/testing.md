# Testing

> Verificado contra el código el 2026-09-23 (commit 038caca). Backlog de tests: `PENDIENTES.md` § Infraestructura (ítems con **Tipo: tests**); el de Embudos está en su área.

## Qué hay

| Capa | Herramienta | Dónde | Corre en CI |
|---|---|---|---|
| Tipos | `tsc --noEmit` | `apps/web`, `packages/ui`, `packages/types`, `apps/discord-bot` | sí (`pnpm typecheck`) |
| Lint | ESLint 9 (`next lint` en web, `eslint src/` en ui) | `apps/web`, `packages/ui` | sí (`pnpm lint`) |
| Unitarios | Vitest 3, entorno `node` | `apps/web` (200 archivos) | sí (`pnpm test`) |
| E2E | Playwright | `apps/web/e2e/` (1 spec) | **no** |
| Migraciones | Postgres 17 + pgvector desde cero | `supabase/ci/check-migrations.sh` | sí (job `migrations`) |
| RLS | SQL: cada test actúa como distintos usuarios sobre la base recién armada | `supabase/ci/tests/*.sql` | sí (job `migrations`, paso 5) |
| Build | `next build` | — | **no** (lo hace Vercel en el preview) |

`apps/reel-worker` no declara `typecheck` ni `lint`: el CI no lo compila. `packages/*` no tienen tests.

## Cómo se corre

```bash
pnpm typecheck                     # todo el monorepo vía turbo
pnpm lint
pnpm test                          # sólo apps/web declara test
cd apps/web && pnpm test           # vitest run
cd apps/web && pnpm test:watch     # modo watch
cd apps/web && pnpm exec vitest run lib/funnels   # una carpeta

# typecheck directo, como pide CLAUDE.md
cd apps/web && node node_modules/typescript/bin/tsc --noEmit

# E2E (necesita la app corriendo y una cuenta holding de prueba)
cd apps/web
E2E_HOLDING_EMAIL=... E2E_HOLDING_PASSWORD=... pnpm exec playwright test
pnpm exec playwright test --ui

# Migraciones contra un Postgres con pgvector
PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres supabase/ci/check-migrations.sh
```

## Convenciones

| Regla | Detalle |
|---|---|
| Ubicación | `lib/<dominio>/__tests__/<archivo>.test.ts`, junto al código. `vitest.config.ts` incluye `**/*.test.ts` de toda la app (antes era sólo `lib/**` y un test afuera no corría sin avisar); excluye `e2e/**`, `.next`, `dist`, `node_modules` |
| Entorno | `node`. Se testea **lógica pura**; un componente sin hooks se puede probar renderizándolo con `renderToStaticMarkup` (`components/shared/__tests__/campo-fecha.test.ts`; `vitest.config.ts` compila JSX con el runtime automático). Los flujos de UI van a Playwright |
| Fechas y zona horaria | Un test de fechas arma los instantes en UTC (`new Date("2026-10-02T01:00:00Z")` son las 22:00 de Argentina) y fija la zona del proceso con `conZona` (`lib/fechas/__tests__/zona.ts`), que comprueba que el cambio hizo efecto. Así falla con el código viejo en cualquier máquina. Para la regla "el hoy de un dato de la org es el de la org", el caso típico es un miembro en otra zona: el proceso en `Europe/Madrid` y la org en Argentina. La zona del cliente sale de `ZonaDeLaOrganizacionProvider`: un componente que la usa se prueba simulando el provider (`vi.mock`) o envolviéndolo en el real (`providers/__tests__/zona-de-la-organizacion-provider.test.ts`). La suite tiene que pasar con `TZ=UTC`, `TZ=America/Argentina/Buenos_Aires` y `TZ=Pacific/Auckland` |
| Imports | explícitos (`import { describe, it, expect } from "vitest"`); `globals: false` |
| Alias | `@/` → `apps/web/` |
| Idioma | nombres de test en español |
| IO | No hay un helper compartido de stub de Supabase: los pocos tests que lo necesitan arman un objeto encadenable en el mismo archivo (`app/operations/__tests__`, `lib/fechas/__tests__/organizacion.test.ts`). Lo que depende de la base se testea, en lo posible, extrayendo la parte pura |
| Fixtures | no importar del código que se testea (ej. `lib/funnels/__tests__/document-fixture.ts`) |
| Validez | después de escribir un test, romper el código a propósito y confirmar que falla |
| Hallazgos | si un test encuentra un bug, no arreglarlo en el mismo commit: `it.fails`/`it.skip` con comentario + ítem en `PENDIENTES.md` |

### Tests de RLS (`supabase/ci/tests/`)

Prueban lo que la base deja hacer a cada usuario, que Vitest no puede ver porque ningún test toca Supabase. Los corre `check-migrations.sh` después de aplicar todas las migraciones, en orden de nombre.

- `00_ayudas.sql` crea el schema `ci` con `ci.jwt(sub, extra)` (deja el JWT de un usuario para la transacción), `ci.rechazado(sql, qué)` (tiene que fallar con 42501), `ci.filas(sql)` (filas tocadas: la RLS en UPDATE y DELETE no da error, afecta 0) y `ci.espera(real, esperado, qué)`.
- Cada archivo arma sus datos dentro de `begin; ... rollback;`, actúa con `select ci.jwt(...); set local role authenticated;` y vuelve con `reset role`.
- Un archivo por arreglo, con el ID de Jira y del backlog en el encabezado (`10_vistas_sin_escritura.sql` es SCRUM-9). Hoy son 10 (`00_ayudas.sql` a `90_corridas_de_procesos.sql`, SCRUM-85: el registro de corridas sólo para el service role y sus checks de coherencia).
- Validez, igual que en Vitest: sacar la migración que arregla el problema y confirmar que el test falla con `FALLA: ...`.
- Para correrlos a mano: los mismos comandos de "Migraciones" más arriba.

Qué no testear en Vitest: componentes React con estado o efectos, actions que sólo hacen `select`, wrappers de SDKs externos, constantes sin lógica.

## Cobertura actual por área

Archivos de test y casos declarados (`it`/`test`; el runner reporta más por los `it.each`). Total: **200 archivos, ~2.013 casos** (recontado el 2026-10-07 con el fix-pack de SCRUM-85; el runner ejecuta 2.330 por los `it.each`; la tabla lista todas las carpetas con tests y suma ese total). No hay medición de cobertura (`@vitest/coverage-v8` no está instalado).

| Carpeta | Archivos | Casos | Qué cubre |
|---|---|---|---|
| `lib/funnels` | 10 | 186 | motor de embudos puro: compute, spine, períodos, KPIs, fuentes, conformidad de plantillas |
| `lib/fathom` | 22 | 226 | match con turnos, contraparte, identidades, links compartidos, ventana de sync, reclamo de trabadas, cliente de la org (filtro por organización), día de cada llamada, días desde la última 1-1 y fecha de la llamada en la zona de la org (incluido el llamador real con la base simulada), cursor y lectura de la ventana con presupuesto, plazo y orden rotativo del cron, fallas de sync registradas y las dos corridas de la sync de la org |
| `lib/checkpoints` | 7 | 105 | recorrido del cliente, etapas, propuestas, trabados (vence y atraso en días de la zona de la org), fecha de un hito en la zona de la org y validación "no futura" por día (incluidas UTC+12 y UTC-6) |
| `lib/custom-fields` | 7 | 85 | campos configurables: validación, merge, formato, alertas por fecha |
| `lib/payments` | 5 | 85 | normalización Whop/Commas, firmas, agregados, retención |
| `lib/clients` | 10 | 102 | próxima tarea (vencida con el hoy de la org, también para un miembro en otra zona), facturación, satisfacción, señales, sub-clientes, revisión semanal, fecha de alta por defecto del import de Excel, día de la 1-1 en el prompt de tareas, días que le quedan al programa |
| `lib/fechas` | 2 | 39 | fechas calendario: hoy en una zona, suma de días (fin de mes, año y horario de verano), días entre dos fechas, vencida (sólo `YYYY-MM-DD`), valor guardado leído en la zona de la org (ida y vuelta), formato de fecha guardada, mediodía e inicio de una fecha en una zona, día de un instante real, zona de la organización con fallback |
| `lib/onboarding` | 4 | 61 | derivación, gate de routing, ítems, tours |
| `lib/discord` | 5 | 60 | actividad, canales, clasificador, perfil, identidades |
| `lib/ghl` | 5 | 45 | estados de turno, eventos de oportunidad, transiciones, verificación de webhook, fecha de alta de un contacto en la zona de la org |
| `lib/sales` | 3 | 50 | opciones de seguimiento (incluida la fecha propuesta del próximo paso), hilo del lead (el próximo paso vence por día en la zona de la org), rango de métricas de ventas en días de la org (miembro en Madrid) |
| `lib/wins` | 2 | 34 | consentimiento, caso derivado |
| `lib/super-admin` | 6 | 54 | plan de bajas, progreso de onboarding, chequeo de super admin en las lecturas con service role, estado de la org alineado con la base (incluido el desconocido) y la última corrida de cada cron en Infraestructura (en curso, sin cierre, parcial con los nombres de las orgs, falló, encolado en los crons con fan-out, desempate por `fin`, guard de super admin) |
| `lib/client-onboarding` | 3 | 25 | formulario por link |
| `lib/sops` | 2 | 25 | marcadores de adjuntos, chunks de audio |
| `lib/auth` | 7 | 42 | redirect seguro, límite de login, cuenta desactivada, rol de la org, permisos sin log, un solo chequeo de super admin por pedido, acceso a un módulo por ruta |
| `lib/integrations` | 2 | 28 | `health.ts` y completitud del registro |
| `lib/vturb` | 2 | 23 | normalización de stats, período cerrado |
| `lib/metrics` | 8 | 83 | etapas del embudo de ventas, match de closer, períodos y prorrateo, ingresos por fecha, resumen de Finanzas, serie de 6 meses (varias zonas horarias), gráfico de ingresos del Panel con el hoy de la org, fechas por defecto del import de métricas |
| `lib/closing` | 1 | 20 | estado de llamadas |
| `constants` | 2 | 16 | módulos de permisos |
| `lib/navigation` | 2 | 23 | módulo por path, metadata de página |
| `lib/marketing` | 8 | 74 | snapshot de métricas de anuncios, cola del cron de métricas de contenido (prioridades, espera, historias vencidas), promedios, rankings y orden de la grilla sin ceros inventados, prompt de patrones |
| `lib/webinarjam` | 1 | 13 | normalización de registrantes |
| `lib/executive-reports` | 3 | 20 | cadencias, mes que toma el reporte mensual y mensaje del botón de reportes |
| `lib/hyros` | 1 | 11 | resolución de atribución |
| `lib/zernio` | 5 | 27 | triggers de comentarios, integración por org, métricas que se guardan, filas de la sync, status de los errores HTTP y timeout |
| `lib/security` | 3 | 28 | cifrado, comparación en tiempo constante |
| `lib/workboard` | 2 | 8 | filtro por responsable, día de una tarea sin vencimiento en la zona de la org |
| `lib/chart` | 1 | 5 | escala del embudo |
| `lib/supabase` | 2 | 6 | rutas públicas del middleware, `fetchAllRows` |
| `lib/release` | 1 | 4 | lo escondido para el release: ⌘K, catálogo de integraciones, canales de Lead Magnets |
| `lib/observability` | 5 | 67 | aviso a Sentry de los crons; registro de corridas en `corridas_de_procesos` (ok, encolado, fallo, parcial con las orgs fallidas, una falla o una base colgada del registro no rompe el cron, apertura lenta sin fila fantasma, retención de 30 días, mensaje de error saneado también con claves compuestas, corridas en paralelo sin mezclarse) y chequeo de salud (estados, plazo de 3 s, versión, variables, una sola medición para muchos pedidos) (SCRUM-85); etiquetas de una falla de proceso de fondo o de server action (SCRUM-497); lo que se saca de un evento o transacción antes de mandarlo (cuerpo, cookies, query también en nombres de transacciones y spans, headers fuera de la lista blanca, breadcrumbs de consola), las configs de Sentry con el SDK simulado y las copias del reel-worker y del bot; un objeto plano reportado con su `message` y su `code` (SCRUM-501) |
| `lib/storage` | 1 | 6 | validación de rutas por org |
| `lib/server` | 1 | 13 | errores de las server actions: sólo un `ErrorEsperable` vuelve con su mensaje en los módulos arreglados y lo demás se registra, va a Sentry y vuelve con el texto fijo; `runMutation` no cambia el mensaje pero reporta las fallas de infraestructura (clasificación por clase, `code` y texto) |
| `lib/queue` | 2 | 5 | aviso cuando falla un trabajo de QStash; las orgs de un fan-out quedan en el registro de corridas |
| `lib/unipile` | 2 | 5 | secreto del webhook |
| `lib/intelligence` | 2 | 15 | organizaciones sobre las que corren los crons de IA y el chequeo de la org al procesarla (generadores, workers, modo en serie) |
| `lib/youtube` | 1 | 2 | métricas de video que se guardan |
| `lib/team` | 2 | 14 | rol de la org (filtro por organización), estado de una invitación y comparación de emails |
| `app/__tests__` | 3 | 12 | los catch de páginas y layouts relanzan los errores de Next (`unstable_rethrow`); el layout de la plataforma y las páginas de Inteligencia dibujan «No tenés acceso» sin lanzar |
| `app/fathom` | 2 | 6 | `getSalesCallsAction` contra una base simulada; la lista de 1-1 de la ficha con el día de la org y una sola lectura de la zona |
| `app/executive-reports`, `app/operations` | 4 | 35 | últimos reportes; el botón de reportes y el reporte de Operaciones no llaman a la IA para una org no activa; las acciones de Operaciones (reporte semanal e inputs) devuelven sus errores esperables como valor, relanzan lo inesperado (sin sesión o redirect) y filtran por organización |
| `lib/operations` | 2 | 10 | mensaje del botón de Inputs semanales, cómo cuenta el pipeline el paso de Operaciones y el lunes de la semana de la organización |
| `lib/client` | 1 | 12 | cómo los componentes corren las server actions (`correr-accion.ts`): mensaje devuelto, texto fijo y consola ante un error inesperado, un redirect no avisa, espera un `alExito` asíncrono, y la capa que devuelve el dato o lanza (`datoDeLaMutacion`) |
| `providers` | 1 | 5 | zona de la organización en el cliente (`ZonaDeLaOrganizacionProvider`): un miembro en Madrid ve el día de la org; el hoy es null en el render del servidor |
| `components/shared` | 1 | 10 | `CampoFecha`: muestra lo guardado sin correrlo de día (en la zona de la org si se le pasa) y emite la fecha elegida |
| `lib/agent` | 3 | 8 | tools de contenido del agente con piezas sin métricas, fechas que lee el agente en la zona de la org |
| `lib/ai` | 3 | 15 | aviso de la clave de IA, clave rechazada o sin créditos, resolución de la credencial de la org |
| `lib/calendly` | 1 | 11 | firma del webhook |
| `lib/forms` | 1 | 6 | paginación de respuestas de Typeform |
| `lib/webhooks` | 1 | 22 | status HTTP de la ingesta y webhooks que no pierden el evento crudo |
| `app/api/health` | 1 | 8 | `GET /api/health`: 200 `ok`, 200 `degradado` (Storage o una variable), 503 con la base caída o colgada, sin caché y sin mensajes, tablas, variables ni valores en la respuesta (SCRUM-85) |
| `components/super-admin` | 1 | 6 | la página de Infraestructura muestra el chequeo de salud y las corridas reales (un fan-out como Encolado, no OK), sin los estados escritos a mano |
| `app/api/integrations` | 3 | 14 | callbacks OAuth (sesión y organización), cron de sync de Fathom (plazo y orden), webhook de Fathom por miembro |
| `app/marketing/content` | 1 | 4 | contenido con mejor rendimiento sobre todas las piezas de la org |
| `app/auth` | 2 | 11 | el login vuelve a la invitación; el cambio de contraseña obligatorio devuelve sus errores esperables como valor (incluidos los rechazos de Supabase Auth: misma contraseña, débil, sesión, intentos) |
| `app/invite`, `app/intelligence` | 2 | 10 | la página de invitación sin crear cuentas; el resumen de Inteligencia rechaza como valor a quien no tiene Operaciones |
| `app/clients`, `app/closing` | 3 | 37 | las mutaciones de Clientes y la de Closing devuelven sus errores esperables como valor, filtran por organización y no muestran crudo lo inesperado (lo registran y reportan); Closing trae todos los turnos de la org |
| `app/team`, `app/(platform)/team` | 4 | 31 | aceptar una invitación con la sesión; las lecturas de Equipo devuelven sus errores como valor y filtran por organización; `/team` muestra el motivo en vez de la pantalla de error de Next; un rol con nombre repetido vuelve con su mensaje |

**Sin ningún test:** `lib/agent` (compaction, JIT, streaming; sólo las tools de contenido y las fechas de `get_clients_data` tienen test), `lib/ai` (`wrap-untrusted-content`; la clave de la org sí tiene test), `lib/rag`, `lib/auth` (bootstrap), `lib/holding`, `lib/calendly` (salvo la firma del webhook), `lib/typeform`, `lib/mercadopago`, `lib/stripe`, `lib/utm`, `lib/product`, `lib/business-context`, `lib/intelligence` (generación del informe), `lib/finance`, `lib/rate-limit.ts`, `lib/sanitize.ts`, `lib/format.ts`, `lib/validations.ts`, las funciones de `lib/metrics` que alimentan el Panel (`derive-dashboard-data.ts`, salvo el gráfico de ingresos), los gastos y las métricas de ventas, y los parsers de import de clientes (salvo la fecha por defecto). Route handlers y Server Actions tienen pocos tests: los workers de IA (`lib/intelligence/__tests__/org-pausada-al-procesar.test.ts`), `getSalesCallsAction` (`app/fathom/__tests__`), las actions de reportes a pedido (`app/executive-reports/__tests__`, `app/operations/__tests__`), las de Clientes, Closing, Equipo, Inteligencia y el cambio de contraseña obligatorio (`app/clients`, `app/closing`, `app/team`, `app/intelligence`, `app/auth`), y las páginas de `app/__tests__`, `/team` e `/invite`.

### E2E

`apps/web/e2e/holding.spec.ts` (6 tests: dashboard del holding, dropdown de negocios, entrar/salir de un negocio, agente, clientes) con `auth.setup.ts`, que guarda la sesión en `e2e/.auth/holding.json`. Necesita `E2E_HOLDING_EMAIL`, `E2E_HOLDING_PASSWORD` y opcionalmente `E2E_BASE_URL` (default `http://localhost:3000`); el `webServer` está comentado, así que la app tiene que estar levantada. En CI (`CI=1`) usa 2 reintentos y 1 worker, pero el workflow no lo invoca.

## CI

`.github/workflows/ci.yml`, en push a `main`, `claude/**`, `Claude-*`, `feat/**`, `fix/**`, `chore/**` y en todo PR, con `concurrency` que cancela corridas viejas de la misma ref.

| Job | Pasos |
|---|---|
| `checks` | checkout → pnpm 9.15.0 → Node 20 con caché de pnpm → `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm test` |
| `migrations` | servicio `pgvector/pgvector:pg17` → `supabase/ci/check-migrations.sh` (nombres, versiones únicas, las 191 desde cero y los 10 archivos de tests de RLS) |

No corre `next build`, Playwright ni nada de `apps/reel-worker`. No hay branch protection configurada en el repo (no verificable desde el código).

Aparte del CI, `.github/workflows/produccion-al-dia.yml` (SCRUM-85) no prueba código: después de cada push a `main` y una vez por día comprueba que producción tenga desplegado el commit de `main` ([`alertas.md`](./alertas.md) § Producción desactualizada).

## Backlog

Lo abierto del backlog de tests viejo (`docs/archivo/TESTING_BACKLOG.md`), depurado contra el código, está en `PENDIENTES.md` § Infraestructura con **Tipo: tests** (IDs `T-1`…`T-24` y `T-INFRA-*`, salvo `T-6`…`T-8`, que están en Embudos). Prioridades: primero lo que toca plata (`T-1`–`T-5`), después agente/BYOK/RAG y la infraestructura de mocks de Supabase.

## Archivos clave

- `apps/web/vitest.config.ts`, `apps/web/playwright.config.ts`
- `apps/web/e2e/{auth.setup.ts,holding.spec.ts,constants.ts}`
- `.github/workflows/ci.yml`, `supabase/ci/check-migrations.sh`
- `apps/web/lib/funnels/__tests__/templates.conformance.test.ts` (ejemplo de conformidad contra un documento fuente)
- `apps/web/lib/integrations/__tests__/health.test.ts`
- `apps/web/lib/supabase/__tests__/public-paths.test.ts`
