# Rotación de `ENCRYPTION_MASTER_KEY`

Procedimiento para cambiar la clave maestra con la que se cifran los secretos de las integraciones sin
cortar el servicio. Origen: `[SEC-MASTER-KEY-ROTACION]` (SCRUM-86). Cómo funciona el cifrado:
[`docs/arquitectura/seguridad.md`](../arquitectura/seguridad.md#secretos-y-cifrado).

## Cuándo se usa

- **Filtración** de la clave (o de la service role *y* la clave juntas): rotar cuanto antes.
- **Rotación preventiva** (por ejemplo, alguien con acceso deja el equipo).
- **Primera vez después del deploy de SCRUM-86**: sólo el paso 4 (re-cifrado) con la clave actual, sin
  rotar. Pasa todo lo guardado en formato v1 y las claves de Fathom por miembro que estaban en texto
  plano (8 al 2026-09-30) al formato v2.

Si la clave se **cambió por error** y las integraciones están cayendo: volver a cargar el valor anterior en
Vercel y redeployar. No hace falta nada más.

## Qué hay que tener antes

- La clave actual, desde el gestor de secretos del equipo (en Vercel es `sensitive`: **no se puede
  volver a leer**). Sin ella no se puede rotar sin pedirle a cada org que reconecte todo.
- La service role de Supabase de producción (`SUPABASE_SERVICE_ROLE_KEY`) y la URL del proyecto.
- Acceso de escritura a las variables de entorno del proyecto en Vercel.
- Node y el repo clonado, con `pnpm install` hecho en la raíz.

**Nunca** pegar ninguna de las claves en un doc, un ticket, un chat ni un commit.

## Cómo funciona (en corto)

- Todo secreto nuevo se guarda como `v2.<iv>.<tag>.<ciphertext>`, cifrado con `ENCRYPTION_MASTER_KEY`
  y atado a su columna y su organización (y al miembro, en las claves de Fathom por miembro).
- Para leer, el sistema prueba primero `ENCRYPTION_MASTER_KEY` y después
  `ENCRYPTION_MASTER_KEY_PREVIOUS`, si está cargada. También lee el formato viejo `v1`.
- El script `apps/web/scripts/reencrypt-secrets.ts` reescribe todo lo que no esté en v2 con la clave actual.

## Pasos

### 1. Generar la clave nueva y guardarla

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Guardarla en el gestor de secretos **antes** de cargarla en Vercel, con acceso de al menos dos personas.
Anotar en el gestor cuál es la "actual" y cuál la "anterior".

### 2. Cargar las dos claves en Vercel

En Vercel → Project → Settings → Environment Variables, entorno **Production**:

| Variable | Valor |
|---|---|
| `ENCRYPTION_MASTER_KEY` | la **nueva** |
| `ENCRYPTION_MASTER_KEY_PREVIOUS` | la **anterior** (la que estaba hasta ahora) |

Marcar las dos como `sensitive`. Si Preview comparte la base de producción (hoy sí, ver `[ENTORNO-STAGING]`),
**Preview tiene que tener los mismos dos valores**: si no, los previews rompen integraciones reales.

### 3. Redeployar y comprobar

Redeploy de producción (las variables sólo se toman en un deploy nuevo). Después, con una org de prueba:

- Integraciones → una integración cifrada (Zernio, GHL, etc.) sigue mostrando datos.
- Ajustes → la clave de Claude propia de una org que la tenga sigue mostrando `****xxxx`.

Desde acá lo nuevo se cifra con la clave nueva y lo viejo se sigue leyendo con la anterior.

### 4. Re-cifrar todo con la clave nueva

Desde `apps/web`, con las variables en el entorno de la terminal (no en un archivo commiteado):

```bash
export NEXT_PUBLIC_SUPABASE_URL=...           # URL del proyecto de producción
export SUPABASE_SERVICE_ROLE_KEY=...
export ENCRYPTION_MASTER_KEY=...              # la NUEVA
export ENCRYPTION_MASTER_KEY_PREVIOUS=...     # la ANTERIOR (omitir si sólo es la migración inicial)

pnpm dlx tsx scripts/reencrypt-secrets.ts          # simulación: no escribe, muestra qué haría
pnpm dlx tsx scripts/reencrypt-secrets.ts --apply  # escribe
pnpm dlx tsx scripts/reencrypt-secrets.ts          # confirmación: todo tiene que quedar en "ya ok"
```

La tabla que imprime tiene, por columna: total, "ya ok", "desde v1", "desde clave anterior",
"desde texto plano", "salteadas (cambiaron)" y "fallidas". No imprime secretos.

- **Fallidas > 0**: el script sale con error y lista tabla, columna e id de fila. Esas filas no descifran
  con ninguna de las dos claves (o están en texto plano en una columna que no lo acepta). **No sigas al
  paso 5**: revisar si hay una tercera clave más vieja en el gestor. Si no se recupera, la org de esa
  fila tiene que reconectar esa integración.
- **Salteadas > 0**: alguien reconectó la integración mientras corría el script. Ya quedó con la clave
  nueva. Correr de nuevo para confirmar.

### 5. Sacar la clave anterior

Sólo cuando la corrida de confirmación del paso 4 da **0 fallidas y todo en "ya ok"**:

1. Borrar `ENCRYPTION_MASTER_KEY_PREVIOUS` de Vercel (Production y Preview).
2. Redeploy.
3. Repetir las comprobaciones del paso 3.
4. En el gestor de secretos, marcar la clave anterior como retirada. Conviene guardarla unas semanas por
   si aparece una fila que el script no cubría (ver "Si se agrega una columna cifrada").

### 6. Registrar

Entrada en `CHANGES.md`: fecha, motivo de la rotación y la tabla de conteos del paso 4 (sin valores).

## Riesgos conocidos

- **Rollback de código a antes de SCRUM-86**: la versión anterior no lee el formato v2. Todo secreto
  guardado o reconectado después del deploy dejaría de andar. Si hay que volver atrás, revisar primero
  cuántas filas hay en v2 (`like 'v2.%'` en las columnas de la tabla de abajo).
- **Webhooks de pagos durante la rotación**: si una clave falta o está mal, los webhooks de Whop y Commas
  responden **500** (no 404) y el log dice `[payments] no se pudo descifrar el secreto`. Whop reintenta
  unos 3 días. Commas no está documentado que reintente: esos cobros hay que recuperarlos a mano
  (`docs/operacion/incidentes.md` §B).
- **Clave de Claude propia de una org**: si no descifra, la org pasa en silencio a la clave global
  (`[BYOK-DESCIFRADO-SILENCIOSO]`). Buscar en los logs `[credential-resolver] No se pudo descifrar`.
- **Una clave mal copiada** (espacios, caracteres de más): si no decodifica a exactamente 32 bytes, el
  sistema la rechaza con `ENCRYPTION_MASTER_KEY inválida` en vez de usarla.

## Columnas cifradas

Lista única en `apps/web/lib/security/encryption.ts` (`SECRET_FIELDS`) y en
`apps/web/lib/security/reencrypt.ts` (`SECRET_COLUMNS`). Un test falla si no coinciden.

| Columna | Acepta texto plano legacy |
|---|---|
| `organizations.claude_api_key_encrypted` | no |
| `mercadopago_integrations.access_token_encrypted` / `refresh_token_encrypted` | no |
| `payment_integrations.webhook_secret_encrypted` / `api_key_encrypted` | no |
| `ghl_integrations.api_key_encrypted` / `webhook_secret_encrypted` | sí |
| `vturb_integrations.api_key_encrypted`, `webinarjam_integrations.api_key_encrypted`, `hyros_integrations.api_key_encrypted` | sí |
| `zernio_integrations.api_key` | sí |
| `team_member_integrations.encrypted_api_key` (Fathom por miembro) | sí |

**Si se agrega una columna cifrada**: sumarla a `SECRET_FIELDS` y a `SECRET_COLUMNS` y a esta tabla.
Si no, el script no la re-cifra y, al sacar la clave anterior, esa integración deja de andar.
