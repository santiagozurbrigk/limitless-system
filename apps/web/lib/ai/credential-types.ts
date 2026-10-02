export type ClaudeCredentialMode = "api_key_active" | "unconfigured";

/** Sólo la clave propia de la organización: no hay clave global de respaldo (SCRUM-7). */
export type ClaudeCredentialSource = "api_key";

export type OrgCredentialState = {
  organizationId: string;
  mode: ClaudeCredentialMode;
  hasApiKey: boolean;
  apiKeyStatus: "none" | "valid" | "valid_no_credits" | "invalid" | "error";
  /** Hay una clave guardada y marcada como usable, pero no se puede descifrar. */
  keyUnreadable: boolean;
};

export type ResolvedCredential = {
  client: import("@anthropic-ai/sdk").default;
  source: ClaudeCredentialSource;
  mode: ClaudeCredentialMode;
};

/** Normaliza modos legacy de OAuth a flujo de API key. */
export function normalizeCredentialMode(
  _dbMode: string | null | undefined,
  hasValidApiKey: boolean
): ClaudeCredentialMode {
  return hasValidApiKey ? "api_key_active" : "unconfigured";
}
