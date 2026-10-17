# Supabase local

> Verificado el 2026-10-16 con el CLI de Supabase 2.121.0, Docker Engine 29.9.1 en WSL y las 193 migraciones de `supabase/migrations/` (SCRUM-539). Configuración: [`supabase/config.toml`](../../supabase/config.toml).

Un Supabase completo en tu máquina (Postgres 17, Auth, API REST, Realtime, Storage y un servidor de mail de prueba) armado desde cero con las migraciones del repo. Sirve para desarrollar y probar sin tocar producción y sin costo. Nunca uses claves de producción con este entorno, ni las claves locales en un deploy.

## Requisitos

- **Docker Engine** corriendo y tu usuario en el grupo `docker` (`docker ps` funciona sin `sudo`). En WSL alcanza con el Docker Engine de la distro: no hace falta Docker Desktop.
- **Node ≥ 20** con `npm`. El CLI no se instala: se corre con la versión fija desde npm.
- Unos **800 MB de RAM libres** (ver [Memoria](#memoria)) y unos 4 GB de disco para las imágenes (medido con `docker image ls`).
- Puertos libres: `54321` (API), `54322` (Postgres), `54324` (mail de prueba). `54320` lo usa `supabase db diff` para la base sombra.

El CLI se usa siempre con la versión fija, para que todos armen lo mismo:

```bash
alias supabase='npm exec --yes --package=supabase@2.121.0 -- supabase'
supabase --version    # 2.121.0
```

El alias sólo vale en una shell interactiva. En scripts (y en `bash -c`) usa el comando completo: `npm exec --yes --package=supabase@2.121.0 -- supabase <comando>`.

`npx supabase@2.121.0 --version` no sirve para comprobarlo: `npx` se queda con `--version` y muestra la versión de npm. Si `pnpm dlx` falla fuera del repo con `Cannot find module .../pnpm.cjs`, es corepack sin `packageManager`: usa el alias de arriba.

### Si `supabase start` falla con `docker-credential-desktop.exe`

Pasa cuando en WSL quedó la configuración de un Docker Desktop viejo (`"credsStore": "desktop.exe"` en `~/.docker/config.json`) y no se puede bajar ninguna imagen. Sólo molesta cuando hay que bajar imágenes (el primer `supabase start`, un cambio de versión del CLI o un `docker pull`): con las imágenes ya en caché, `supabase start` anda sin tocar nada. Dos salidas:

- Sacar la línea `credsStore` de `~/.docker/config.json` (si no usas Docker Desktop, no hace falta).
- O no tocarla y darle al CLI una configuración aparte: `mkdir -p ~/.docker-wsl && echo '{}' > ~/.docker-wsl/config.json` y `export DOCKER_CONFIG=~/.docker-wsl` antes de `supabase start`.

## Levantarlo

Desde la raíz del repo:

```bash
supabase start
```

La primera vez baja las imágenes y aplica las 193 migraciones (unos 85 segundos con buena conexión). Después, con las imágenes bajadas y los datos guardados, tarda unos 35 segundos. Al terminar, `supabase start` imprime por la salida estándar las URL **y las claves locales** (anon, service role, JWT secret), igual que `supabase status`. Son las de ejemplo de Supabase, iguales en todas las máquinas: no son secretas, pero no pegues esa salida tal cual en issues, PRs ni evidencias; si hace falta guardarla, tapa las claves antes.

Qué levanta y qué no (ver comentarios en `config.toml`):

| Servicio | Estado | Por qué |
|---|---|---|
| Postgres 17 (`54322`) | prendido | misma versión mayor que producción |
| API: Kong + PostgREST + GoTrue (`54321`) | prendido | la app usa REST y Auth |
| Realtime | prendido | la app escucha cambios de `business_context_documents` y del provider de plataforma |
| Storage | prendido | buckets de comprobantes, adjuntos, contexto y avatares |
| Mailpit (`54324`) | prendido | la confirmación de email está activa, como en producción; los mails se ven en http://127.0.0.1:54324 y no salen |
| Studio (`54323`) | apagado | ahorra memoria; para usarlo, `enabled = true` en `[studio]` y `supabase stop && supabase start` |
| Analytics (Logflare + Vector), Edge Runtime, imgproxy, pooler, S3 de Storage | apagados | la app no los usa: son contenedores de más |

Todos los puertos están en el rango `543xx` para no chocar con los arneses de prueba (`3xxx`, `55xxx`, `56xxx`, `57xxx`).

Comprueba que se aplicaron todas las migraciones:

```bash
diff <(ls supabase/migrations/*.sql | xargs -n1 basename | cut -d_ -f1 | sort) \
     <(docker exec supabase_db_limitless-local psql -U postgres -At -c \
       "select version from supabase_migrations.schema_migrations order by 1") && echo "todas aplicadas"
```

### Diferencias con producción

- **Auth Hook:** `custom_access_token_hook` (claim `active_business_org_id` del holding) está activo por `config.toml`. En producción se activa a mano en el panel; la migración sola no lo activa.
- **Configuración de Auth:** el bloque `[auth]` de `config.toml` es el del entorno local, no un registro de la configuración de producción (duración del JWT, mínimo de contraseña y protección contra contraseñas filtradas siguen sin versionar, `[AUTH-MFA-Y-POLITICA]`). Lo que sí copia de producción (verificado el 2026-10-09, ver [`entorno-y-deploy.md`](./entorno-y-deploy.md)): la confirmación de email está activa y el alta pública cerrada (`enable_signup = false`, SCRUM-23). Lo que no: `site_url` y las redirect URLs son locales (`http://localhost:3000`).
- **Storage:** el storage-api local (v1.82.1) bloquea el `DELETE` directo sobre `storage.objects` y `storage.buckets` con el trigger `storage.protect_delete` (error 42501) salvo con `set storage.allow_delete_query = 'true'`. Por eso `supabase/ci/tests/20_storage_import_files.sql` corta en el local y pasa en el CI, cuyo stub no tiene el trigger. Los otros 11 archivos de tests de RLS pasan igual en los dos.
- **Datos:** la base arranca vacía. No hay seed: los datos se cargan a mano o por la app.

## Apuntar la app

Crea `apps/web/.env.local` (lo ignora `.gitignore`, regla `.env.local`; compruébalo con `git check-ignore -v apps/web/.env.local`). Las claves salen de `supabase status -o env`:

```bash
supabase status -o env > /tmp/supabase-local.env   # ANON_KEY, SERVICE_ROLE_KEY, API_URL, ...
```

```bash
# apps/web/.env.local: Supabase LOCAL, nunca claves de producción
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY de supabase status>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY de supabase status>
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=<openssl rand -hex 24>
ENCRYPTION_MASTER_KEY=<openssl rand -base64 32>
```

`CRON_SECRET` y `ENCRYPTION_MASTER_KEY` son obligatorias (ver [`entorno-y-deploy.md`](./entorno-y-deploy.md)); genera valores nuevos, no copies los de producción. Lo demás (OpenAI, QStash, Resend, integraciones) es opcional: sin eso, esas funciones fallan o quedan apagadas, el resto anda.

Después, como siempre:

```bash
pnpm --filter @ai-coo/web dev     # http://localhost:3000
```

## Crear un usuario de prueba

El alta pública está cerrada, como en producción (`enable_signup = false`, SCRUM-23): `POST /auth/v1/signup` con la anon key responde 422 `signup_disabled`. El usuario de prueba se crea con la API admin de Auth local, ya confirmado.

```bash
set -a; . /tmp/supabase-local.env; set +a
curl -s -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"prueba@local.test","password":"una-contraseña-local","email_confirm":true}'
```

Al entrar por `/login`, la app le arma organización y perfil de founder (`ensureUserBootstrap`). Si la app te manda al gate de onboarding (`/onboarding`), para saltearlo en una cuenta de prueba:

```bash
docker exec supabase_db_limitless-local psql -U postgres -c \
  "update public.organizations o set skip_onboarding = true from public.profiles p
   join auth.users u on u.id = p.id
   where u.email = 'prueba@local.test' and o.id = p.organization_id"
```

Para conectarte a la base con `psql`: `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (o `docker exec -it supabase_db_limitless-local psql -U postgres`).

## Tests de RLS contra el local

Los mismos archivos que corre el CI (`supabase/ci/tests/`), contra la base del local. Cada test hace `rollback`; al final se borra el schema `ci` de ayudas:

```bash
for t in $(ls supabase/ci/tests/*.sql | sort); do
  docker exec -i supabase_db_limitless-local psql -U postgres -v ON_ERROR_STOP=1 -q -f - < "$t" >/dev/null \
    && echo "OK: $(basename $t)" || echo "FALLA: $(basename $t)"
done
docker exec supabase_db_limitless-local psql -U postgres -c "drop schema ci cascade"
```

`20_storage_import_files.sql` falla por el trigger de Storage (ver [Diferencias con producción](#diferencias-con-producción)). Para que decida la RLS como en el CI, antepón `set storage.allow_delete_query = 'true';` a ese archivo en la misma sesión.

## Check de migraciones del CI

`supabase/ci/check-migrations.sh` (el job `migrations`) arma una base con stubs en un Postgres pelado, no usa el Supabase local. Necesita `psql` en la máquina: sin él corta con exit 127. Si no lo tienes instalado, córrelo dentro de la misma imagen del CI, desde la raíz del repo:

```bash
docker run -d --rm --name check-migraciones -e POSTGRES_PASSWORD=postgres \
  -v "$PWD/supabase:/repo/supabase:ro" pgvector/pgvector:pg17
until docker exec check-migraciones pg_isready -U postgres -h localhost >/dev/null 2>&1; do sleep 2; done
docker exec -e PGHOST=localhost -e PGUSER=postgres -e PGPASSWORD=postgres \
  check-migraciones bash /repo/supabase/ci/check-migrations.sh
docker stop check-migraciones
```

## Resetear

```bash
supabase db reset
```

Borra la base, vuelve a aplicar todas las migraciones y deja la base vacía (incluidos los usuarios de `auth.users`). Úsalo cada vez que sumes o cambies una migración: si `db reset` no corre limpio, el job `migrations` del CI tampoco.

## Apagar

```bash
supabase stop                  # apaga los contenedores y guarda los datos en un volumen
supabase stop --no-backup      # apaga y borra los datos: el próximo start arranca desde cero
docker ps --filter name=limitless-local   # tiene que quedar vacío
```

## Memoria

Medido con `docker stats --no-stream` el 2026-10-16 con la configuración de este repo:

| Contenedor | En reposo | Con la app usándolo |
|---|---|---|
| realtime | 239 MiB | 203 MiB |
| storage | 153 MiB | 150 MiB |
| kong | 94 MiB | 105 MiB |
| db (Postgres 17) | 87 MiB | 193 MiB |
| rest (PostgREST) | 15 MiB | 88 MiB |
| auth (GoTrue) | 11 MiB | 15 MiB |
| inbucket (Mailpit) | 10 MiB | 10 MiB |
| **Total** | **~610 MiB** | **~760 MiB** |

"Con la app" es justo después de una prueba de login, lectura y escritura con `next start`, que sumó unos 480 MiB más. Un `next build` usa unos 4 GB: con 15 GB de RAM entran todos juntos. Studio, Analytics y Edge Runtime (prendidos en la configuración por defecto del CLI) sumarían más contenedores: por eso están apagados.

## Supabase Branching

`supabase/config.toml` es el mismo archivo que lee Supabase Branching: si algún día se activa en el proyecto, cada rama preview arma su base con estas migraciones y toma de aquí la configuración de Auth (incluidos el Auth Hook, la confirmación de email y el alta pública cerrada). Por eso el archivo no tiene secretos: lo que tenga que venir de afuera va como `env(NOMBRE)`. Activar Branching es una decisión aparte (revisa el costo de las ramas en tu plan); este archivo no lo activa.

Antes de activarlo hay que resolver:

- **URLs de Auth locales.** `site_url` y `additional_redirect_urls` apuntan a `http://localhost:3000`: en una rama preview, los links de confirmación y de recuperación de contraseña llevarían a localhost. Hay que pasarlas a `env(...)` o sobrescribirlas para la rama en un bloque `[remotes.<rama>]` (con el `project_id` de la rama; el CLI 2.121.0 lo soporta).
- **Qué pasa al mergear.** Confirmar en el panel de Supabase si la integración de GitHub aplica este `config.toml` al proyecto de producción al mergear a la rama principal. Si lo aplica, `site_url`, las redirect URLs, el alta, el mínimo de contraseña y el resto del `[auth]` de este archivo pisarían los de producción: primero hay que alinearlos con producción o limitarlos a las ramas con `[remotes.<rama>]`.
