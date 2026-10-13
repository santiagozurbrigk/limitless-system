import "server-only";

import type { AddOnId } from "@/lib/auth/add-on-ids";
import { orgHasAddOn } from "@/lib/auth/add-ons";
import { ErrorEsperable } from "@/lib/server/error-esperable";

/** El mismo texto que `requireAddOn` (`lib/auth/add-ons.ts`). */
export const ADD_ON_NO_HABILITADO = "Esta función no está habilitada para tu organización.";

/**
 * `requireAddOn` para una acción que devuelve sus errores como valor
 * (SCRUM-517): misma pregunta (`orgHasAddOn`) y mismo texto, pero como
 * `ErrorEsperable`. `requireAddOn` lanza un `Error` común, que
 * `mutacionConErroresEsperables` registraría como falla y le mostraría al
 * usuario el texto fijo en vez del motivo.
 */
export async function exigirAddOn(organizationId: string, addOn: AddOnId): Promise<void> {
  if (!(await orgHasAddOn(organizationId, addOn))) {
    throw new ErrorEsperable(ADD_ON_NO_HABILITADO);
  }
}
