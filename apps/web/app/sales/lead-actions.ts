"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import {
  buildLeadThread,
  isActionable,
  type LeadAttempt,
  type LeadQualification,
  type LeadThread,
  type LeadThreadState,
  type NextAction,
} from "@/lib/sales/lead-thread";
import {
  closingActionSlugs,
  findOption,
  needsDate,
  selectableOptions,
  type FollowUpCatalog,
} from "@/lib/sales/follow-up-options";
import { leerCatalogoDeSeguimiento } from "@/lib/sales/catalogo-de-seguimiento";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { leerZonaHorariaDeLaOrganizacion } from "@/lib/fechas/organizacion";
import type { ClosingCallStatus } from "@/types/closing";
import { paths } from "@/routes";

/**
 * Seguimiento de leads: el hilo de intentos y lo que hay que hacer con cada uno.
 *
 * SCRUM-504: las acciones devuelven sus errores como valor (`MutationResult`).
 * Sesión y validación (valor que no está en el catálogo, archivado, sin fecha)
 * vuelven con su motivo; un error de la base se registra, va a Sentry y vuelve
 * con el texto fijo (antes llegaba el mensaje crudo de la base).
 */

const ATTEMPT_COLUMNS =
  "id, scheduled_at, status, next_action, next_action_at, next_action_owner_id, next_action_notes, pre_call_qualification, post_call_qualification";

type AttemptRow = {
  id: string;
  scheduled_at: string;
  status: ClosingCallStatus;
  next_action: NextAction | null;
  next_action_at: string | null;
  next_action_owner_id: string | null;
  next_action_notes: string | null;
  pre_call_qualification: LeadQualification | null;
  post_call_qualification: LeadQualification | null;
};

function rowToAttempt(row: AttemptRow): LeadAttempt {
  return {
    id: row.id,
    scheduledAt: row.scheduled_at,
    status: row.status,
    nextAction: row.next_action,
    nextActionAt: row.next_action_at,
    nextActionOwnerId: row.next_action_owner_id,
    nextActionNotes: row.next_action_notes,
    preCallQualification: row.pre_call_qualification,
    postCallQualification: row.post_call_qualification,
  };
}

export type LeadSummary = {
  leadId: string;
  name: string;
  email: string | null;
  thread: LeadThread;
  /** Cliente en que se convirtió, si compró. */
  clientId: string | null;
};

// ─── La tabla ────────────────────────────────────────────────────────────────

/**
 * Una fila de la tabla de seguimiento.
 *
 * Trae ya resuelto lo que se ve y lo que se edita, más el hilo completo para el
 * panel de detalle: son ~1 consulta por página en vez de una por fila abierta.
 */
export type LeadTableRow = {
  leadId: string;
  name: string;
  email: string | null;
  phone: string | null;
  clientId: string | null;
  state: LeadThreadState;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastStatus: ClosingCallStatus | null;
  qualification: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  nextActionOwnerId: string | null;
  nextActionNotes: string | null;
  /**
   * Turno sobre el que escriben las ediciones de la fila.
   *
   * Es el intento accionable cuando lo hay; si no, el más reciente — editar un
   * lead ganado o perdido tiene que seguir siendo posible.
   */
  targetAttemptId: string | null;
  /** Del más reciente al más viejo, para el panel de detalle. */
  attempts: LeadAttempt[];
};

export type LeadTableScope = "pending" | "all";
export type LeadTableSort = "urgency" | "recent" | "name" | "next_action_at";

export type LeadTableParams = {
  scope?: LeadTableScope;
  /** Un estado puntual, o "all". */
  state?: LeadThreadState | "all";
  search?: string;
  sort?: LeadTableSort;
  page?: number;
  pageSize?: number;
};

export type LeadTableResult = {
  rows: LeadTableRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Cuántos leads hay en cada estado, sobre el total (no sobre la página). */
  counts: Record<LeadThreadState, number>;
  catalog: FollowUpCatalog;
  /**
   * Se alcanzó el techo de lectura y hay leads que no entraron.
   *
   * El estado se **deriva** de los turnos, no se guarda, así que no se puede
   * filtrar ni paginar en SQL. A esta escala se resuelve en memoria; el día que
   * no alcance, hay que derivarlo en la base. Decirlo es preferible a mostrar
   * una tabla incompleta como si fuera todo.
   */
  truncated: boolean;
};

/** Techo de lectura. Ver `truncated`. */
const MAX_LEADS = 2000;
const DEFAULT_PAGE_SIZE = 50;

/** Orden de urgencia: el compromiso incumplido primero. */
const URGENCY: Record<LeadThreadState, number> = {
  follow_up_due: 0,
  pending_outcome: 1,
  stalled: 2,
  scheduled: 3,
  follow_up_planned: 4,
  won: 5,
  lost: 6,
};

const EMPTY_COUNTS: Record<LeadThreadState, number> = {
  follow_up_due: 0,
  pending_outcome: 0,
  stalled: 0,
  scheduled: 0,
  follow_up_planned: 0,
  won: 0,
  lost: 0,
};

function time(iso: string | null): number {
  if (!iso) return 0;
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? 0 : value;
}

/**
 * La tabla de seguimiento.
 *
 * ⭐ **Muestra todos los leads, no sólo los que arden.** El panel anterior sólo
 * listaba los tres estados accionables: los ganados, perdidos y agendados no se
 * veían en ninguna pantalla. Con `scope: "all"` la tabla es la base completa.
 */
export async function listLeadsTableAction(
  params: LeadTableParams = {}
): Promise<MutationResult<LeadTableResult>> {
  return mutacionConErroresEsperables("[listLeadsTable]", () => leerTablaDeLeads(params));
}

async function leerTablaDeLeads(params: LeadTableParams): Promise<LeadTableResult> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const scope = params.scope ?? "pending";
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, params.pageSize ?? DEFAULT_PAGE_SIZE));
  const sort = params.sort ?? "urgency";
  const search = (params.search ?? "").trim().toLowerCase();

  // La zona se lee una vez por pedido, no por lead: el vencimiento del próximo
  // paso se cuenta en el día de la organización (SCRUM-493).
  const [catalog, timezone] = await Promise.all([
    leerCatalogoDeSeguimiento(supabase, organizationId),
    leerZonaHorariaDeLaOrganizacion(supabase, organizationId),
  ]);
  const closing = closingActionSlugs(catalog.nextActions);

  // Paginado: PostgREST corta en 1000 filas sin avisar, así que el `.limit(2001)`
  // de antes devolvía 1000 y `truncated` no podía darse nunca.
  const { rows: data, truncated, error } = await fetchAllRows((from, to) =>
    supabase
      .from("sales_leads")
      .select(`id, name, email, phone, client_id, closing_calls(${ATTEMPT_COLUMNS})`)
      .eq("organization_id", organizationId)
      .order("id", { ascending: true })
      .range(from, to),
    { maxRows: MAX_LEADS }
  );

  // Antes devolvía la tabla vacía, como si no hubiera leads (SCRUM-504).
  if (error) throw new FallaDeLaBase({ message: error });

  const raw = data;
  const now = new Date();
  const counts = { ...EMPTY_COUNTS };
  const all: LeadTableRow[] = [];

  for (const row of raw) {
    const attempts = Array.isArray(row.closing_calls)
      ? (row.closing_calls as AttemptRow[]).map(rowToAttempt)
      : [];
    // Un lead sin turnos no es trabajo pendiente: todavía no pasó nada.
    if (attempts.length === 0) continue;

    const thread = buildLeadThread(attempts, now, timezone, closing);
    counts[thread.state] += 1;

    const target =
      thread.actionableAttemptId ?? thread.attempts[0]?.id ?? null;
    const targetAttempt = thread.attempts.find((a) => a.id === target) ?? null;
    const latest = thread.attempts[0] ?? null;

    all.push({
      leadId: row.id as string,
      name: (row.name as string) ?? "Sin nombre",
      email: (row.email as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      clientId: (row.client_id as string | null) ?? null,
      state: thread.state,
      attemptCount: thread.attemptCount,
      lastAttemptAt: latest?.scheduledAt ?? null,
      lastStatus: latest?.status ?? null,
      qualification: thread.latestQualification,
      nextAction: targetAttempt?.nextAction ?? null,
      nextActionAt: targetAttempt?.nextActionAt ?? null,
      nextActionOwnerId: targetAttempt?.nextActionOwnerId ?? null,
      nextActionNotes: targetAttempt?.nextActionNotes ?? null,
      targetAttemptId: target,
      attempts: thread.attempts,
    });
  }

  let rows = all;
  if (scope === "pending") rows = rows.filter((r) => isActionable(r.state));
  if (params.state && params.state !== "all") {
    rows = rows.filter((r) => r.state === params.state);
  }
  if (search) {
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(search) ||
        (r.email ?? "").toLowerCase().includes(search)
    );
  }

  rows = [...rows].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "es");
    if (sort === "recent") return time(b.lastAttemptAt) - time(a.lastAttemptAt);
    if (sort === "next_action_at") {
      // Los que no tienen fecha van al final, no al principio.
      const ta = a.nextActionAt ? time(a.nextActionAt) : Number.MAX_SAFE_INTEGER;
      const tb = b.nextActionAt ? time(b.nextActionAt) : Number.MAX_SAFE_INTEGER;
      return ta - tb;
    }
    const byState = URGENCY[a.state] - URGENCY[b.state];
    if (byState !== 0) return byState;
    // Dentro del mismo estado, lo más viejo primero: es lo que espera hace más.
    return time(a.lastAttemptAt) - time(b.lastAttemptAt);
  });

  const total = rows.length;
  const start = (page - 1) * pageSize;

  return {
    rows: rows.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    counts,
    catalog,
    truncated,
  };
}

/** El hilo completo de un lead. */
export async function getLeadThreadAction(
  leadId: string
): Promise<MutationResult<LeadSummary | null>> {
  return mutacionConErroresEsperables("[getLeadThread]", () => leerHiloDelLead(leadId));
}

async function leerHiloDelLead(leadId: string): Promise<LeadSummary | null> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  // La consulta del lead va primera: si armarla lanza, no quedan las otras dos
  // promesas rechazadas sin atender.
  const [{ data, error }, catalog, timezone] = await Promise.all([
    supabase
      .from("sales_leads")
      .select(`id, name, email, client_id, closing_calls(${ATTEMPT_COLUMNS})`)
      .eq("id", leadId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    leerCatalogoDeSeguimiento(supabase, organizationId),
    leerZonaHorariaDeLaOrganizacion(supabase, organizationId),
  ]);

  if (error) throw new FallaDeLaBase(error);
  if (!data) return null;

  const attempts = Array.isArray(data.closing_calls)
    ? (data.closing_calls as AttemptRow[]).map(rowToAttempt)
    : [];

  return {
    leadId: data.id as string,
    name: (data.name as string) ?? "Sin nombre",
    email: (data.email as string | null) ?? null,
    clientId: (data.client_id as string | null) ?? null,
    thread: buildLeadThread(
      attempts,
      new Date(),
      timezone,
      closingActionSlugs(catalog.nextActions)
    ),
  };
}

/**
 * Define qué sigue con una llamada que no cerró.
 *
 * `next_action = null` limpia el próximo paso, que devuelve el lead a la cola.
 */
export async function setNextActionAction(params: {
  callId: string;
  nextAction: NextAction | null;
  nextActionAt?: string | null;
  ownerId?: string | null;
  notes?: string | null;
}): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[setNextAction]", async () => {
    const organizationId = await requireOrganizationId();

    // El catálogo decide: qué valores existen y cuáles piden fecha. Antes esto era
    // una comparación contra el string `lost`, que dejaba afuera a cualquier valor
    // propio que también cierre el hilo.
    const catalog = await leerCatalogoDeSeguimiento(await createClient(), organizationId);
    const wantsDate = params.nextAction
      ? needsDate(catalog.nextActions, params.nextAction)
      : false;

    if (params.nextAction) {
      const option = findOption(catalog.nextActions, params.nextAction);
      // Un slug que no está en el catálogo no se guarda: sería un valor inventado,
      // y nada sabría después qué hacer con él.
      if (!option) {
        throw new ErrorEsperable("Ese próximo paso no existe en el catálogo.");
      }
      if (option.archived) {
        throw new ErrorEsperable("Ese valor está archivado.");
      }
      // Un próximo paso sin fecha no es un compromiso: nunca vencería, así que
      // nunca volvería a aparecer en la cola. Los valores que cierran el hilo son
      // la excepción, porque lo terminan.
      if (wantsDate && !params.nextActionAt) {
        throw new ErrorEsperable("El próximo paso necesita una fecha.");
      }
    }

    const patch: Record<string, unknown> = {
      next_action: params.nextAction,
      // Un valor que cierra el hilo no lleva fecha: no hay nada que vencer.
      next_action_at: wantsDate ? (params.nextActionAt ?? null) : null,
      updated_at: new Date().toISOString(),
    };

    if (!params.nextAction) {
      // Sin próximo paso no hay responsable ni nota del paso: son del compromiso
      // que se acaba de borrar.
      patch.next_action_owner_id = null;
      patch.next_action_notes = null;
    } else {
      // Cambiar el próximo paso desde la tabla no puede pisar el responsable ni la
      // nota que alguien ya había cargado: sólo se tocan si vienen en la llamada.
      if (params.ownerId !== undefined) patch.next_action_owner_id = params.ownerId;
      if (params.notes !== undefined) patch.next_action_notes = params.notes;
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("closing_calls")
      .update(patch)
      .eq("id", params.callId)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);

    revalidatePath(paths.platform.sales.closing);
  });
}

/**
 * Carga el seguimiento completo de una llamada en un solo guardado.
 *
 * ⭐ **Es el momento en que la información existe.** El seguimiento se cargaba
 * sólo desde la tabla, o sea después: el closer marcaba "no cerró", cerraba la
 * pantalla y el próximo paso quedaba para más tarde — que en los datos reales
 * significaba nunca (de 1.027 turnos, cero tenían resultado). Al pedirlo en el
 * mismo modal donde se marca el resultado, se carga cuando el closer todavía
 * tiene la llamada fresca.
 *
 * Calificación y próximo paso van en un solo UPDATE: dos guardados podían dejar
 * una llamada calificada sin próximo paso, que es justo el estado que el módulo
 * intenta evitar.
 */
export async function saveCallFollowUpAction(params: {
  callId: string;
  qualification?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
  ownerId?: string | null;
  notes?: string | null;
}): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[saveCallFollowUp]", async () => {
    const organizationId = await requireOrganizationId();
    const catalog = await leerCatalogoDeSeguimiento(await createClient(), organizationId);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (params.qualification !== undefined) {
      if (params.qualification) {
        const option = findOption(
          selectableOptions(catalog.qualifications),
          params.qualification
        );
        if (!option) {
          throw new ErrorEsperable("Esa calificación no existe en el catálogo.");
        }
      }
      patch.post_call_qualification = params.qualification;
    }

    if (params.nextAction !== undefined) {
      if (params.nextAction) {
        const option = findOption(catalog.nextActions, params.nextAction);
        if (!option) {
          throw new ErrorEsperable("Ese próximo paso no existe en el catálogo.");
        }
        if (option.archived) throw new ErrorEsperable("Ese valor está archivado.");

        const wantsDate = needsDate(catalog.nextActions, params.nextAction);
        if (wantsDate && !params.nextActionAt) {
          throw new ErrorEsperable("El próximo paso necesita una fecha.");
        }

        patch.next_action = params.nextAction;
        patch.next_action_at = wantsDate ? params.nextActionAt : null;
        patch.next_action_owner_id = params.ownerId ?? null;
        patch.next_action_notes = params.notes?.trim() || null;
      } else {
        // Sin próximo paso el lead queda en la cola como "Sin próximo paso". Es un
        // estado legítimo —a veces todavía no se sabe qué sigue— y es preferible a
        // inventar un compromiso que nadie asumió.
        patch.next_action = null;
        patch.next_action_at = null;
        patch.next_action_owner_id = null;
        patch.next_action_notes = null;
      }
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("closing_calls")
      .update(patch)
      .eq("id", params.callId)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);

    revalidatePath(paths.platform.sales.closing);
  });
}

/** Cambia sólo el responsable del próximo paso, sin tocar el resto. */
export async function setNextActionOwnerAction(params: {
  callId: string;
  ownerId: string | null;
}): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[setNextActionOwner]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("closing_calls")
      .update({
        next_action_owner_id: params.ownerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.callId)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);

    revalidatePath(paths.platform.sales.closing);
  });
}

/** Cambia sólo las notas del próximo paso. */
export async function setNextActionNotesAction(params: {
  callId: string;
  notes: string | null;
}): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[setNextActionNotes]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("closing_calls")
      .update({
        next_action_notes: params.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.callId)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);

    revalidatePath(paths.platform.sales.closing);
  });
}

/** Califica al lead, antes o después de la llamada. */
export async function setLeadQualificationAction(params: {
  callId: string;
  moment: "pre" | "post";
  qualification: LeadQualification | null;
}): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[setLeadQualification]", async () => {
    const organizationId = await requireOrganizationId();

    if (params.qualification) {
      const catalog = await leerCatalogoDeSeguimiento(await createClient(), organizationId);
      const option = findOption(
        selectableOptions(catalog.qualifications),
        params.qualification
      );
      if (!option) {
        throw new ErrorEsperable("Esa calificación no existe en el catálogo.");
      }
    }

    const supabase = await createClient();

    const column =
      params.moment === "pre" ? "pre_call_qualification" : "post_call_qualification";

    const { error } = await supabase
      .from("closing_calls")
      .update({ [column]: params.qualification, updated_at: new Date().toISOString() })
      .eq("id", params.callId)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);

    revalidatePath(paths.platform.sales.closing);
  });
}

/**
 * Cierra el ciclo lead → cliente.
 *
 * ⭐ Se llama al cerrar la venta. Sin esto el hilo se corta justo en el momento
 * más importante: el lead desaparece y el cliente aparece, sin nada que diga que
 * son la misma persona. Al revisar, los 264 clientes cargados no tenían ninguna
 * referencia al turno que los originó.
 */
export async function linkLeadToClientAction(params: {
  callId: string;
  clientId: string;
}): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[linkLeadToClient]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: call, error: callError } = await supabase
      .from("closing_calls")
      .select("lead_id")
      .eq("id", params.callId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (callError) throw new FallaDeLaBase(callError);

    const leadId = call?.lead_id as string | null | undefined;
    // Un turno sin lead es un turno sin identidad estable (sin mail ni contacto).
    // No es un error: simplemente no hay hilo que cerrar.
    if (!leadId) return;

    const { error } = await supabase
      .from("sales_leads")
      .update({ client_id: params.clientId, updated_at: new Date().toISOString() })
      .eq("id", leadId)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);
  });
}
