import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/security/encryption";
import type {
  ClaudeCredentialMode,
  ClaudeCredentialSource,
  OrgCredentialState,
  ResolvedCredential,
} from "@/lib/ai/credential-types";
import { normalizeCredentialMode } from "@/lib/ai/credential-types";
import { noAiCredentialsError } from "@/lib/ai/anthropic-auth-errors";

type CachedCredential = {
  apiKey: string;
  mode: ClaudeCredentialMode;
  cachedAt: number;
};

const credentialCache = new Map<string, CachedCredential>();
// TTL corto para minimizar ventana de credenciales stale en entorno serverless multi-instancia
const CACHE_TTL_MS = 30 * 1000;

/**
 * El cliente con la clave global de Limitless.
 *
 * Se expone para que, si la clave propia de una organización resulta inválida,
 * el trabajo pueda seguir con la global en vez de fallar. Ver
 * `executeWithCredentialFallback`.
 */
export function getGlobalAnthropicClient(): Anthropic | null {
  return getGlobalClient();
}

function getGlobalClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

export function invalidateOrgCredentialCache(organizationId: string): void {
  credentialCache.delete(organizationId);
}

/** @deprecated Usar invalidateOrgCredentialCache */
export function invalidateOrgKeyCache(organizationId: string): void {
  invalidateOrgCredentialCache(organizationId);
}

/**
 * Deja escrito que la clave propia de una organización dejó de funcionar.
 *
 * ⭐ Hasta acá, una clave vencida sólo se veía en el log del servidor. La
 * organización `familiayformacion` estuvo **desde julio** con la suya rechazada
 * —12 llamadas fallando con `401` cada diez minutos— y en su pantalla no decía
 * nada: el estado guardado seguía siendo `valid` porque nadie lo actualizaba
 * desde que se validó al cargarla.
 *
 * Marcarla tiene dos efectos, y el segundo es el que corta la sangría:
 *
 * 1. La pantalla de Ajustes y el cartel de la plataforma pasan a avisarlo.
 * 2. `decryptApiKeyIfValid` deja de entregar esa clave, así que el sistema pasa
 *    a la clave global **antes** de pegarle al proveedor, en vez de gastar un
 *    `401` en cada intento.
 *
 * No tira nunca: es un aviso, y no puede romper el trabajo que lo disparó.
 */
export async function marcarClaveDeOrgComoRechazada(
  organizationId: string
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("organizations")
      .update({ claude_api_key_status: "invalid" })
      .eq("id", organizationId)
      // Sin esto, una carrera entre dos lambdas podría pisar una clave que la
      // organización acaba de corregir y volver a marcarla como rota.
      .eq("claude_api_key_status", "valid");

    if (error) {
      console.error("[credential-resolver] marcar clave rechazada", error.message);
      return;
    }
    invalidateOrgCredentialCache(organizationId);
  } catch (error) {
    console.error("[credential-resolver] marcar clave rechazada", error);
  }
}

type OrgCredentialRow = {
  claude_api_key_encrypted: string | null;
  claude_api_key_status: string | null;
  claude_credential_mode: string | null;
};

async function loadOrgCredentialRow(
  organizationId: string
): Promise<OrgCredentialRow | null> {
  const supabase = createAdminClient();
  // Solo columnas BYOK base — no depender de migración OAuth (#19)
  const { data, error } = await supabase
    .from("organizations")
    .select("claude_api_key_encrypted, claude_api_key_status")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[credential-resolver] Error leyendo credenciales de org", {
      organizationId,
      message: error.message,
      code: error.code,
    });
    return null;
  }

  if (!data) {
    console.warn("[credential-resolver] Org no encontrada", { organizationId });
    return null;
  }

  return {
    claude_api_key_encrypted: data.claude_api_key_encrypted as string | null,
    claude_api_key_status: data.claude_api_key_status as string | null,
    claude_credential_mode: null,
  };
}

function decryptApiKeyIfValid(
  row: OrgCredentialRow,
  organizationId: string
): string | null {
  if (
    !row.claude_api_key_encrypted ||
    (row.claude_api_key_status !== "valid" &&
      row.claude_api_key_status !== "valid_no_credits")
  ) {
    return null;
  }

  try {
    return decrypt(row.claude_api_key_encrypted, {
      field: "organizations.claude_api_key_encrypted",
      organizationId,
    });
  } catch {
    // error, no warn: significa que la org cae a la clave global sin que nadie
    // lo vea en pantalla. Ver [BYOK-DESCIFRADO-SILENCIOSO].
    console.error("[credential-resolver] No se pudo descifrar la API key de la org", {
      organizationId,
    });
    return null;
  }
}

export async function loadOrgCredentialState(
  organizationId: string
): Promise<OrgCredentialState> {
  const row = await loadOrgCredentialRow(organizationId);
  const apiKey = row ? decryptApiKeyIfValid(row, organizationId) : null;
  const hasApiKey = Boolean(apiKey);

  return {
    organizationId,
    mode: normalizeCredentialMode(row?.claude_credential_mode, hasApiKey),
    hasApiKey: Boolean(row?.claude_api_key_encrypted),
    apiKeyStatus:
      (row?.claude_api_key_status as OrgCredentialState["apiKeyStatus"]) ??
      "none",
  };
}

type Resolution = {
  client: Anthropic | null;
  source: ClaudeCredentialSource | "none";
  mode: ClaudeCredentialMode;
};

function resolveFromRow(row: OrgCredentialRow, organizationId: string): Resolution {
  const apiKey = decryptApiKeyIfValid(row, organizationId);
  const mode = normalizeCredentialMode(row.claude_credential_mode, Boolean(apiKey));

  if (apiKey) {
    return {
      client: new Anthropic({ apiKey }),
      source: "api_key",
      mode,
    };
  }

  const globalClient = getGlobalClient();
  return {
    client: globalClient,
    source: globalClient ? "global" : "none",
    mode: "unconfigured",
  };
}

/**
 * Resuelve la credencial activa para una organización.
 * Modos OAuth legacy en DB se tratan como api_key_active (usa API key si existe).
 */
export async function resolveCredentialForOrg(
  organizationId?: string
): Promise<Resolution> {
  if (!organizationId) {
    const client = getGlobalClient();
    return {
      client,
      source: client ? "global" : "none",
      mode: client ? "api_key_active" : "unconfigured",
    };
  }

  const cached = credentialCache.get(organizationId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return {
      client: new Anthropic({ apiKey: cached.apiKey }),
      source: "api_key",
      mode: cached.mode,
    };
  }

  const row = await loadOrgCredentialRow(organizationId);
  if (!row) {
    const client = getGlobalClient();
    return {
      client,
      source: client ? "global" : "none",
      mode: client ? "api_key_active" : "unconfigured",
    };
  }

  const resolution = resolveFromRow(row, organizationId);

  if (resolution.client && resolution.source === "api_key") {
    const apiKey = decryptApiKeyIfValid(row, organizationId);
    if (apiKey) {
      credentialCache.set(organizationId, {
        apiKey,
        mode: resolution.mode,
        cachedAt: Date.now(),
      });
    }
  }

  return resolution;
}

export async function getClientForOrg(
  organizationId?: string
): Promise<Anthropic | null> {
  const { client } = await resolveCredentialForOrg(organizationId);
  return client;
}

export type ClientResolution = {
  client: Anthropic | null;
  keySource: ClaudeCredentialSource | "none";
};

/** Alias legacy usado por diagnósticos del agente y callers previos al Prompt #20. */
export async function resolveClientForOrg(
  organizationId?: string
): Promise<ClientResolution> {
  const resolution = await resolveCredentialForOrg(organizationId);
  return {
    client: resolution.client,
    keySource: resolution.source,
  };
}

export async function requireCredentialForOrg(
  organizationId: string
): Promise<ResolvedCredential> {
  const resolution = await resolveCredentialForOrg(organizationId);
  if (!resolution.client || resolution.source === "none") {
    throw noAiCredentialsError();
  }
  return {
    client: resolution.client,
    source: resolution.source,
    mode: resolution.mode,
  };
}
