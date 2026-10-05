# ADR-005 — Roles configurables por organización con permisos por módulo (y se aplican en pantallas, no en el servidor)

- **Estado:** Aceptada con deuda
- **Fecha:** en tres pasos.
  - 2026-06-14 — commit `d18997c9` "implement real team management with invitations, roles and permissions"
    (migración `20260616400000_team_roles_permissions.sql`).
  - 2026-07-10 — commits `5bc68d95` "cablear roles custom en sidebar y restringir gestión de equipo a founder",
    `27625b4a` "eliminar roles del sistema en UI", `eecfe8e2` "modal invitar solo con rol custom requerido".
  - 2026-09-06 — `CHANGES.md` "Volver atrás en todas las pantallas, notas por cliente y nueve arreglos…"
    (consolidación a 13 módulos y bloqueo por pantalla; migración `20260906102000_permisos_por_modulo.sql`).

## Contexto

La spec del MVP definía **seis roles fijos** — Founder, Admin, Project Manager, Setter, Operator, Viewer — y pedía
"RBAC… Server-side authorization. No client-side permissions" (`docs/archivo/SYSTEM_ARCHITECTURE.md`,
`docs/archivo/PROJECT_CONSTITUTION.md` MODULE #6). Esos seis valores siguen en el check de `profiles.role` y en
`apps/web/constants/roles.ts`. Los equipos de los clientes no se parecen entre sí (setters, closers, operadores,
editores), y un rol fijo no deja decir "ve Ventas pero no Finanzas".

## Decisión

1. **Cada organización define sus roles** en `team_roles` (`permissions jsonb`: `{ "<módulo>": "none" | "view" |
   "full" }`). `create_default_roles` siembra cinco de ejemplo (Founder, Setter, Closer, Operador, Viewer) que se
   pueden editar.
2. **`profiles.role` pasa a distinguir sólo founder / no founder**: todo invitado es `member` y lo que lo
   diferencia es `custom_role_id`. Desde el 2026-07-10 la UI ya no ofrece los roles del sistema y la gestión de
   equipo es sólo del founder (`requireManagerProfile()`).
3. **13 módulos** (`constants/permission-modules.ts`); las claves viejas de submódulo se traducen al leer y la
   migración de 2026-09-06 las consolidó tomando **el nivel más alto de los hijos**, para no quitarle acceso a nadie
   (63 roles verificados en producción, reparto idéntico al ensayo).
4. **Dónde se aplica:** en la navegación (`canSeeNavItem`) y, desde 2026-09-06, en el **layout de `(platform)`**,
   que corta el render con `SinAcceso` si el módulo de la ruta está en `none` (`lib/navigation/module-for-path.ts`,
   con un test que falla si aparece una ruta sin módulo asignado). **No** se aplica en Server Actions ni en RLS.
5. Un member **sin rol cargado** no se bloquea (`hasRoleConfigured = false`): "tratarlo como sin acceso a nada lo
   dejaría sin poder abrir una sola pantalla".

## Alternativas consideradas

- **Los seis roles fijos de la spec.** Reemplazados por roles custom; **el motivo no quedó escrito**. Lo que se
  infiere: los roles de fábrica de `create_default_roles` ya no coinciden con los seis (hay Closer, no hay Admin ni
  Project Manager), o sea que se modeló por puesto real del equipo del cliente.
- **Redirigir en vez de mostrar una pantalla de bloqueo**: descartado el 2026-09-06 porque un redirect a
  `/dashboard` de alguien sin `dashboard` es un loop y esconde qué pasó.
- **Derivar el mapa ruta→módulo del menú**: descartado el 2026-09-06; las rutas que no están en el menú son las
  que se olvidan.
- **Aplicarlo también en las actions** (guard en `requireOrganizationId` o wrapper por módulo): quedó escrito como
  "otro trabajo" en la misma entrada del 2026-09-06; no se hizo.

## Consecuencias

**Positivas**
- El founder arma los roles que su equipo necesita sin pedir cambios de código.
- Tipear la URL de un módulo bloqueado ya no muestra datos (antes, alguien sin Finanzas veía la facturación
  entera escribiendo `/finance`).

**Negativas / deuda** (la spec pedía lo contrario: autorización en el servidor)
- **Los permisos no protegen datos, sólo pantallas.** Un member con rol limitado puede invocar cualquier action o
  escribir por PostgREST todo lo que su org puede escribir, incluido editar `team_roles` para darse todos los
  módulos: `[PERMISOS-SERVER-ACTIONS]` (P0) y sus partes por área (`/clientes`, `/ventas`, `/marketing`,
  `/agente-ia`, `/ops-fin-prod`, `/infra`), `[EMBUDOS-PERMISOS-ACCIONES]`, `[DISCORD-PERMISOS]`.
- El bloqueo vive en un layout que no se re-renderiza en navegaciones del cliente (`[PERMISOS-LAYOUT-NAV-SUAVE]`);
  `/founder` quedaba fuera del layout (`[PERMISOS-FOUNDER-AREA]`, resuelto el 2026-10-05 en SCRUM-18); la paleta ⌘K no filtra (`[NAV-PALETA-PERMISOS]`);
  un member sin rol pasa el gate pero no ve ningún ítem (`[PERMISOS-SIN-ROL-NAV]`).
- `view` vs `full` no tiene enforcement central: cada pantalla lo consulta (o no) con `useModuleAccess()`.
- Las tools de lectura del agente leen todos los módulos sin mirar permisos (`[PERMISOS-SERVER-ACTIONS/agente-ia]`).
- `profiles.role` conserva valores legados que el código no distingue; `member` no está en `VALID_ROLES`.
- Sin e2e de permisos por rol (`[T-19]`) y sin probar con sesión real (`[PERMISOS-VERIFICAR-SESION]`).

## Evidencia

- `supabase/migrations/20260616400000_team_roles_permissions.sql` (tabla y `create_default_roles`),
  `20260906102000_permisos_por_modulo.sql`, `20260922120000_reconciliar_con_produccion.sql` (check de `role`).
- `apps/web/constants/{permission-modules,roles}.ts`, `apps/web/lib/auth/get-current-permissions.ts`,
  `apps/web/lib/navigation/module-for-path.ts`, `apps/web/app/(platform)/layout.tsx`, `apps/web/app/team/actions.ts`.
- `docs/archivo/SYSTEM_ARCHITECTURE.md` (ROLES, SECURITY), `docs/archivo/PROJECT_CONSTITUTION.md` (MODULE #6).
- `CHANGES.md` 2026-09-06; `docs/arquitectura/auth-organizaciones-y-permisos.md` § Permisos por módulo.
