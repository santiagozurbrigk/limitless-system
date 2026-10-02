import type { OrgCredentialState } from "@/lib/ai/credential-types";

/**
 * Qué dice el cartel de la plataforma según el estado de la clave de Claude de
 * la organización. Lógica pura, aparte del componente para poder testearla.
 *
 * Sin clave propia, no hay IA (SCRUM-7): cada caso en que la org no puede usar
 * IA tiene su aviso. `null` = la clave anda y no hay nada que avisar.
 */
export type AvisoClaveIa = {
  tono: "error" | "advertencia";
  titulo: string;
  detalle: string;
  /** Texto del link a Ajustes → IA (sólo lo ve quien puede arreglarlo). */
  accion: string;
};

const DETALLE_SIN_IA =
  "Hasta que se resuelva, el análisis de llamadas, los reportes y el agente no se generan.";

export function avisoClaveIa(
  estado: Pick<OrgCredentialState, "hasApiKey" | "apiKeyStatus" | "keyUnreadable">
): AvisoClaveIa | null {
  if (estado.apiKeyStatus === "invalid" || estado.keyUnreadable) {
    return {
      tono: "error",
      titulo: "La clave de inteligencia artificial de tu cuenta dejó de funcionar.",
      detalle: DETALLE_SIN_IA,
      accion: "Actualizar la clave",
    };
  }

  if (estado.apiKeyStatus === "valid_no_credits") {
    return {
      tono: "advertencia",
      titulo: "Tu cuenta de Claude no tiene créditos.",
      detalle: "Las funciones de IA vuelven solas cuando cargues saldo en Anthropic.",
      accion: "Ver la clave",
    };
  }

  if (!estado.hasApiKey || estado.apiKeyStatus === "none") {
    return {
      tono: "advertencia",
      titulo: "Las funciones de inteligencia artificial están desactivadas.",
      detalle: "Falta cargar la clave de Claude de tu cuenta. " + DETALLE_SIN_IA,
      accion: "Cargar la clave",
    };
  }

  return null;
}
