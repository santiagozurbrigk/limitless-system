"use server";

import {
  isMissingTableError,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import {
  clientToInsertRow,
  patchToUpdateRow,
  rowToClient,
  type ClientRow,
} from "@/lib/clients/mapper";
import { revalidatePath } from "next/cache";
import { paths } from "@/routes";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { attributeSaleToUTM } from "@/lib/utm/attribute-booking";
import { attributeLeadMagnetToClient } from "@/lib/marketing/lead-magnets-internal";
import { repairClosingConversationLinks } from "@/lib/conversations/repair-links";
import {
  createClientSchema,
  firstZodError,
  updateClientSchema,
  uuidSchema,
} from "@/lib/validations";
import type { Client } from "@/types/clients";
import {
  requireOrgRole,
  ROLES_BORRAR_CLIENTES,
  SIN_PERMISO_BORRAR_CLIENTES,
} from "@/lib/auth/require-org-role";

export type ImportClientsRowError = {
  row: number;
  message: string;
};

export type ImportClientsResult = {
  insertedCount: number;
  errors: ImportClientsRowError[];
};

/**
 * ⭐ Avisa a las pantallas que la lista de clientes cambió.
 *
 * Este archivo no tenía **ninguna** llamada a `revalidatePath`: cargabas un
 * cliente, volvías a la lista y no estaba hasta apretar F5. Next sirve la
 * página cacheada hasta que alguien le dice que se quedó vieja, y nadie se lo
 * decía.
 *
 * Se revalidan también el panel y la revisión semanal porque los dos cuentan
 * clientes: si sólo se refrescara la lista, los números de al lado seguirían
 * mostrando el total de antes.
 */
function revalidarClientes() {
  revalidatePath(paths.platform.clients.root);
  revalidatePath(paths.platform.clients.wins);
  revalidatePath(paths.platform.clients.weeklyReview);
  revalidatePath(paths.platform.dashboard);
}

export async function listClientsAction(): Promise<Client[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select(
      // El autor de la marca de satisfacción viene embebido: mostrar "marcada
      // el 3 de marzo" sin decir por quién deja el dato a medias — una
      // impresión tiene dueño.
      "*, satisfaction_author:profiles!clients_satisfaction_updated_by_fkey(full_name, email)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error.message)) {
      console.error(
        "[listClients] Ejecuta supabase/migrations/20260521100000_clients.sql en el SQL Editor de Supabase."
      );
    } else {
      console.error("[listClients]", error.message);
    }
    return [];
  }

  return (data as ClientRow[]).map(rowToClient);
}

export async function createClientAction(input: unknown): Promise<Client> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase no configurado");
  }

  const organizationId = await requireOrganizationId();

  const parsed = createClientSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(firstZodError(parsed.error));
  }

  const supabase = await createClient();
  const insertPayload = clientToInsertRow(parsed.data, organizationId);

  if (parsed.data.closingCallId) {
    await repairClosingConversationLinks(supabase, organizationId);
  }

  const { data, error } = await supabase
    .from("clients")
    .insert(insertPayload)
    .select()
    .single();

  if (error || !data) {
    const msg = error?.message ?? "No se pudo crear el cliente";
    if (isMissingTableError(msg)) {
      throw new Error(
        "Falta la tabla clients en Supabase. Aplicá las migraciones de supabase/migrations."
      );
    }
    if (msg.includes("infinite recursion")) {
      throw new Error(
        "Error de políticas RLS en Supabase. Ejecuta supabase/migrations/20260521200000_fix_rls_recursion.sql y vuelve a intentar."
      );
    }
    throw new Error(msg);
  }

  const saved = rowToClient(data as ClientRow);

  await attributeSaleToUTM({
    organizationId,
    clientId: saved.id,
    closingCallId: saved.closingCallId,
    revenue: saved.totalAmount,
  }).catch((err) => {
    console.error("[CreateClient] Error en atribución UTM de venta:", err);
  });

  // Atribuir al último Lead Magnet que recibió este lead (por nombre)
  await attributeLeadMagnetToClient({
    organizationId,
    clientId: saved.id,
    clientName: saved.name,
    revenueAmount: saved.totalAmount ?? undefined,
  }).catch((err) => {
    console.error("[CreateClient] Error en atribución Lead Magnet:", err);
  });

  revalidarClientes();
  return saved;
}

export async function importClientsAction(
  rows: unknown[]
): Promise<ImportClientsResult> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase no configurado");
  }

  const organizationId = await requireOrganizationId();
  const errors: ImportClientsRowError[] = [];
  const parsedRows: Omit<Client, "id">[] = [];

  rows.forEach((row, index) => {
    const parsed = createClientSchema.safeParse(row);
    if (!parsed.success) {
      errors.push({ row: index + 2, message: firstZodError(parsed.error) });
      return;
    }
    parsedRows.push(parsed.data);
  });

  if (errors.length > 0) {
    return { insertedCount: 0, errors };
  }

  if (parsedRows.length === 0) {
    return {
      insertedCount: 0,
      errors: [{ row: 1, message: "El archivo no contiene clientes para importar" }],
    };
  }

  const supabase = await createClient();
  const insertPayload = parsedRows.map((client) =>
    clientToInsertRow(client, organizationId)
  );

  const { error } = await supabase.from("clients").insert(insertPayload);

  if (error) {
    throw new Error(error.message);
  }

  revalidarClientes();
  return { insertedCount: parsedRows.length, errors: [] };
}

export async function deleteClientAction(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase no configurado");
  }

  const organizationId = await requireOrganizationId();
  await requireOrgRole(ROLES_BORRAR_CLIENTES, SIN_PERMISO_BORRAR_CLIENTES);

  const idParsed = uuidSchema.safeParse(id);
  if (!idParsed.success) {
    throw new Error(firstZodError(idParsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", idParsed.data)
    .eq("organization_id", organizationId);

  if (error) {
    throw new Error(error.message ?? "No se pudo eliminar el cliente");
  }

  revalidarClientes();
}

export async function assignClientPlanAction(
  clientId: string,
  planId: string | null,
  selectedInstallmentSystemId?: string | null
): Promise<Client> {
  return updateClientAction(clientId, {
    planId: planId ?? undefined,
    selectedInstallmentSystemId: selectedInstallmentSystemId ?? undefined,
  });
}

export async function updateClientAction(
  id: string,
  patch: unknown
): Promise<Client> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase no configurado");
  }

  const organizationId = await requireOrganizationId();

  const idParsed = uuidSchema.safeParse(id);
  if (!idParsed.success) {
    throw new Error(firstZodError(idParsed.error));
  }

  const patchParsed = updateClientSchema.safeParse(patch);
  if (!patchParsed.success) {
    throw new Error(firstZodError(patchParsed.error));
  }

  const supabase = await createClient();
  const updateRow = patchToUpdateRow(patchParsed.data);

  const { data, error } = await supabase
    .from("clients")
    .update(updateRow)
    .eq("id", idParsed.data)
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo actualizar el cliente");
  }

  revalidarClientes();
  return rowToClient(data as ClientRow);
}
