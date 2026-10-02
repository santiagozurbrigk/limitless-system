/**
 * Lógica del re-cifrado de secretos (`scripts/reencrypt-secrets.ts`).
 *
 * Pasa cada secreto guardado al formato actual (v2, con AAD) y a la clave actual
 * (`ENCRYPTION_MASTER_KEY`). Se usa al rotar la clave maestra y para cifrar lo que
 * haya quedado en texto plano legacy. Procedimiento completo en
 * `docs/operacion/rotacion-master-key.md`.
 *
 * Nunca devuelve ni loguea el secreto en claro: sólo el valor nuevo cifrado.
 */

// Relativo y no "@/": este módulo lo usa también el script de re-cifrado.
import { PLATFORM_SECRET_SCOPE } from "../ai/platform-credential-scope";
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
  orgColumn?: "id" | "organization_id";
  /**
   * Para secretos que no son de una organización (la clave de Claude de la
   * plataforma): valor fijo que va en la AAD en lugar de una columna.
   */
  fixedOrganizationId?: string;
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
  { field: "platform_ai_credentials.claude_api_key_encrypted", table: "platform_ai_credentials", column: "claude_api_key_encrypted", keyColumn: "id", fixedOrganizationId: PLATFORM_SECRET_SCOPE, allowsPlaintext: false },
];

export type ReencryptPlan =
  /** Ya está en v2 con la clave actual. */
  | { action: "keep" }
  | {
      action: "rewrite";
      /** De dónde venía: clave anterior o texto plano legacy. */
      from: "previous_key" | "plaintext";
      value: string;
    }
  | { action: "fail"; reason: string };

/** Contexto (AAD) de una fila leída de la base. */
export function contextForRow(
  column: SecretColumn,
  row: Record<string, unknown>
): SecretContext | null {
  const organizationId = column.fixedOrganizationId ?? (column.orgColumn ? row[column.orgColumn] : null);
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
  } catch (error) {
    const isV1 = error instanceof Error && error.message.includes("v1");
    return {
      action: "fail",
      reason: isV1
        ? "formato v1 sin AAD: ya no se acepta, hay que volver a cargar el secreto"
        : "no descifra con la clave actual ni con la anterior",
    };
  }

  if (result.key === "current") return { action: "keep" };

  return {
    action: "rewrite",
    from: "previous_key",
    value: encrypt(result.plaintext, context),
  };
}
