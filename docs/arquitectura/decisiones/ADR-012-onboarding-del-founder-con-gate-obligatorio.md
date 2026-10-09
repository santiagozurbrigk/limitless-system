# ADR-012 — Onboarding del founder con gate obligatorio de 3 pasos y checklist derivado

- **Estado:** Aceptada con deuda
- **Fecha:** 2026-08-31 — decisiones cerradas con Santiago en `docs/specs/ONBOARDING_PLAN.md` §5;
  `docs/historial/CHANGES-2026-07-a-08.md` "Plan de onboarding guiado para cuentas nuevas" y "Onboarding Fase 1: el
  gate de tres pasos (migraciones aplicadas)". Merge en `f6ae41e2` (PR #34).

## Contexto

- Hubo un wizard de onboarding del founder en `/onboarding` desde la Fase 0 (`app/onboarding/page.tsx`, commit
  `ebdf5036`, 2026-05-26). El **2026-08-11** se eliminó entero "por
  decisión de producto" (entrada "Eliminar wizard de onboarding de founder", commit `acb2499`): "Los usuarios ahora
  entran directo al dashboard después del login". **El motivo de esa eliminación no quedó escrito.** Quedaron
  huérfanos `WelcomeGate`/`CinematicWelcome` y los datos de `onboarding_responses` de las orgs founder.
- Veinte días después, el relevamiento del plan encontró que una cuenta nueva "entra a un panel vacío" y que había
  datos cuya ausencia **contamina hacia adelante**: moneda y zona horaria ("cada número de Finanzas, Embudos, Anuncios
  y los reportes ejecutivos se agrega en esa moneda y se agrupa por esa zona"), y lo que el agente lee en cada llamada
  (`getOrgContext()`: oferta principal y avatar).
- Además, `organizations.currency` nacía con default `'USD'` y `timezone` con Buenos Aires: una org nueva parecía
  "configurada" con un valor que para un cliente que cobra en pesos es directamente el equivocado.

## Decisión

1. **Gate duro de 3 pasos** para el founder de una org nueva: identidad y unidades del negocio (lo que decide: nombre,
   moneda, zona horaria), oferta principal y avatar principal. El middleware lo redirige a `/onboarding` (sin chrome)
   hasta que `onboarding_state.gate_completed_at` esté puesto. Criterio escrito: "¿qué pasa si esto falta o está mal,
   y el usuario lo descubre en el mes 2? Si se recalcula, no es obligatorio; si dejó el histórico mal etiquetado, sí".
2. **Sólo founders**, después del cambio de contraseña forzado, y no para holdings ni orgs con `skip_onboarding`. Los
   invitados reciben tours según sus permisos, sin gate.
3. **El progreso se deriva de las tablas reales, no se guarda.** Sólo se persiste lo no derivable
   (`gate_completed_at`, `dismissed_items`, `tours_seen`). El gate se cruza una vez; el checklist mira el estado
   actual (borrar la única oferta reabre el ítem pero no expulsa al usuario).
4. **Checklist persistente** en el panel y la notch nav para el resto (nivel B); tours contextuales con Driver.js;
   panel de progreso en `/super-admin/onboarding`.
5. **Salida de emergencia:** `organizations.skip_onboarding`, que marca el super admin.
6. Backfill: las orgs existentes quedaron eximidas (18 perfiles verificados, cero redirigidos). Se quitaron los
   defaults de moneda y zona (`20260831130000_organizations_drop_unit_defaults.sql`).

## Alternativas consideradas (spec §2, §3 y §5)

- **Todo en checklist, sin bloquear**: descartado; "dejaba entrar gente operando semanas con la moneda mal
  configurada, y eso es lo único que no se arregla retroactivamente".
- **Tabla con un booleano por paso** (`onboarding_progress`, la propuesta heredada): descartada porque "miente en
  cuatro casos que ya ocurren acá" (org nombrada por el super admin, Zernio conectado por fuera, histórico importado
  primero, oferta borrada después).
- **Librerías de flujo** (OnboardJS, React Joyride, Shepherd.js) vs construir el flujo: se construyó el flujo sin
  librería ("el estado tiene que salir de la base de datos") y se eligió Driver.js sólo para tours (0 dependencias,
  156 KB). OnboardJS estaba despublicado; su reemplazo era un release candidate.
- **Gate también para invitados**: descartado; no tienen permiso de `settings` ni `integrations` y quedarían
  encerrados.
- **Sin onboarding** (estado entre el 2026-08-11 y el 2026-08-31): reemplazado por esta decisión.

## Consecuencias

**Positivas**
- Toda org nueva arranca con moneda, zona, oferta y avatar reales; el agente tiene contexto desde el primer mensaje.
- Cero mutaciones duplicadas de fondo: los pasos envuelven las actions existentes de Ajustes y Producto.

**Negativas / deuda**
- **La única salida del gate es `skip_onboarding`, que no tiene botón** (hoy se setea por SQL):
  `[ONBOARDING-SKIP-SIN-UI]`.
- El gate suma una consulta al middleware por request de founder (pendiente medirlo).
- Reintentar el paso de oferta duplica el producto (`[PRODUCTO-GATE-OFERTA-DUP]`); el gate muestra moneda y zona ya
  elegidas, lo que debilita el motivo de bloquear (`[ONBOARDING-GATE-DEFAULTS-PRESELECCIONADOS]`).
- `loadOnboardingProgress` no validaba super admin por sí misma (`[SUPERADMIN-ONBOARDING-SIN-GUARD]`); resuelto el 2026-10-04 (SCRUM-111).
- Nada probado con sesión real de navegador (`[ONBOARDING-VERIFICAR]`).
- Hasta el 2026-10-09 cualquiera podía crearse una cuenta founder y pasar por el gate (`[SIGNUP-PUBLICO]`, cerrado en SCRUM-23).

## Evidencia

- `docs/specs/ONBOARDING_PLAN.md` (§1, §2, §3, §5 y "Estado de implementación"); `docs/areas/plataforma.md`
  § Onboarding del founder.
- `apps/web/lib/onboarding/{items,derive,resolve,gate-routing}.ts`, `apps/web/lib/supabase/middleware.ts`
  (`shouldRedirectToGate`), `apps/web/app/onboarding/actions.ts`, `apps/web/components/onboarding/{onboarding-gate,
  setup-checklist,tour-runner}.tsx`.
- `supabase/migrations/20260831120000_onboarding_state.sql`, `20260831130000_organizations_drop_unit_defaults.sql`,
  `20260831140000_onboarding_connected_sources.sql`, `20260831150000_onboarding_org_progress.sql`.
- `docs/historial/CHANGES-2026-07-a-08.md`: 2026-08-11 (eliminación del wizard) y 2026-08-31 (plan, Fases 0–4 y el fix
  del loop de redirects con el cambio de contraseña).
