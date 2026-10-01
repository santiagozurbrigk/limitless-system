import { createZernioClient, type ZernioClient } from "@/lib/zernio/client";
import { extractProfileId } from "@/lib/zernio/profile-id";
import { readStoredSecret, encrypt } from "@/lib/security/encryption";
import { createAdminClient } from "@/lib/supabase/admin";

export type ZernioConnectedAccount = {
  accountId: string;
  platform: string;
  username?: string;
  avatarUrl?: string;
};

export type ZernioChannelStatus = {
  hasInstagram: boolean;
  hasWhatsapp: boolean;
};

export type ZernioIntegrationRow = {
  id: string;
  organization_id: string;
  zernio_profile_id: string;
  connected_accounts: ZernioConnectedAccount[];
  api_key: string | null;
  account_name: string | null;
  webhook_secret: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Sin fallback a texto plano: si falta ENCRYPTION_MASTER_KEY, `encrypt` tira y
 * no se guarda nada. Antes se guardaba la clave en claro sin avisar.
 */
const API_KEY_FIELD = "zernio_integrations.api_key";

function storeApiKey(apiKey: string, organizationId: string): string {
  return encrypt(apiKey, { field: API_KEY_FIELD, organizationId });
}

export function readStoredApiKey(stored: string, organizationId: string): string {
  return readStoredSecret(stored, { field: API_KEY_FIELD, organizationId });
}

export function getZernioChannelStatus(
  accounts: ZernioConnectedAccount[]
): ZernioChannelStatus {
  const platforms = new Set(
    accounts.map((account) => account.platform.toLowerCase())
  );
  return {
    hasInstagram: platforms.has("instagram"),
    hasWhatsapp: platforms.has("whatsapp"),
  };
}

export function formatZernioChannelsLabel(status: ZernioChannelStatus): string {
  const parts: string[] = [];
  parts.push(
    status.hasInstagram ? "Instagram Direct" : "Instagram: pendiente en Zernio"
  );
  parts.push(
    status.hasWhatsapp
      ? "WhatsApp"
      : "WhatsApp: no configurado en Zernio"
  );
  return parts.join(" · ");
}

export async function getZernioIntegrationForOrg(
  organizationId: string
): Promise<ZernioIntegrationRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("zernio_integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const rawProfileId = data.zernio_profile_id as string;
  const normalizedProfileId = extractProfileId(rawProfileId) || rawProfileId;

  // Self-heal: corregir valores legacy guardados como JSON completo
  if (normalizedProfileId !== rawProfileId) {
    void admin
      .from("zernio_integrations")
      .update({
        zernio_profile_id: normalizedProfileId,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .then(({ error: healError }) => {
        if (healError) {
          console.warn("[Zernio] failed to self-heal zernio_profile_id", {
            organizationId,
            error: healError.message,
          });
        }
      });
  }

  return {
    ...data,
    zernio_profile_id: normalizedProfileId,
    connected_accounts: (data.connected_accounts as ZernioConnectedAccount[]) ?? [],
    api_key: (data.api_key as string | null) ?? null,
    account_name: (data.account_name as string | null) ?? null,
  } as ZernioIntegrationRow;
}

/**
 * Key de Zernio de la org: sólo la de su integración activa. Sin fallback a una
 * key global — una org sin Zernio conectado no puede leer datos de otra cuenta.
 */
export async function getZernioApiKeyForOrganization(
  organizationId: string
): Promise<string | null> {
  const row = await getZernioIntegrationForOrg(organizationId);
  if (!row?.api_key) return null;
  return readStoredApiKey(row.api_key, row.organization_id);
}

export async function getZernioClientForOrganization(
  organizationId: string
): Promise<ZernioClient> {
  const apiKey = await getZernioApiKeyForOrganization(organizationId);
  if (!apiKey) {
    throw new Error("Zernio no está conectado");
  }
  return createZernioClient(apiKey);
}

export { storeApiKey as encryptZernioApiKey };

export async function findZernioOrgByAccountId(
  accountId: string
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("zernio_integrations")
    .select("organization_id, connected_accounts")
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const accounts = (row.connected_accounts as ZernioConnectedAccount[]) ?? [];
    if (accounts.some((a) => a.accountId === accountId)) {
      return row.organization_id as string;
    }
  }

  return null;
}

export async function findZernioOrgByProfileId(
  profileId: string
): Promise<string | null> {
  const admin = createAdminClient();
  const normalized = extractProfileId(profileId) || profileId;
  const { data, error } = await admin
    .from("zernio_integrations")
    .select("organization_id, zernio_profile_id")
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const stored = extractProfileId(row.zernio_profile_id as string);
    if (stored === normalized) {
      return row.organization_id as string;
    }
  }

  return null;
}

export function mapZernioAccountToConnected(account: {
  _id: string;
  platform: string;
  username?: string;
  displayName?: string;
  profilePictureUrl?: string;
}): ZernioConnectedAccount {
  return {
    accountId: account._id,
    platform: account.platform,
    username: account.username ?? account.displayName,
    avatarUrl: account.profilePictureUrl,
  };
}

export function resolveZernioAccountName(
  accounts: ZernioConnectedAccount[],
  fallback?: string | null
): string {
  const instagram = accounts.find(
    (account) => account.platform.toLowerCase() === "instagram"
  );
  const primary = instagram ?? accounts[0];
  return (
    primary?.username ??
    fallback ??
    "Cuenta Zernio"
  );
}

export function resolveZernioProfileId(
  accounts: Array<{ profileId?: unknown; profile?: unknown }>,
  organizationId: string
): string {
  for (const account of accounts) {
    const fromProfileId = extractProfileId(account.profileId);
    if (fromProfileId) return fromProfileId;
    const fromProfile = extractProfileId(account.profile);
    if (fromProfile) return fromProfile;
  }
  return organizationId;
}

export { extractProfileId };
