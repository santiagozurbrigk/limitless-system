# Limitless

Sistema operativo con IA para **negocios de infoproductos** (cursos, mentorías, memberships). Centraliza
clientes, ventas, marketing, embudos, operaciones y finanzas, y le da al founder un agente con acceso a
todo eso. Multi-tenant: cada negocio es una organización, y un **holding** puede operar varios negocios
desde una cuenta.

Monorepo pnpm + Turborepo. App principal: **`apps/web`** (Next.js 15 App Router, React 19, Supabase,
Anthropic), deployada en Vercel (región `gru1`) desde `main`.

| Carpeta | Qué es |
|---|---|
| `apps/web` | La aplicación (`@ai-coo/web`) |
| `apps/discord-bot` | Bot de Discord (Railway) que lee la actividad de los alumnos |
| `apps/reel-worker` | Worker de video de Trial Reels (Fly.io) |
| `packages/ui`, `packages/config`, `packages/types` | Design system, configs compartidas, tipos |
| `packages/ai`, `packages/database`, `packages/integrations`, `packages/queue` | Placeholders vacíos (sólo un comentario "Reserved for Phase 1+"); nada los importa |
| `supabase/migrations` | Fuente de verdad del schema (se arma la base desde cero con ellas) |
| `docs/` | Documentación, por área — **empezá por [`docs/README.md`](./docs/README.md)** |

## Arrancar

Requisitos: Node ≥ 20 y pnpm 9 (`corepack enable`).

```bash
pnpm install
cp .env.example apps/web/.env.local     # completar; ver docs/operacion/entorno-y-deploy.md
pnpm --filter @ai-coo/web dev           # http://localhost:3000
```

Supabase local: `supabase start` (CLI 2.121.0, Docker) arma la base desde cero con todas las migraciones, sin costo y sin tocar producción. Guía en [`docs/operacion/supabase-local.md`](docs/operacion/supabase-local.md). Nunca apuntes el entorno local a producción.

## Comandos

```bash
pnpm typecheck      # tsc en todo el monorepo (turbo; apps/reel-worker no tiene script)
pnpm lint
pnpm test           # Vitest de apps/web (lógica pura: *.test.ts en lib/, constants/, etc.)
pnpm build
```

Playwright vive en `apps/web/e2e/`. Detalle en [`docs/operacion/testing.md`](./docs/operacion/testing.md).

## Documentos de la raíz

| Archivo | Para qué |
|---|---|
| [`docs/README.md`](./docs/README.md) | Índice de toda la documentación |
| [`PENDIENTES.md`](./PENDIENTES.md) | Backlog abierto, por área y prioridad (verificado contra el código) |
| [`CHANGES.md`](./CHANGES.md) | Historial de cambios con contexto (desde septiembre 2026) |
| [`CLAUDE.md`](./CLAUDE.md) | Reglas de trabajo para agentes de IA y convenciones del repo |

## Flujo de trabajo

Ramas de feature desde `main`, PR y **Squash and merge**. Nunca se pushea a `main`: cada merge deploya
producción. Commits en español, convencionales (`feat(clientes): ...`).
