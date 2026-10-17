/**
 * El aviso de la pantalla del Agente cuando falla un envío por
 * `/api/agent/send` (SCRUM-506).
 *
 * La ruta manda en el evento `error` del stream un texto para el usuario: el
 * motivo de un rechazo esperable (sin clave de Claude, clave rechazada, sin
 * créditos, límite de pedidos, sesión, mensaje inválido, conversación que no
 * existe) o un texto fijo ante una falla; nunca el texto de la base ni de
 * Anthropic (`app/api/agent/send/route.ts`). La pantalla lo muestra tal cual.
 * El aviso de conexión de siempre queda para lo que no llega como evento: la
 * red caída o un stream que se cortó sin respuesta.
 */

/** Un envío que la ruta rechazó con un evento `error`: su `message` se muestra. */
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

/** El aviso cuando el envío salió pero no se pudieron releer los mensajes. */
export const TITULO_SIN_ACTUALIZAR = "No se pudo actualizar la conversación";
