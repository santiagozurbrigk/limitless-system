"use server";

/**
 * La facturación del **negocio del cliente**, mes a mes.
 *
 * ⚠️ No confundir con `app/clients/payment-actions.ts`: eso es lo que el cliente
 * nos paga a nosotros. Esto es lo que el cliente gana, que es la métrica de si
 * el acompañamiento está sirviendo.
 *
 * ⭐ Es del add-on `growth_partners`: sin él las lecturas vuelven vacías y las
 * escrituras se rechazan.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getCurrentProfile,
  isMissingTableError,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import { orgHasAddOn } from "@/lib/auth/add-ons";
import { createClient } from "@/lib/supabase/server";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { respaldoDeLectura } from "@/lib/server/lectura-degradable";
import { firstZodError } from "@/lib/validations";
import {
  normalizePeriod,
  rowToRevenueEntry,
  summarizeRevenue,
  type ClientRevenueEntry,
  type ClientRevenueRow,
  type RevenueSummary,
} from "@/lib/clients/revenue";
import { paths } from "@/routes";

const ADD_ON = "growth_partners" as const;

const COLUMNS = "id, client_id, amount, currency, period, note, created_at";

const entrySchema = z.object({
  clientId: z.string().uuid(),
  amount: z
    .number({ error: "La facturación tiene que ser un número." })
    .finite()
    .min(0, "La facturación no puede ser negativa.")
    .max(1_000_000_000, "Ese monto es demasiado grande."),
  currency: z.enum(["USD", "ARS"]).default("USD"),
  period: z.string().min(4, "Elegí un mes."),
  note: z.string().trim().max(300).default(""),
  /**
   * ⭐ El mes que se está corrigiendo, si se entró por «Editar».
   *
   * Existe por un solo caso: alguien cargó agosto y en realidad era julio. El
   * upsert de abajo escribe julio, pero agosto quedaría ahí — corregir el mes
   * habría creado un mes de más en vez de mover el que estaba.
   */
  replacesEntryId: z.string().uuid().nullish(),
});

/**
 * SCRUM-516: las acciones de facturación devuelven sus errores esperables como
 * valor (`MutationResult`), dentro de `mutacionConErroresEsperables`.
 * Validación, sesión, add-on no habilitado y cliente o mes de otra
 * organización vuelven con su motivo; lo inesperado se registra, va a Sentry y
 * vuelve con el texto fijo. Antes el texto crudo de la base llegaba a la
 * tarjeta, y la lista devolvía `[]` ante una falla: la ficha decía "sin
 * facturación cargada".
 */

/** El mismo texto que `requireAddOn`, como rechazo esperable. */
const SIN_ADD_ON = "Esta función no está habilitada para tu organización.";
const CLIENTE_AJENO = "No se encontró ese cliente en tu organización.";

/**
 * `requireAddOn` lanza un `Error` común, que `mutacionConErroresEsperables`
 * tomaría como falla. Es la misma pregunta (`orgHasAddOn`) con el mismo texto,
 * como `ErrorEsperable`.
 */
async function exigirGrowthPartners(organizationId: string) {
  if (!(await orgHasAddOn(organizationId, ADD_ON))) throw new ErrorEsperable(SIN_ADD_ON);
}

export async function listClientRevenueAction(
  clientId: string
): Promise<MutationResult<ClientRevenueEntry[]>> {
  return mutacionConErroresEsperables("[listClientRevenue]", async () => {
    const organizationId = await requireOrganizationId();
    if (!(await orgHasAddOn(organizationId, ADD_ON))) return [];
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("client_revenue_entries")
      .select(COLUMNS)
      .eq("organization_id", organizationId)
      .eq("client_id", clientId)
      .order("period", { ascending: false });

    if (error) {
      // Sin la tabla, la ficha muestra la tarjeta vacía en vez de romperse.
      if (isMissingTableError(error.message)) return [];
      throw new FallaDeLaBase(error);
    }

    return ((data ?? []) as ClientRevenueRow[]).map(rowToRevenueEntry);
  });
}

/**
 * Carga (o corrige) la facturación de un mes.
 *
 * ⭐ Es un upsert por `(cliente, mes)`. Cargar dos veces el mismo mes lo
 * corrige; dos filas del mismo período serían dos verdades sobre lo mismo.
 */
export async function saveClientRevenueAction(
  input: z.input<typeof entrySchema>
): Promise<MutationResult<ClientRevenueEntry>> {
  return mutacionConErroresEsperables("[saveClientRevenue]", async () => {
    const parsed = entrySchema.safeParse(input);
    if (!parsed.success) throw new ErrorEsperable(firstZodError(parsed.error));
    const values = parsed.data;

    const period = normalizePeriod(values.period);
    if (!period) throw new ErrorEsperable("Ese mes no se entiende. Elegilo del calendario.");

    const organizationId = await requireOrganizationId();
    await exigirGrowthPartners(organizationId);
    const profile = await getCurrentProfile();
    const supabase = await createClient();

    // La pertenencia del cliente se chequea con la sesión del usuario.
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", values.clientId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (clientError) throw new FallaDeLaBase(clientError);
    if (!client) throw new ErrorEsperable(CLIENTE_AJENO);

    const { data, error } = await supabase
      .from("client_revenue_entries")
      .upsert(
        {
          organization_id: organizationId,
          client_id: values.clientId,
          amount: values.amount,
          currency: values.currency,
          period,
          note: values.note || null,
          recorded_by: profile?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "client_id,period" }
      )
      .select(COLUMNS)
      .single();

    if (error) throw new FallaDeLaBase(error);

    const guardada = rowToRevenueEntry(data as ClientRevenueRow);

    /*
      Se estaba corrigiendo un mes y le cambiaron el mes: la fila vieja ya no
      representa nada. Si el mes no cambió, el upsert la pisó y `id` es el
      mismo, así que no hay nada que borrar.
    */
    if (values.replacesEntryId && values.replacesEntryId !== guardada.id) {
      const { error: errorBorrado } = await supabase
        .from("client_revenue_entries")
        .delete()
        .eq("id", values.replacesEntryId)
        .eq("organization_id", organizationId)
        .eq("client_id", values.clientId);
      if (errorBorrado) throw new FallaDeLaBase(errorBorrado);
    }

    revalidatePath(paths.platform.clients.detail(values.clientId));
    revalidatePath(paths.platform.clients.root);
    return guardada;
  });
}

export async function deleteClientRevenueAction(
  entryId: string
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[deleteClientRevenue]", async () => {
    const organizationId = await requireOrganizationId();
    await exigirGrowthPartners(organizationId);
    const supabase = await createClient();

    const { error } = await supabase
      .from("client_revenue_entries")
      .delete()
      .eq("id", entryId)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);
  });
}

/**
 * El último mes facturado de **cada** cliente, para la tabla.
 *
 * Una consulta para toda la organización, agrupada en memoria: pedir el
 * historial por fila sería una consulta por cliente.
 *
 * La compone el tablero de Clientes (`getClientsBoardAction`), que espera el
 * dato y no un `MutationResult`: si falla, la tabla sigue sin la columna de
 * facturación y la falla queda registrada (`respaldoDeLectura`, SCRUM-516).
 * Antes se perdía sin rastro.
 */
export async function getRevenueByClientAction(): Promise<
  Record<string, RevenueSummary>
> {
  try {
    const organizationId = await requireOrganizationId();
    if (!(await orgHasAddOn(organizationId, ADD_ON))) return {};
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("client_revenue_entries")
      .select(COLUMNS)
      .eq("organization_id", organizationId)
      .order("period", { ascending: false });

    if (error) {
      if (isMissingTableError(error.message)) return {};
      throw new FallaDeLaBase(error);
    }

    const porCliente = new Map<string, ClientRevenueEntry[]>();
    for (const row of (data ?? []) as ClientRevenueRow[]) {
      const entry = rowToRevenueEntry(row);
      const lista = porCliente.get(entry.clientId) ?? [];
      lista.push(entry);
      porCliente.set(entry.clientId, lista);
    }

    const result: Record<string, RevenueSummary> = {};
    for (const [clientId, entries] of porCliente) {
      result[clientId] = summarizeRevenue(entries);
    }
    return result;
  } catch (error) {
    return respaldoDeLectura("clientes:facturacion-por-cliente", error, {});
  }
}
