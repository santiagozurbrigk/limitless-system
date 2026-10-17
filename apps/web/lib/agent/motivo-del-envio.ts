import {
  AI_KEY_REJECTED_MESSAGE,
  NO_AI_CREDENTIALS_MESSAGE,
} from "@/lib/ai/anthropic-auth-errors";
import { claudeNoCreditsUserMessage } from "@/lib/ai/anthropic-errors";
import { aiPromptSchema, firstZodError } from "@/lib/validations";

/**
 * Qué motivo de un envío rechazado le muestra la pantalla del Agente
 * (SCRUM-506).
 *
 * La ruta `/api/agent/send` manda en el evento `error` del stream el mensaje de
 * cualquier error que lanzó el envío: un rechazo con un texto para el usuario
 * (sin clave de Claude, clave rechazada, cuenta sin créditos, límite de pedidos,
 * mensaje inválido) o el texto técnico de una falla (de la base, de la red). La
 * ruta y su protocolo no cambian, así que el cliente decide con una lista de
 * los rechazos conocidos: sólo esos se muestran; cualquier otro mensaje sigue
 * con el aviso de conexión de siempre, para no mostrar nunca un texto crudo.
 *
 * Los textos salen de las mismas constantes que usa el servidor; el del límite
 * de pedidos tiene los segundos adentro (`rateLimitErrorMessage`) y se reconoce
 * por su forma, y el de validación es el que da `aiPromptSchema` para el mismo
 * texto que se envió.
 */

const LIMITE_DE_PEDIDOS = /^Demasiadas solicitudes\. Intentá de nuevo en \d+ segundos\.$/;

/** Los rechazos que la ruta manda tal cual y se muestran con el mismo texto. */
function rechazosConocidos(): string[] {
  return [
    NO_AI_CREDENTIALS_MESSAGE,
    AI_KEY_REJECTED_MESSAGE,
    claudeNoCreditsUserMessage(),
    "Sesión no válida",
    "No autenticado",
  ];
}

/**
 * El motivo para el usuario de un mensaje del evento `error`, o `null` si no es
 * un rechazo conocido (una falla: se muestra el aviso de conexión).
 */
export function motivoDelEnvio(mensaje: string, contenidoEnviado: string): string | null {
  // `requireAuthContext` lanza "Unauthorized" sin sesión o con la cuenta desactivada.
  if (mensaje === "Unauthorized") return "Sesión no válida";
  if (rechazosConocidos().includes(mensaje)) return mensaje;
  if (LIMITE_DE_PEDIDOS.test(mensaje)) return mensaje;
  const validacion = aiPromptSchema.safeParse(contenidoEnviado);
  if (!validacion.success && firstZodError(validacion.error) === mensaje) return mensaje;
  return null;
}

/** Un envío que la ruta rechazó con un motivo conocido: su `message` se muestra. */
export class EnvioRechazado extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "EnvioRechazado";
  }
}

export const TITULO_ENVIO_FALLIDO = "No se pudo enviar el mensaje";
export const TEXTO_DE_CONEXION = "Revisá tu conexión o la API de Claude e intentá de nuevo.";

/** El aviso de la pantalla del Agente cuando falla un envío. */
export function avisoDeEnvioFallido(error: unknown): {
  title: string;
  description: string;
  variant: "default";
} {
  return {
    title: TITULO_ENVIO_FALLIDO,
    description: error instanceof EnvioRechazado ? error.message : TEXTO_DE_CONEXION,
    variant: "default",
  };
}
