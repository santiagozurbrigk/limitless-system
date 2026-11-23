"use server";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import {
  ErrorEsperable,
  runMutation,
  type MutationResult,
} from "@/lib/server/action-result";
import { firstZodError } from "@/lib/validations";
import { siguienteEtapa } from "@/lib/webinar/leads/config";
import {
  agregarNotaSchema,
  asignarResponsableSchema,
  marcarAvanceSchema,
  type AgregarNotaInput,
  type AsignarResponsableInput,
  type MarcarAvanceInput,
} from "@/lib/webinar/leads/esquemas";
import type { EtapaDelLead } from "@/lib/webinar/vistas/contratos";

/**
 * ⭐ Las tres acciones de la ficha del lead (SCRUM-545), **simuladas**: exigen
 * organización, validan la entrada y devuelven éxito sin escribir en ninguna
 * base (AC-9, DT-12). La ficha refleja el cambio sólo en su estado local y
 * avisa que no se guarda (DT-10). Persistir es `[WEBINAR-LEADS-PERSISTIR]`.
 *
 * Primero la organización, después la entrada. Lo que lance
 * `requireOrganizationId` no se atrapa acá: `runMutation` devuelve el texto de
 * una sesión no válida o una cuenta desactivada (`ErrorEsperable`) y el de una
 * cuenta sin organización, que deja un aviso en los logs sin Sentry (DT-27).
 * No se revalida ninguna ruta: nada cambió. Sin chequeo de módulo mientras no
 * lean ni escriban nada (DT-20).
 */

function validar<T>(
  resultado: { success: true; data: T } | { success: false; error: Parameters<typeof firstZodError>[0] }
): T {
  if (!resultado.success) throw new ErrorEsperable(firstZodError(resultado.error));
  return resultado.data;
}

export async function marcarAvanceDelLeadAction(
  input: MarcarAvanceInput
): Promise<MutationResult<{ etapa: EtapaDelLead }>> {
  return runMutation(async () => {
    await requireOrganizationId();
    const { etapaActual } = validar(marcarAvanceSchema.safeParse(input));
    const etapa = siguienteEtapa(etapaActual);
    if (!etapa) throw new ErrorEsperable("Esta etapa no tiene un paso siguiente.");
    return { etapa };
  });
}

export async function asignarResponsableDelLeadAction(
  input: AsignarResponsableInput
): Promise<MutationResult<{ responsableUserId: string | null }>> {
  return runMutation(async () => {
    await requireOrganizationId();
    const { responsableUserId } = validar(asignarResponsableSchema.safeParse(input));
    return { responsableUserId };
  });
}

export async function agregarNotaDelLeadAction(
  input: AgregarNotaInput
): Promise<MutationResult<{ texto: string; creadaAt: string }>> {
  return runMutation(async () => {
    await requireOrganizationId();
    const { texto } = validar(agregarNotaSchema.safeParse(input));
    return { texto, creadaAt: new Date().toISOString() };
  });
}
