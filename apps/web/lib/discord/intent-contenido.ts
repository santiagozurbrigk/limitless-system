/**
 * ¿Le falta al bot el intent MESSAGE CONTENT?
 *
 * Sin ese intent Discord le manda al bot todos los mensajes con el texto en
 * blanco: el bot guarda una fila por mensaje y todas quedan vacías. Pero un
 * mensaje vacío suelto no prueba nada: una foto sin epígrafe, un sticker o un
 * mensaje reenviado también llegan sin texto aunque el intent esté activado.
 *
 * ⭐ Por eso se mira la tendencia de los últimos mensajes y no el total
 * histórico: con el intent apagado, casi todos los recientes vienen vacíos.
 * Antes se marcaba error con un solo mensaje vacío en toda la historia, y una
 * comunidad que comparte fotos quedaba "Con error" para siempre.
 */

/** Cuántos mensajes recientes se miran. */
export const MENSAJES_RECIENTES_A_REVISAR = 50;
/** Con menos mensajes que esto no se diagnostica nada. */
export const MINIMO_PARA_DIAGNOSTICAR = 5;
/** Proporción de mensajes sin texto (y sin adjuntos) a partir de la cual se avisa. */
export const PROPORCION_VACIOS_PARA_AVISAR = 0.8;

export type MensajeReciente = {
  content: string | null;
  attachments: unknown;
};

export type DiagnosticoIntentContenido = {
  faltaIntent: boolean;
  revisados: number;
  /** Mensajes sin texto y sin adjuntos: los que sí pueden delatar el intent apagado. */
  vacios: number;
};

function tieneAdjuntos(attachments: unknown): boolean {
  return Array.isArray(attachments) && attachments.length > 0;
}

/** Recibe los mensajes más recientes primero; mira como mucho los últimos 50. */
export function diagnosticarIntentDeContenido(
  recientes: MensajeReciente[],
): DiagnosticoIntentContenido {
  const revisados = recientes.slice(0, MENSAJES_RECIENTES_A_REVISAR);
  const vacios = revisados.filter(
    (m) => !m.content?.trim() && !tieneAdjuntos(m.attachments),
  ).length;

  const faltaIntent =
    revisados.length >= MINIMO_PARA_DIAGNOSTICAR &&
    vacios / revisados.length >= PROPORCION_VACIOS_PARA_AVISAR;

  return { faltaIntent, revisados: revisados.length, vacios };
}
