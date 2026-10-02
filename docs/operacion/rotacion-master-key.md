# Rotación de `ENCRYPTION_MASTER_KEY`

Procedimiento para cambiar la clave maestra con la que se cifran los secretos de las integraciones sin
cortar el servicio. Origen: `[SEC-MASTER-KEY-ROTACION]` (SCRUM-86). Cómo funciona el cifrado:
[`docs/arquitectura/seguridad.md`](../arquitectura/seguridad.md#secretos-y-cifrado).

## Cuándo se usa

- **Filtración** de la clave (o de la service role *y* la clave juntas): rotar cuanto antes.
- **Rotación preventiva** (por ejemplo, alguien con acceso deja el equipo).

Si la clave se **cambió por error** y las integraciones están cayendo: volver a cargar el valor anterior en
Vercel y redeployar. No hace falta nada más. Si el valor anterior **no está en ningún lado**, ver
"Si la clave se perdió" al final.

> **Antecedente (2026-10-02).** La clave original no tenía copia: la que figuraba como guardada no era la
> de producción, y al reemplazarla en Vercel se perdieron 19 secretos (Claude, GHL y Zernio de 14 orgs) que
> hubo que desconectar. Por eso el paso 0.

## 0. Antes de tocar Vercel: comprobar que la copia es la buena

Correr la simulación del paso 4 **sólo con la clave actual** (sin la nueva). Tiene que dar todo en "ya ok"
y **0 fallidas**. Si da fallidas, la copia del gestor **no es** la de producción: no sigas, porque al
reemplazar la variable se pierde la única copia que funciona (Vercel no deja leerla).

## Qué hay que tener antes

- La clave actual, desde el gestor de secretos del equipo (en Vercel es `sensitive`: **no se puede
  volver a leer**). Sin ella no se puede rotar sin pedirle a cada org que reconecte todo.
- La service role de Supabase de producción (`SUPABASE_SERVICE_ROLE_KEY`) y la URL del proyecto.
- Acceso de escritura a las variables de entorno del proyecto en Vercel.
- Node y el repo clonado, con `pnpm install` hecho en la raíz.

**Nunca** pegar ninguna de las claves en un doc, un ticket, un chat ni un commit.

## Cómo funciona (en corto)

- Todo secreto se guarda como `v2.<iv>.<tag>.<ciphertext>`, cifrado con `ENCRYPTION_MASTER_KEY`
  y atado a su columna y su organización (y al miembro, en las claves de Fathom por miembro).
- Para leer, el sistema prueba primero `ENCRYPTION_MASTER_KEY` y después
  `ENCRYPTION_MASTER_KEY_PREVIOUS`, si está cargada. El formato viejo `v1` (sin AAD) ya no se acepta
  desde el 2026-10-02: no queda ninguna fila así.
- El script `apps/web/scripts/reencrypt-secrets.ts` reescribe con la clave actual todo lo que esté
  cifrado con la anterior o en texto plano legacy.

## Pasos

### 1. Generar la clave nueva y guardarla

```bash
openssl rand -base64 32
# o: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Tiene que tener **44 caracteres y terminar en `=`**. Una contraseña inventada o `openssl rand -hex 32`
(64 caracteres) **no sirven**: el sistema las rechaza con `ENCRYPTION_MASTER_KEY inválida` y deja de cifrar
y descifrar todo (pasó el 2026-10-02).

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
export ENCRYPTION_MASTER_KEY_PREVIOUS=...     # la ANTERIOR

pnpm dlx tsx scripts/reencrypt-secrets.ts          # simulación: no escribe, muestra qué haría
pnpm dlx tsx scripts/reencrypt-secrets.ts --apply  # escribe
pnpm dlx tsx scripts/reencrypt-secrets.ts          # confirmación: todo tiene que quedar en "ya ok"
```

La tabla que imprime tiene, por columna: total, "ya ok", "desde clave anterior",
"desde texto plano", "salteadas (cambiaron)" y "fallidas". No imprime secretos.

**Desde una sesión de Claude Code en la nube:** cargar las tres variables en la configuración del entorno
(nunca en el chat), agregar el host de Supabase a los dominios permitidos de la red y anteponer
`NODE_USE_ENV_PROXY=1` a los comandos (Node no usa el proxy de salida por su cuenta). Borrar las variables
al terminar.

**Comprobar que la clave de la terminal es la misma que la de Vercel**, sin mirar ninguna de las dos:
reconectar una integración desde la app después del redeploy (queda cifrada con la clave de Vercel) y
fijarse que esa fila salga como "ya ok" en la simulación. Si sale como fallida, las claves no coinciden:
no aplicar.

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

## Si la clave se perdió

Si nadie tiene la clave con la que están cifrados los secretos (y tampoco está en Vercel), esos secretos
**no se recuperan**. Lo que se hizo el 2026-10-02:

1. Clave nueva generada y guardada bien (paso 1), cargada en Vercel y redeploy.
2. Simulación: las filas cifradas con la clave perdida salen como fallidas.
3. Para cada fila fallida, lo mismo que el botón de la app, filtrando por organización **y** por el valor
   cifrado leído: clave de Claude → `claude_api_key_encrypted = null`, `claude_api_key_status = 'none'`,
   `claude_api_key_last_validated_at = null` (como `removeClaudeApiKeyAction`); GHL y Zernio → borrar la
   fila de la org (como `disconnectGHLAction` / `disconnectZernioAction`). Lo importado se conserva.
4. Re-cifrado (paso 4) hasta 0 fallidas.
5. Avisar a cada org que reconecte. En GHL, si tenía secreto de webhook de Workflow, también tiene que
   regenerarlo en sus workflows.

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
