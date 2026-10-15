import { AI_KEY_REJECTED_MESSAGE } from "@/lib/ai/anthropic-auth-errors";
import { claudeNoCreditsUserMessage } from "@/lib/ai/anthropic-errors";
import { ErrorEsperable } from "@/lib/server/error-esperable";

/**
 * Un rechazo conocido de Claude (la clave de la organización fue rechazada o
 * la cuenta no tiene créditos) pasa a `ErrorEsperable` con el mismo texto: es
 * algo que el usuario arregla en Ajustes, no una falla. Cualquier otro error
 * vuelve tal cual. `callClaudeText` y sus hermanas lanzan esos dos como `Error`
 * común (`lib/ai/anthropic.ts`). Es lo mismo que `rechazoDeClaude` de
 * `app/clients/plan-duration-actions.ts` (SCRUM-516), para Marketing (SCRUM-519).
 */
export function rechazoConocidoDeClaude(error: unknown): unknown {
  if (
    error instanceof Error &&
    error.constructor === Error &&
    (error.message === AI_KEY_REJECTED_MESSAGE || error.message === claudeNoCreditsUserMessage())
  ) {
    return new ErrorEsperable(error.message);
  }
  return error;
}
