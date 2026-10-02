import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt, maskSecret, type SecretContext } from "@/lib/security/encryption";
import { PLATFORM_SECRET_SCOPE } from "@/lib/ai/platform-credential-scope";

/**
 * La clave de Claude de la plataforma: la usa sólo el trabajo de super-admin
 * (resúmenes del cerebro global). Se carga desde el panel de super-admin →
 * Infraestructura y se guarda cifrada en `platform_ai_credentials` (una fila).
 *
 * ⭐ SCRUM-7 / SCRUM-71: antes el super-admin usaba `ANTHROPIC_API_KEY` y, si
 * faltaba, la clave de una organización cliente. Ahora nunca toca la clave de
 * una organización, y las organizaciones nunca tocan ésta.
 *
 * Sólo servidor y con admin client: la tabla no tiene políticas de RLS.
 */

const CONTEXT: SecretContext = {
  field: "platform_ai_credentials.claude_api_key_encrypted",
  organizationId: PLATFORM_SECRET_SCOPE,
};

export const PLATFORM_KEY_MISSING_MESSAGE =
  "Falta la clave de Claude de la plataforma. Cargala en Super-admin → Infraestructura.";

export type PlatformClaudeKeyStatus = {
  hasKey: boolean;
  status: "none" | "valid" | "valid_no_credits" | "invalid";
  lastValidated: string | null;
  keyPreview: string | null;
};

type PlatformRow = {
  claude_api_key_encrypted: string | null;
  claude_api_key_status: PlatformClaudeKeyStatus["status"];
  claude_api_key_last_validated_at: string | null;
};

async function loadRow(): Promise<PlatformRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_ai_credentials")
    .select("claude_api_key_encrypted, claude_api_key_status, claude_api_key_last_validated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PlatformRow | null) ?? null;
}

export async function getPlatformClaudeKeyStatus(): Promise<PlatformClaudeKeyStatus> {
  const row = await loadRow();
  if (!row?.claude_api_key_encrypted) {
    return { hasKey: false, status: "none", lastValidated: null, keyPreview: null };
  }
  let keyPreview = "****";
  try {
    keyPreview = maskSecret(decrypt(row.claude_api_key_encrypted, CONTEXT));
  } catch {
    // Guardada pero ilegible (clave maestra cambiada): se muestra como rota.
    return {
      hasKey: true,
      status: "invalid",
      lastValidated: row.claude_api_key_last_validated_at,
      keyPreview,
    };
  }
  return {
    hasKey: true,
    status: row.claude_api_key_status,
    lastValidated: row.claude_api_key_last_validated_at,
    keyPreview,
  };
}

export async function savePlatformClaudeKey(
  apiKey: string,
  status: "valid" | "valid_no_credits",
  userId: string
): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("platform_ai_credentials").upsert(
    {
      id: 1,
      claude_api_key_encrypted: encrypt(apiKey, CONTEXT),
      claude_api_key_status: status,
      claude_api_key_last_validated_at: now,
      updated_at: now,
      updated_by: userId,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(error.message);
}

export async function removePlatformClaudeKey(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("platform_ai_credentials").upsert(
    {
      id: 1,
      claude_api_key_encrypted: null,
      claude_api_key_status: "none",
      claude_api_key_last_validated_at: null,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(error.message);
}

/** Cliente de Anthropic con la clave de la plataforma. Tira si no hay una usable. */
export async function getPlatformAnthropicClient(): Promise<Anthropic> {
  const row = await loadRow();
  if (
    !row?.claude_api_key_encrypted ||
    (row.claude_api_key_status !== "valid" && row.claude_api_key_status !== "valid_no_credits")
  ) {
    throw new Error(PLATFORM_KEY_MISSING_MESSAGE);
  }
  let apiKey: string;
  try {
    apiKey = decrypt(row.claude_api_key_encrypted, CONTEXT);
  } catch {
    throw new Error(
      "La clave de Claude de la plataforma no se puede leer. Cargala de nuevo en Super-admin → Infraestructura."
    );
  }
  return new Anthropic({ apiKey });
}
