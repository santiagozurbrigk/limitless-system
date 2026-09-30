/**
 * Cifrado de la API key de Fathom de cada miembro
 * (`team_member_integrations.encrypted_api_key`).
 *
 * El secreto queda atado a la org y al miembro (AAD): la key de una persona
 * copiada a la fila de otra no descifra.
 *
 * 🔴 Si no se puede cifrar, **no se guarda**. Antes la pantalla de conexión de
 * la org guardaba la key del miembro en texto plano, y la de "mi Fathom" caía
 * a texto plano sin avisar cuando faltaba la clave maestra.
 */

import { encrypt, readStoredSecret, type SecretContext } from "@/lib/security/encryption";

function context(organizationId: string, userId: string): SecretContext {
  return {
    field: "team_member_integrations.encrypted_api_key",
    organizationId,
    userId,
  };
}

export function encryptMemberFathomKey(
  apiKey: string,
  organizationId: string,
  userId: string
): string {
  try {
    return encrypt(apiKey, context(organizationId, userId));
  } catch (error) {
    console.error(
      "[fathom member] no se pudo cifrar la key",
      error instanceof Error ? error.message : String(error)
    );
    throw new Error(
      "No se puede guardar la credencial de forma segura (falta ENCRYPTION_MASTER_KEY). " +
        "No se guardó nada."
    );
  }
}

/** Acepta texto plano legacy (filas guardadas antes de cifrar). */
export function readMemberFathomKey(
  stored: string,
  organizationId: string,
  userId: string
): string {
  return readStoredSecret(stored, context(organizationId, userId));
}
