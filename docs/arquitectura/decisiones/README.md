# Registro de decisiones de arquitectura (ADR)

> Creado el 2026-09-23 contra el código del commit `038caca`. Los ADR 001–012 se **reconstruyeron** después
> de tomadas las decisiones, a partir de `CHANGES.md`, `docs/historial/CHANGES-2026-07-a-08.md`, `docs/archivo/`,
> `docs/specs/`, los mensajes de commit y el código. Donde el motivo no quedó escrito, el ADR lo dice.

## Qué es un ADR

Un ADR (*Architecture Decision Record*) es una nota corta que registra **una** decisión de arquitectura:
qué problema había, qué se decidió, qué otras opciones hubo y qué consecuencias trae (las buenas y la deuda).
No describe cómo funciona el sistema hoy — eso está en `docs/areas/` y `docs/arquitectura/` — sino **por qué**
es así, para que nadie deshaga una decisión sin saber qué costaba, ni la repita sin saber que ya se probó.

Un ADR no se reescribe cuando la decisión cambia: se escribe uno nuevo y el viejo pasa a
"Reemplazada por ADR-X". El historial de por qué se cambió de idea también es información.

## Cuándo escribir uno (regla para el equipo)

Escribí un ADR **en el mismo PR** que implementa el cambio si se cumple al menos una:

1. **Es caro de revertir**: cambia el modelo de datos de forma transversal, el modelo de seguridad (tenancy,
   RLS, roles, secretos) o un proveedor del que dependen varias áreas.
2. **Elige entre alternativas reales**: hubo al menos dos caminos razonables y se descartó alguno por un motivo
   que no es obvio leyendo el código.
3. **Crea una regla que el resto tiene que respetar** ("nunca persistir X", "toda action hace Y", "null nunca es
   0"): si no está escrita, el próximo la rompe sin saberlo.
4. **Acepta deuda a sabiendas**: se decidió hacer algo incompleto (p. ej. permisos sólo en pantallas). El ADR
   nombra el ID de `PENDIENTES.md` que la sigue.
5. **Reemplaza o contradice un ADR vigente.**

No hace falta ADR para: un bug, un cambio de UI, una integración nueva que sigue un patrón ya decidido, un
refactor sin cambio de comportamiento. Eso va sólo en `CHANGES.md`.

Si dudás, escribilo: un ADR de 20 líneas cuesta menos que la discusión de por qué se hizo así dentro de seis meses.

## Formato

Archivo `ADR-NNN-titulo-en-kebab.md` (número correlativo de tres dígitos, nunca se reutiliza). Estructura:

```
# ADR-NNN — Título

- **Estado:** Propuesta | Aceptada | Aceptada con deuda | Reemplazada por ADR-X | Deprecada
- **Fecha:** AAAA-MM-DD de la decisión (y la entrada de CHANGES o el commit que la registra)

## Contexto
Qué problema había y qué restricciones. Hechos, con evidencia.

## Decisión
Qué se decidió, en una o dos frases firmes, y las reglas que se desprenden.

## Alternativas consideradas
Sólo las que constan por escrito. Si no consta: "No quedó registrado".

## Consecuencias
Positivas / Negativas. La deuda con su ID de PENDIENTES.md.

## Evidencia
Archivos, migraciones, commits, entradas de CHANGES.
```

Reglas del formato:

- **No inventes motivos.** Si el porqué no quedó escrito, poné "el motivo no quedó escrito; lo que se infiere del
  código es…".
- La **fecha** es la de la decisión, no la de escribir el ADR.
- **Aceptada con deuda** = la decisión está vigente pero su implementación dejó un hueco conocido y registrado en
  `PENDIENTES.md`.
- Al cambiar de estado un ADR, agregá una línea al final (`AAAA-MM-DD: pasa a … porque …`) y actualizá el índice.
- Mencioná el ADR en la entrada de `CHANGES.md` del PR.

## Índice

| ADR | Decisión | Estado | Fecha |
|---|---|---|---|
| [ADR-001](./ADR-001-multi-tenant-por-organizacion-con-rls.md) | Multi-tenant por `organization_id` con RLS sobre Supabase (Auth incluido) | Aceptada con deuda | 2026-05-27 |
| [ADR-002](./ADR-002-holding-org-activa-cookie-y-claim-jwt.md) | Holding: negocio activo con cookie para la app y claim del JWT para RLS | Aceptada con deuda | 2026-06-16 / 2026-06-18 |
| [ADR-003](./ADR-003-server-actions-como-capa-de-mutacion.md) | Server Actions como capa de mutación; Route Handlers sólo para lo que llega de afuera | Aceptada con deuda | 2026-05-27 |
| [ADR-004](./ADR-004-byok-anthropic-con-fallback-global.md) | BYOK de Anthropic por organización, cifrada, con fallback a la clave global | Aceptada con deuda | 2026-06-13 |
| [ADR-005](./ADR-005-roles-configurables-y-permisos-por-modulo.md) | Roles configurables por organización con permisos por módulo (reemplazó los 6 roles fijos); se aplican en pantallas | Aceptada con deuda | 2026-06-14 / 2026-07-10 / 2026-09-06 |
| [ADR-006](./ADR-006-qstash-y-worker-de-video-en-fly.md) | Trabajo asíncrono con Upstash QStash; video pesado en un worker de Fly.io con ffmpeg | Aceptada con deuda | 2026-07-02 / 2026-08-10 |
| [ADR-007](./ADR-007-bandeja-de-ventas-via-zernio.md) | Bandeja de ventas vía Zernio, en vivo y con respuesta; se abandona el inbox guardado de ManyChat/Unipile | Aceptada con deuda | 2026-07-10 |
| [ADR-008](./ADR-008-comentarios-y-anuncios-de-zernio-en-vivo.md) | Comentarios y anuncios de Zernio se leen en vivo, no se persisten (excepción: `ad_metrics_daily`) | Aceptada | 2026-07-12 / 2026-08-29 |
| [ADR-009](./ADR-009-motor-de-embudos-configurable.md) | Embudos: un motor genérico + plantillas declarativas en código, con fuentes configurables por step | Aceptada con deuda | 2026-08-29 |
| [ADR-010](./ADR-010-payload-crudo-y-nunca-inventar-un-valor.md) | Guardar el payload crudo antes de interpretarlo; nunca inventar un valor (`null` no es `0`) | Aceptada con deuda | 2026-08-29 / 2026-08-30 |
| [ADR-011](./ADR-011-notch-nav-como-unica-navegacion.md) | Notch nav como única navegación de la plataforma (se eliminó el sidebar) | Aceptada | 2026-08-30 |
| [ADR-012](./ADR-012-onboarding-del-founder-con-gate-obligatorio.md) | Onboarding del founder con gate obligatorio de 3 pasos + checklist derivado | Aceptada con deuda | 2026-08-31 |

Candidatas evaluadas y **no** escritas como ADR propio (y por qué) están al final de este archivo.

## Candidatas que no se escribieron como ADR propio

| Candidata | Qué se hizo | Motivo |
|---|---|---|
| Supabase Auth en vez de Clerk | Dentro de ADR-001 | Es la misma decisión de plataforma (auth + tenancy + RLS en un solo proveedor) |
| Cifrado de secretos en la app (AES-256-GCM) | Mencionado en ADR-004 | Sólo se aplicó a algunos proveedores; hoy es deuda (`[TOKENS-TEXTO-PLANO]`), no una regla general sostenida por el código |
| Eliminar el wizard de onboarding del founder (2026-08-11) | Contexto de ADR-012 | Duró 20 días y no quedó escrito el motivo; se registra como antecedente de la decisión vigente |
| Plantillas de embudo en código y no en la base | Dentro de ADR-009 | Es parte de la misma decisión de diseño |
| Signup público de founders | No es ADR | Cerrado el 2026-10-09 (SCRUM-23): alta sólo por invitación; ver `auth-organizaciones-y-permisos.md` § Alta de cuentas |
