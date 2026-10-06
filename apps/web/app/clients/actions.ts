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
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
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

/** Código de PostgREST cuando `.single()` no encuentra la fila. */
const SIN_FILAS = "PGRST116";
/** Código de Postgres de una clave foránea que apunta a algo que no existe. */
const REFERENCIA_INEXISTENTE = "23503";

const SUPABASE_NO_CONFIGURADO = "Supabase no configurado";
const CLIENTE_NO_ENCONTRADO = "No se encontró el cliente. Puede que lo hayan eliminado.";
const REFERENCIA_DEL_CLIENTE_INEXISTENTE =
  "El plan o la llamada que elegiste ya no existe. Recargá la página e intentá de nuevo.";

/**
 * ⭐ Traduce el error de PostgREST de una escritura de clientes (SCRUM-497).
 *
 * Los rechazos que se conocen vuelven con un mensaje para el usuario
 * (`ErrorEsperable`). Cualquier otro (la red, una RLS que rechaza, una
 * constraint) es una `FallaDeLaBase`: `mutacionConErroresEsperables` la
 * registra, la manda a Sentry y el usuario ve el texto fijo, nunca el mensaje
 * técnico de la base.
 */
function errorDeEscritura(error: { message: string; code?: string | null }): Error {
  if (error.code === SIN_FILAS) return new ErrorEsperable(CLIENTE_NO_ENCONTRADO);
  if (error.code === REFERENCIA_INEXISTENTE) {
    return new ErrorEsperable(REFERENCIA_DEL_CLIENTE_INEXISTENTE);
  }
  if (isMissingTableError(error.message)) {
    return new ErrorEsperable(
      "Falta la tabla clients en Supabase. Aplicá las migraciones de supabase/migrations."
    );
  }
  if (error.message.includes("infinite recursion")) {
    return new ErrorEsperable(
      "Error de políticas RLS en Supabase. Ejecuta supabase/migrations/20260521200000_fix_rls_recursion.sql y vuelve a intentar."
    );
  }
  return new FallaDeLaBase(error);
}

function exigirSupabase() {
  if (!isSupabaseConfigured()) throw new ErrorEsperable(SUPABASE_NO_CONFIGURADO);
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

/**
 * SCRUM-497: las mutaciones de clientes devuelven sus errores esperables
 * (validación, permiso, Supabase no configurado, sesión, cliente inexistente o
 * de otra org) como valor. Corren dentro de `mutacionConErroresEsperables`:
 * sólo un `ErrorEsperable` vuelve con su mensaje; lo inesperado (la red, la
 * base, un bug) se registra, va a Sentry y vuelve con el texto fijo. Ninguna
 * de estas acciones redirige.
 */
export async function createClientAction(
  input: unknown
): Promise<MutationResult<Client>> {
  return mutacionConErroresEsperables("[createClient]", async () => {
    exigirSupabase();

    const organizationId = await requireOrganizationId();

    const parsed = createClientSchema.safeParse(input);
    if (!parsed.success) {
      throw new ErrorEsperable(firstZodError(parsed.error));
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

    if (error) throw errorDeEscritura(error);
    if (!data) throw new FallaDeLaBase({ message: "El alta no devolvió el cliente creado" });

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
  });
}

/**
 * Los errores por fila (validación del archivo) siguen viniendo en `errors`
 * del dato, como antes; lo que antes lanzaba vuelve como el error del
 * `MutationResult`.
 */
export async function importClientsAction(
  rows: unknown[]
): Promise<MutationResult<ImportClientsResult>> {
  return mutacionConErroresEsperables("[importClients]", async () => {
    exigirSupabase();

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

    if (error) throw errorDeEscritura(error);

    revalidarClientes();
    return { insertedCount: parsedRows.length, errors: [] };
  });
}

export async function deleteClientAction(id: string): Promise<MutationResult> {
  return mutacionConErroresEsperables("[deleteClient]", async () => {
    exigirSupabase();

    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_BORRAR_CLIENTES, SIN_PERMISO_BORRAR_CLIENTES);

    const idParsed = uuidSchema.safeParse(id);
    if (!idParsed.success) {
      throw new ErrorEsperable(firstZodError(idParsed.error));
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", idParsed.data)
      .eq("organization_id", organizationId);

    if (error) throw errorDeEscritura(error);

    revalidarClientes();
  });
}

export async function assignClientPlanAction(
  clientId: string,
  planId: string | null,
  selectedInstallmentSystemId?: string | null
): Promise<MutationResult<Client>> {
  return updateClientAction(clientId, {
    planId: planId ?? undefined,
    selectedInstallmentSystemId: selectedInstallmentSystemId ?? undefined,
  });
}

export async function updateClientAction(
  id: string,
  patch: unknown
): Promise<MutationResult<Client>> {
  return mutacionConErroresEsperables("[updateClient]", async () => {
    exigirSupabase();

    const organizationId = await requireOrganizationId();

    const idParsed = uuidSchema.safeParse(id);
    if (!idParsed.success) {
      throw new ErrorEsperable(firstZodError(idParsed.error));
    }

    const patchParsed = updateClientSchema.safeParse(patch);
    if (!patchParsed.success) {
      throw new ErrorEsperable(firstZodError(patchParsed.error));
    }

    const supabase = await createClient();
    const updateRow = patchToUpdateRow(patchParsed.data);

    // `.single()` sin filas (PGRST116): el cliente no existe o es de otra
    // organización.
    const { data, error } = await supabase
      .from("clients")
      .update(updateRow)
      .eq("id", idParsed.data)
      .eq("organization_id", organizationId)
      .select()
      .single();

    if (error) throw errorDeEscritura(error);
    if (!data) throw new ErrorEsperable(CLIENTE_NO_ENCONTRADO);

    revalidarClientes();
    return rowToClient(data as ClientRow);
  });
}
