# Backups de producción y cómo restaurarlos (SCRUM-11)

Producción (`nrzlylzbmsuowzhpdnjl`) está en el plan **Pro** de Supabase desde el 2026-10-09: Supabase hace un backup
diario de la base y guarda 7 días (Database → Backups; desde ahí, "Restore to new project" crea una copia en un
proyecto aparte). Los backups de Supabase **no incluyen Storage**. Además, el workflow de GitHub
`.github/workflows/backup-produccion.yml` hace un dump propio y cifrado, fuera de Supabase:

| Qué | Cuándo | Cuánto dura | Dónde |
|---|---|---|---|
| Base completa (roles + schema + datos, incluye `auth.users`) | Todos los días 06:23 UTC | 3 días | Actions → "Backup de producción" → artifact `base-<run>` |
| Archivos de los buckets que no se pueden reconstruir | Lunes y jueves 06:47 UTC | 4 días | Actions → "Backup de producción" → artifact `archivos-<run>` |

- Siempre hay una base de menos de 24 h y una copia de archivos de menos de 7 días.
- Todo sale **cifrado** (gpg simétrico, AES256) con `BACKUP_PASSPHRASE`. Sin esa clave el archivo no sirve: guardala en el gestor de claves del equipo, **no** sólo en GitHub.
- Buckets copiados: `ai-brain-documents`, `business-context-documents`, `sop-videos`, `client-payment-receipts`, `client-wins`, `agent-documents` (~420 MB). No se copian `trial-reels`, `content-thumbnails` ni `avatars`: se regeneran desde Drive/Zernio o son triviales.
- Si una corrida falla, queda en rojo en Actions y, si existe `DISCORD_WEBHOOK_ALERTAS`, avisa en Discord. Un dump vacío o sin la tabla `organizations` cuenta como falla.
- Cuota de artifacts: el total ronda 500–600 MB. Si GitHub avisa que se llenó la cuota de almacenamiento de Actions, bajar `retention-days` o pasar los archivos a un bucket externo (R2/S3).

## Activarlo (una vez)

GitHub → repo → Settings → Secrets and variables → Actions → **New repository secret**:

| Secreto | De dónde sale |
|---|---|
| `SUPABASE_DB_URL` | Supabase → Connect → **Session pooler** (`postgresql://postgres.nrzlylzbmsuowzhpdnjl:<password>@aws-...pooler.supabase.com:5432/postgres`). Si no tenés la password: Database → Settings → Reset password (ojo: cambia la de cualquier otro lugar que la use). |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API keys → `service_role` (la misma que está en Vercel). |
| `BACKUP_PASSPHRASE` | Una clave larga nueva (`openssl rand -base64 32`). Guardala también en el gestor de claves. |

Después: Actions → **Backup de producción** → Run workflow → `todo`. Esperado: dos jobs en verde y dos artifacts (`base-…`, ~20–30 MB; `archivos-…`, ~420 MB).

## Bajar y abrir un backup

1. Actions → la corrida → Artifacts → descargar (`.zip`).
2. Descomprimir y descifrar:
   ```bash
   unzip base-<run>.zip
   gpg --decrypt base-<fecha>.tar.gz.gpg > base.tar.gz      # pide BACKUP_PASSPHRASE
   tar -xzf base.tar.gz                                     # roles.sql, schema.sql, data.sql
   ```
   Para archivos: `gpg --decrypt archivos-<fecha>.tar.gpg > archivos.tar && tar -xf archivos.tar` (carpeta por bucket + `LISTA.tsv`).

Los archivos descifrados tienen datos de clientes: trabajarlos en una carpeta temporal y borrarlos al terminar.

## Restaurar (ensayo en un proyecto descartable)

Medir el tiempo de cada paso y anotarlo abajo, en "Ensayos".

1. **Proyecto nuevo** en Supabase (misma región que producción). Anotar su ref, la password de la base y su `service_role`.
2. **Extensiones**: habilitar las mismas que producción (Database → Extensions; en producción: `select extname from pg_extension`).
3. **Base**:
   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file roles.sql --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql \
     --dbname "<Session pooler del proyecto nuevo>"
   ```
   Errores conocidos (guía oficial "Backup and Restore using the CLI"): `ALTER ... OWNER TO "supabase_admin"` → comentar esas líneas en `schema.sql`; `GRANT "postgres" TO "cli_login_postgres"` → comentarla en `roles.sql`.
4. **Historial de migraciones** (para que `supabase db push` siga funcionando): ver "Preserving migration history" en la misma guía.
5. **Lo que no está en el dump** (checklist):
   - [ ] Auth Hook `custom_access_token_hook` (Authentication → Hooks → Customize Access Token → `public.custom_access_token_hook`).
   - [ ] Auth → URL Configuration: Site URL y Redirect URLs de producción.
   - [ ] Auth → SMTP (Resend) y plantillas de mail (ver `entorno-y-deploy.md` § Mails de autenticación).
   - [ ] Buckets de Storage con su config (público/privado, límites) y sus policies si no vinieron en `schema.sql`.
   - [ ] Publicaciones de Realtime (Database → Publications).
   - [ ] Secrets del Vault / Edge Functions si las hubiera.
6. **Archivos**: subir cada carpeta del backup a su bucket con el `service_role` del proyecto nuevo (script de la guía oficial "Migrating storage objects", apuntando a la carpeta local en vez del proyecto viejo).
7. **Probar la app**: correr `apps/web` local con `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` del proyecto nuevo y `ENCRYPTION_MASTER_KEY` de producción (sin ella las credenciales cifradas no abren). Entrar con una cuenta de prueba y ver su lista de clientes.
8. **Borrar** el proyecto descartable y los archivos descifrados.

## Ensayos

| Fecha | Backup usado | Quién | Tiempos (base / archivos / config / total) | Resultado |
|---|---|---|---|---|
| 2026-10-09 | — | Santiago | — | Dado por hecho por Santiago al cerrar SCRUM-11; repetir con "Restore to new project" y anotar tiempos |

## Antes de una migración destructiva

Regla en `docs/arquitectura/base-de-datos.md` § Cómo aplicar una migración, paso 5: dump de las tablas afectadas antes de aplicarla. Alternativa rápida: Actions → Backup de producción → Run workflow → `base`, y esperar el verde.
