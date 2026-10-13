"use server";

/**
 * Fijar a mano en qué fase del recorrido está un cliente.
 *
 * ⭐ El problema que resuelve, con la captura del founder delante: la fase se
 * **deduce** del último hito registrado. Un cliente que llega directo a hacer un
 * webinar con un creador queda en «Sin empezar» hasta que alguien tilde los
 * cuatro hitos de la fase anterior, que ese cliente nunca hizo. Para decir la
 * verdad sobre dónde está, había que mentir sobre lo que hizo.
 *
 * ⭐ Esto **no registra hitos**. Sólo dice "está acá". Los hitos de las fases
 * anteriores quedan sin evento y la ficha los muestra como *salteados*. Marcarlos
 * como cumplidos habría sido más barato y habría dejado el historial —el mismo
 * que alimenta los plazos, los trabados y los reportes— afirmando cosas que no
 * pasaron.
 */

import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";
import { leerFasesFijadas } from "@/lib/checkpoints/lecturas-del-recorrido";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { paths } from "@/routes";

export async function setClientManualStageAction(input: {
  clientId: string;
  /** `null` vuelve a dejar que los hitos manden. */
  stageId: string | null;
}): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[setClientManualStage]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    if (input.stageId) {
      // Una fase de otra organización colgaría el cliente de un recorrido ajeno.
      // Si la lectura falla es una falla, no "esa fase no existe".
      const { data: stage, error: stageError } = await supabase
        .from("client_journey_stages")
        .select("id")
        .eq("id", input.stageId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (stageError) throw new FallaDeLaBase(stageError);
      if (!stage) throw new ErrorEsperable("Esa fase no existe en tu recorrido.");
    }

    const { error } = await supabase
      .from("clients")
      .update({
        manual_stage_id: input.stageId,
        /**
         * ⭐ La fecha es el ancla de los plazos. Sin ella, el primer hito de la
         * fase fijada no tendría desde cuándo contar —su hito anterior no
         * existe— y el cliente nunca podría aparecer como trabado.
         */
        manual_stage_set_at: input.stageId ? new Date().toISOString() : null,
      })
      .eq("id", input.clientId)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);

    revalidatePath(paths.platform.clients.detail(input.clientId));
    revalidatePath(paths.platform.clients.root);
  });
}

/**
 * La fase fijada a mano de cada cliente, para resolver la efectiva en la tabla.
 *
 * SCRUM-517: con un error devuelve el motivo (antes, `{}`: la tabla mostraba la
 * fase deducida de los hitos como si nadie hubiera fijado ninguna).
 */
export async function getManualStagesAction(): Promise<MutationResult<Record<string, string>>> {
  return mutacionConErroresEsperables("[getManualStages]", async () => {
    const organizationId = await requireOrganizationId();
    return leerFasesFijadas(await createClient(), organizationId);
  });
}
