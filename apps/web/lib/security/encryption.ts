import crypto from "crypto";

/**
 * Cifrado de secretos guardados en la base (AES-256-GCM).
 *
 * Formatos de lo que se guarda:
 *   - v2 (actual):  `v2.<iv>.<tag>.<ciphertext>`, con AAD = campo + organización
 *     (+ usuario para las credenciales por miembro). Un ciphertext copiado a otra
 *     fila, otra org u otra columna no descifra.
 *   - v1 (`<iv>.<tag>.<ciphertext>`, sin AAD): **ya no se acepta** desde el
 *     2026-10-02, cuando no quedaba ninguna fila así. Se reconoce la forma sólo
 *     para tirar un error claro en vez de tratarlo como texto plano.
 *
 * Claves:
 *   - `ENCRYPTION_MASTER_KEY`: la actual. Se usa para cifrar y se prueba primero.
 *   - `ENCRYPTION_MASTER_KEY_PREVIOUS` (opcional): la anterior, sólo para leer
 *     durante una rotación. Procedimiento en `docs/operacion/rotacion-master-key.md`.
 *
 * Las dos tienen que decodificar (base64) a exactamente 32 bytes.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const V2_PREFIX = "v2";

/**
 * Cada columna de la base que guarda un secreto cifrado. Si se agrega una, va
 * también en `SECRET_COLUMNS` (`reencrypt.ts`): un test lo exige, para que el
 * script de re-cifrado no la saltee.
 */
export const SECRET_FIELDS = [
  "organizations.claude_api_key_encrypted",
  "mercadopago_integrations.access_token_encrypted",
  "mercadopago_integrations.refresh_token_encrypted",
  "ghl_integrations.api_key_encrypted",
  "ghl_integrations.webhook_secret_encrypted",
  "payment_integrations.api_key_encrypted",
  "payment_integrations.webhook_secret_encrypted",
  "vturb_integrations.api_key_encrypted",
  "webinarjam_integrations.api_key_encrypted",
  "hyros_integrations.api_key_encrypted",
  "zernio_integrations.api_key",
  "team_member_integrations.encrypted_api_key",
] as const;

export type SecretField = (typeof SECRET_FIELDS)[number];

/** Campos cuyo secreto pertenece a un miembro y no sólo a la org. */
const PER_USER_FIELDS: ReadonlySet<SecretField> = new Set([
  "team_member_integrations.encrypted_api_key",
]);

/** A qué fila pertenece un secreto. Va como AAD: no se guarda, se exige al leer. */
export type SecretContext = {
  field: SecretField;
  organizationId: string;
  /** Obligatorio para los campos por miembro. */
  userId?: string;
};

type KeyName = "current" | "previous";

function parseMasterKey(envName: string, value: string): Buffer {
  const trimmed = value.trim();
  const key = Buffer.from(trimmed, "base64");
  // Buffer.from ignora caracteres inválidos en silencio: se valida la forma
  // además del largo, para que una clave mal copiada no pase por buena. Se
  // aceptan también `-` y `_` (base64url) porque Node siempre los decodificó:
  // rechazarlos podría invalidar una clave que ya está en uso.
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(trimmed) || key.length !== KEY_BYTES) {
    throw new Error(
      `${envName} inválida: tiene que ser base64 de exactamente ${KEY_BYTES} bytes`
    );
  }
  return key;
}

function getCurrentKey(): Buffer {
  const value = process.env.ENCRYPTION_MASTER_KEY;
  if (!value) {
    throw new Error("ENCRYPTION_MASTER_KEY no está configurada");
  }
  return parseMasterKey("ENCRYPTION_MASTER_KEY", value);
}

function getDecryptionKeys(): Array<{ name: KeyName; key: Buffer }> {
  const keys: Array<{ name: KeyName; key: Buffer }> = [
    { name: "current", key: getCurrentKey() },
  ];
  const previous = process.env.ENCRYPTION_MASTER_KEY_PREVIOUS;
  if (previous) {
    keys.push({
      name: "previous",
      key: parseMasterKey("ENCRYPTION_MASTER_KEY_PREVIOUS", previous),
    });
  }
  return keys;
}

function buildAad(context: SecretContext): Buffer {
  if (!context.organizationId) {
    throw new Error(`Falta organizationId para el secreto de ${context.field}`);
  }
  if (PER_USER_FIELDS.has(context.field) && !context.userId) {
    throw new Error(`Falta userId para el secreto de ${context.field}`);
  }
  return Buffer.from(
    ["limitless-secret", V2_PREFIX, context.field, context.organizationId, context.userId ?? ""].join("|"),
    "utf8"
  );
}

/**
 * Cifra un texto plano con la clave actual, atado a la fila que lo guarda.
 * Devuelve `v2.<iv>.<tag>.<ciphertext>`, listo para guardar en DB.
 */
export function encrypt(plaintext: string, context: SecretContext): string {
  const key = getCurrentKey();
  const aad = buildAad(context);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(aad);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    V2_PREFIX,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

type ParsedCiphertext = {
  iv: Buffer;
  authTag: Buffer;
  encrypted: Buffer;
};

function parseCiphertext(ciphertext: string): ParsedCiphertext {
  const parts = ciphertext.split(".");
  if (parts.length === 4 && parts[0] === V2_PREFIX) {
    return {
      iv: Buffer.from(parts[1], "base64"),
      authTag: Buffer.from(parts[2], "base64"),
      encrypted: Buffer.from(parts[3], "base64"),
    };
  }
  if (parts.length === 3) {
    // v1 no tenía AAD: aceptarlo dejaría que un secreto copiado a otra fila u
    // otra org descifre. Ya no queda ninguno en la base (SCRUM-86).
    throw new Error(
      "Formato de ciphertext v1 (sin AAD): ya no se acepta, hay que volver a cargar el secreto"
    );
  }
  throw new Error("Formato de ciphertext inválido");
}

function tryDecrypt(parsed: ParsedCiphertext, key: Buffer, aad: Buffer): string | null {
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, parsed.iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(parsed.authTag);
    return Buffer.concat([
      decipher.update(parsed.encrypted),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export type DecryptResult = {
  plaintext: string;
  /** Con qué clave descifró. */
  key: KeyName;
};

/**
 * Descifra y dice con qué clave se había guardado. Lo usa el script de
 * re-cifrado para saber qué filas hay que reescribir.
 */
export function decryptWithInfo(ciphertext: string, context: SecretContext): DecryptResult {
  const parsed = parseCiphertext(ciphertext);
  const aad = buildAad(context);

  for (const { name, key } of getDecryptionKeys()) {
    const plaintext = tryDecrypt(parsed, key, aad);
    if (plaintext !== null) {
      return { plaintext, key: name };
    }
  }

  // Mismo mensaje para clave equivocada, dato alterado o fila equivocada: GCM
  // no distingue, y no hay que dar pistas de cuál fue.
  throw new Error(
    `No se pudo descifrar el secreto de ${context.field} (clave distinta o dato alterado)`
  );
}

/**
 * Descifra un string generado por encrypt(). Lanza error si el formato es
 * inválido o es el v1 viejo, si ninguna clave sirve o si el secreto no pertenece a
 * esta fila (AAD).
 */
export function decrypt(ciphertext: string, context: SecretContext): string {
  return decryptWithInfo(ciphertext, context).plaintext;
}

const IV_B64_LENGTH = 16; // 12 bytes
const TAG_B64_LENGTH = 24; // 16 bytes
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

function looksLikeParts(parts: string[]): boolean {
  return (
    parts.length === 3 &&
    parts[0].length === IV_B64_LENGTH &&
    parts[1].length === TAG_B64_LENGTH &&
    parts[2].length > 0 &&
    parts.every((p) => B64.test(p))
  );
}

/**
 * ¿Tiene la forma exacta de lo que devuelve `encrypt()` (v2) o la del v1 viejo?
 * El v1 se sigue reconociendo para que `readStoredSecret` tire en vez de
 * devolverlo como si fuera texto plano.
 */
export function looksEncrypted(value: string): boolean {
  const parts = value.split(".");
  if (parts.length === 4 && parts[0] === V2_PREFIX) {
    return looksLikeParts(parts.slice(1));
  }
  return looksLikeParts(parts);
}

/**
 * Lee un secreto guardado que puede ser ciphertext o texto plano legacy.
 *
 * ⚠️ Si tiene forma de ciphertext y no descifra (clave cambiada o faltante),
 * tira. Antes los wrappers devolvían el valor guardado tal cual, y el
 * ciphertext terminaba mandándose al proveedor como si fuera la API key.
 */
export function readStoredSecret(stored: string, context: SecretContext): string {
  return looksEncrypted(stored) ? decrypt(stored, context) : stored;
}

/**
 * Devuelve solo los últimos 4 caracteres de un secreto para
 * mostrar en UI sin exponer el valor completo, ej: "****a8f2"
 */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) return "****";
  return `****${plaintext.slice(-4)}`;
}
