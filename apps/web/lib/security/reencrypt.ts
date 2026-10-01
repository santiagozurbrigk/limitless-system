/**
 * Lógica del re-cifrado de secretos (`scripts/reencrypt-secrets.ts`).
 *
 * Pasa cada secreto guardado al formato actual (v2, con AAD) y a la clave actual
 * (`ENCRYPTION_MASTER_KEY`). Se usa al rotar la clave maestra y, la primera vez,
 * para migrar lo que estaba en v1 o en texto plano. Procedimiento completo en
 * `docs/operacion/rotacion-master-key.md`.
 *
 * Nunca devuelve ni loguea el secreto en claro: sólo el valor nuevo cifrado.
 */

import {
  decryptWithInfo,
  encrypt,
  looksEncrypted,
  type SecretContext,
  type SecretField,
} from "./encryption";

export type SecretColumn = {
  field: SecretField;
  table: string;
  column: string;
  /** Columna que identifica la fila para el UPDATE. */
  keyColumn: "id" | "organization_id";
  /** Columna con la org dueña del secreto (va en la AAD). */
  orgColumn: "id" | "organization_id";
  /** Columna con el miembro dueño, para los secretos por miembro. */
  userColumn?: "user_id";
  /**
   * ¿El código acepta texto plano legacy en esta columna (`readStoredSecret`)?
   * Si sí, el script lo cifra. Si no, un valor sin forma de ciphertext es un
   * error y se informa, no se toca.
   */
  allowsPlaintext: boolean;
};

export const SECRET_COLUMNS: readonly SecretColumn[] = [
  { field: "organizations.claude_api_key_encrypted", table: "organizations", column: "claude_api_key_encrypted", keyColumn: "id", orgColumn: "id", allowsPlaintext: false },
  { field: "mercadopago_integrations.access_token_encrypted", table: "mercadopago_integrations", column: "access_token_encrypted", keyColumn: "id", orgColumn: "organization_id", allowsPlaintext: false },
  { field: "mercadopago_integrations.refresh_token_encrypted", table: "mercadopago_integrations", column: "refresh_token_encrypted", keyColumn: "id", orgColumn: "organization_id", allowsPlaintext: false },
  { field: "ghl_integrations.api_key_encrypted", table: "ghl_integrations", column: "api_key_encrypted", keyColumn: "organization_id", orgColumn: "organization_id", allowsPlaintext: true },
  { field: "ghl_integrations.webhook_secret_encrypted", table: "ghl_integrations", column: "webhook_secret_encrypted", keyColumn: "organization_id", orgColumn: "organization_id", allowsPlaintext: true },
  { field: "payment_integrations.api_key_encrypted", table: "payment_integrations", column: "api_key_encrypted", keyColumn: "id", orgColumn: "organization_id", allowsPlaintext: false },
  { field: "payment_integrations.webhook_secret_encrypted", table: "payment_integrations", column: "webhook_secret_encrypted", keyColumn: "id", orgColumn: "organization_id", allowsPlaintext: false },
  { field: "vturb_integrations.api_key_encrypted", table: "vturb_integrations", column: "api_key_encrypted", keyColumn: "id", orgColumn: "organization_id", allowsPlaintext: true },
  { field: "webinarjam_integrations.api_key_encrypted", table: "webinarjam_integrations", column: "api_key_encrypted", keyColumn: "id", orgColumn: "organization_id", allowsPlaintext: true },
  { field: "hyros_integrations.api_key_encrypted", table: "hyros_integrations", column: "api_key_encrypted", keyColumn: "id", orgColumn: "organization_id", allowsPlaintext: true },
  { field: "zernio_integrations.api_key", table: "zernio_integrations", column: "api_key", keyColumn: "id", orgColumn: "organization_id", allowsPlaintext: true },
  { field: "team_member_integrations.encrypted_api_key", table: "team_member_integrations", column: "encrypted_api_key", keyColumn: "id", orgColumn: "organization_id", userColumn: "user_id", allowsPlaintext: true },
];

export type ReencryptPlan =
  /** Ya está en v2 con la clave actual. */
  | { action: "keep" }
  | {
      action: "rewrite";
      /** De dónde venía: formato v1, clave anterior o texto plano legacy. */
      from: "v1" | "previous_key" | "plaintext";
      value: string;
    }
  | { action: "fail"; reason: string };

/** Contexto (AAD) de una fila leída de la base. */
export function contextForRow(
  column: SecretColumn,
  row: Record<string, unknown>
): SecretContext | null {
  const organizationId = row[column.orgColumn];
  if (typeof organizationId !== "string" || !organizationId) return null;
  if (column.userColumn) {
    const userId = row[column.userColumn];
    if (typeof userId !== "string" || !userId) return null;
    return { field: column.field, organizationId, userId };
  }
  return { field: column.field, organizationId };
}

/** Decide qué hacer con un valor guardado. Pura salvo el IV aleatorio del cifrado. */
export function planReencryption(
  stored: string,
  context: SecretContext,
  allowsPlaintext: boolean
): ReencryptPlan {
  if (!looksEncrypted(stored)) {
    if (!allowsPlaintext) {
      return {
        action: "fail",
        reason: "no tiene forma de ciphertext y esta columna no acepta texto plano",
      };
    }
    return { action: "rewrite", from: "plaintext", value: encrypt(stored, context) };
  }

  let result;
  try {
    result = decryptWithInfo(stored, context);
  } catch {
    return {
      action: "fail",
      reason: "no descifra con la clave actual ni con la anterior",
    };
  }

  if (result.version === 2 && result.key === "current") return { action: "keep" };

  return {
    action: "rewrite",
    from: result.version === 1 ? "v1" : "previous_key",
    value: encrypt(result.plaintext, context),
  };
}
