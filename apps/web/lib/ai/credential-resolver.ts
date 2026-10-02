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

/**
 * Resuelve con qué clave de Claude trabaja cada organización.
 *
 * ⭐ Regla (SCRUM-7, 2026-10-02): **sin clave propia, no hay IA.** Una
 * organización usa sólo la clave que cargó en Ajustes → IA. No hay clave global
 * de Limitless de respaldo: si la org no tiene clave, o la suya está rota, sin
 * créditos o no se puede leer, el trabajo de IA de esa org no se hace y la
 * plataforma se lo avisa (`components/platform/aviso-clave-ia.tsx`). Antes el
 * código caía a `ANTHROPIC_API_KEY`, que nunca estuvo cargada en producción, y
 * si alguien la cargaba todas las orgs sin clave iban a gastar IA a cuenta de
 * Limitless.
 *
 * El trabajo de plataforma (super-admin) usa su propia clave, aparte:
 * `lib/ai/platform-credential.ts`.
 */

type CachedCredential = {
  apiKey: string;
  mode: ClaudeCredentialMode;
  cachedAt: number;
};

const credentialCache = new Map<string, CachedCredential>();
// TTL corto para minimizar ventana de credenciales stale en entorno serverless multi-instancia
const CACHE_TTL_MS = 30 * 1000;

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
 * Marcarla tiene dos efectos:
 *
 * 1. La pantalla de Ajustes y el cartel de la plataforma pasan a avisarlo.
 * 2. `decryptApiKeyIfValid` deja de entregar esa clave, así que el sistema deja
 *    de intentar **antes** de pegarle al proveedor, en vez de gastar un `401`
 *    en cada intento.
 *
 * No tira nunca: es un aviso, y no puede romper el trabajo que lo disparó.
 */
export async function marcarClaveDeOrgComoRechazada(
  organizationId: string
): Promise<void> {
  await marcarEstadoDeClave(organizationId, "invalid");
}

/**
 * Deja escrito que la cuenta de Anthropic de la organización se quedó sin
 * créditos (SCRUM-211). La clave sigue siendo válida, así que se sigue usando
 * —cuando cargue saldo vuelve a andar sola—, pero la plataforma lo avisa.
 */
export async function marcarClaveDeOrgSinCreditos(
  organizationId: string
): Promise<void> {
  await marcarEstadoDeClave(organizationId, "valid_no_credits");
}

async function marcarEstadoDeClave(
  organizationId: string,
  estado: "invalid" | "valid_no_credits"
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("organizations")
      .update({ claude_api_key_status: estado })
      .eq("id", organizationId)
      // Sin esto, una carrera entre dos lambdas podría pisar una clave que la
      // organización acaba de corregir y volver a marcarla.
      .eq("claude_api_key_status", "valid");

    if (error) {
      console.error(`[credential-resolver] marcar clave como ${estado}`, error.message);
      return;
    }
    invalidateOrgCredentialCache(organizationId);
  } catch (error) {
    console.error(`[credential-resolver] marcar clave como ${estado}`, error);
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

function isUsableStatus(status: string | null): boolean {
  return status === "valid" || status === "valid_no_credits";
}

function decryptApiKeyIfValid(
  row: OrgCredentialRow,
  organizationId: string
): string | null {
  if (!row.claude_api_key_encrypted || !isUsableStatus(row.claude_api_key_status)) {
    return null;
  }

  try {
    return decrypt(row.claude_api_key_encrypted, {
      field: "organizations.claude_api_key_encrypted",
      organizationId,
    });
  } catch {
    // La org queda sin IA; el cartel de la plataforma lo muestra como clave que
    // no se puede leer (`keyUnreadable`). Ver [BYOK-DESCIFRADO-SILENCIOSO].
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
  const hasStoredKey = Boolean(row?.claude_api_key_encrypted);

  return {
    organizationId,
    mode: normalizeCredentialMode(row?.claude_credential_mode, Boolean(apiKey)),
    hasApiKey: hasStoredKey,
    apiKeyStatus:
      (row?.claude_api_key_status as OrgCredentialState["apiKeyStatus"]) ??
      "none",
    // Guardada y marcada como usable, pero no se puede descifrar (clave
    // maestra cambiada, dato alterado): para el usuario es una clave rota.
    keyUnreadable:
      hasStoredKey && isUsableStatus(row?.claude_api_key_status ?? null) && !apiKey,
  };
}

type Resolution = {
  client: Anthropic | null;
  source: ClaudeCredentialSource | "none";
  mode: ClaudeCredentialMode;
};

const SIN_CLAVE: Resolution = { client: null, source: "none", mode: "unconfigured" };

/**
 * Resuelve la credencial activa para una organización: su clave propia o nada.
 * Modos OAuth legacy en DB se tratan como api_key_active (usa API key si existe).
 */
export async function resolveCredentialForOrg(
  organizationId?: string
): Promise<Resolution> {
  // Sin organización no hay a quién atribuirle el gasto: no hay IA.
  if (!organizationId) return SIN_CLAVE;

  const cached = credentialCache.get(organizationId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return {
      client: new Anthropic({ apiKey: cached.apiKey }),
      source: "api_key",
      mode: cached.mode,
    };
  }

  const row = await loadOrgCredentialRow(organizationId);
  if (!row) return SIN_CLAVE;

  const apiKey = decryptApiKeyIfValid(row, organizationId);
  if (!apiKey) return SIN_CLAVE;

  const mode = normalizeCredentialMode(row.claude_credential_mode, true);
  credentialCache.set(organizationId, { apiKey, mode, cachedAt: Date.now() });

  return {
    client: new Anthropic({ apiKey }),
    source: "api_key",
    mode,
  };
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
