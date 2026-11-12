"use server";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { ErrorEsperable, runMutation, type MutationResult } from "@/lib/server/action-result";
import { firstZodError } from "@/lib/validations";
import {
  LANZAMIENTOS_EN_PARALELO,
  datosDelLanzamientoSchema,
  editarLanzamientoSchema,
  motivoDeSuperposicion,
  type DatosDelLanzamiento,
  type DatosDelLanzamientoInput,
  type PeriodoDeLanzamiento,
} from "@/lib/webinar/lanzamientos/esquemas";
import { leerListaDeLanzamientos } from "@/lib/webinar/vistas/leer";
import { tieneValor } from "@/lib/webinar/vistas/dato";

/**
 * ⭐ Crear y editar un lanzamiento (SCRUM-529), **simuladas** como las acciones
 * de la ficha del lead (SCRUM-545): exigen organización, validan la entrada y
 * la regla de lanzamientos en paralelo, y devuelven éxito sin escribir en
 * ninguna base. La pantalla avisa que el cambio es de ejemplo. Persistir en
 * `webinar_launches` y `webinar_sessions` es `[WEBINAR-LANZAMIENTOS-PERSISTIR]`
 * (necesita el modelo de SCRUM-526 en producción).
 *
 * Primero la organización, después la entrada, como en `app/leads/actions.ts`.
 */

function validar<T>(
  resultado: { success: true; data: T } | { success: false; error: Parameters<typeof firstZodError>[0] }
): T {
  if (!resultado.success) throw new ErrorEsperable(firstZodError(resultado.error));
  return resultado.data;
}

/** Los otros lanzamientos de la cuenta, sólo si hay una regla de paralelos que aplicar. */
async function rechazarSiSePisa(datos: DatosDelLanzamiento, launchId?: string): Promise<void> {
  if (LANZAMIENTOS_EN_PARALELO === null) return;
  const lista = await leerListaDeLanzamientos();
  if (!tieneValor(lista.lanzamientos)) {
    throw new ErrorEsperable("No pudimos leer los otros lanzamientos para revisar las fechas. Intentá de nuevo.");
  }
  const otros: PeriodoDeLanzamiento[] = lista.lanzamientos.value.map((f) => ({
    id: f.lanzamiento.id,
    estado: f.lanzamiento.estado,
    captaDesde: f.lanzamiento.captaDesde,
    cierraEl: f.lanzamiento.cierraEl,
  }));
  const motivo = motivoDeSuperposicion(otros, { id: launchId, captaDesde: datos.captaDesde, cierraEl: datos.cierraEl });
  if (motivo) throw new ErrorEsperable(motivo);
}

export async function crearLanzamientoAction(
  input: DatosDelLanzamientoInput
): Promise<MutationResult<{ simulado: true; datos: DatosDelLanzamiento }>> {
  return runMutation(async () => {
    await requireOrganizationId();
    const datos = validar(datosDelLanzamientoSchema.safeParse(input));
    await rechazarSiSePisa(datos);
    return { simulado: true as const, datos };
  });
}

export async function guardarLanzamientoAction(input: {
  launchId: string;
  datos: DatosDelLanzamientoInput;
}): Promise<MutationResult<{ simulado: true; datos: DatosDelLanzamiento }>> {
  return runMutation(async () => {
    await requireOrganizationId();
    const { launchId, datos } = validar(editarLanzamientoSchema.safeParse(input));
    await rechazarSiSePisa(datos, launchId);
    return { simulado: true as const, datos };
  });
}
