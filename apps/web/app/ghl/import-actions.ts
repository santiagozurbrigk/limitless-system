"use server";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { listGHLContacts } from "@/lib/ghl/client";
import { getGHLCredentialsForOrg } from "@/lib/ghl/integration";
import { syncGHLContactsForOrganization, type GHLContactsSyncResult } from "@/lib/ghl/sync-contacts";
import { rechazoPorModulo } from "@/lib/auth/acceso-a-modulo";

// ─── Preview de contactos GHL ─────────────────────────────────────────────────

export type GHLContactPreview = {
  name: string;
  email: string | null;
  phone: string | null;
  dateAdded: string | null;
};

export type GHLPreviewResult = {
  total: number;
  preview: GHLContactPreview[];  // primeros 10
};

/**
 * Obtiene una previsualización de los contactos de GHL sin importar nada.
 */
export async function previewGHLContactsAction(): Promise<
  MutationResult<GHLPreviewResult>
> {
  const rechazo = await rechazoPorModulo("integrations");
  if (rechazo) return rechazo;

  return runMutation(async () => {
    if (!isSupabaseConfigured()) throw new Error("Supabase no configurado.");

    const organizationId = await requireOrganizationId();
    const { apiKey, locationId } = await getGHLCredentialsForOrg(organizationId);

    const contacts = await listGHLContacts(apiKey, locationId);

    const preview: GHLContactPreview[] = contacts.slice(0, 10).map((c) => ({
      name: [c.firstName, c.lastName].filter(Boolean).join(" ") || "Sin nombre",
      email: c.email,
      phone: c.phone,
      dateAdded: c.dateAdded,
    }));

    return { total: contacts.length, preview };
  });
}

// ─── Importar contactos GHL → clients ────────────────────────────────────────

export async function importGHLContactsAction(): Promise<
  MutationResult<GHLContactsSyncResult>
> {
  return runMutation(async () => {
    if (!isSupabaseConfigured()) throw new Error("Supabase no configurado.");

    const organizationId = await requireOrganizationId();
    const { apiKey, locationId } = await getGHLCredentialsForOrg(organizationId);

    const contacts = await listGHLContacts(apiKey, locationId);
    const admin = createAdminClient();
    const result = await syncGHLContactsForOrganization(admin, organizationId, contacts);

    console.info(
      `[ghl-import-contacts] org=${organizationId} fetched=${result.fetched} inserted=${result.inserted} skipped=${result.skippedExisting}`
    );

    return result;
  });
}
