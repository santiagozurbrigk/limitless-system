/**
 * Textos de las claves de ingesta (SCRUM-527) que comparten las acciones y el
 * panel. Viven fuera de `app/webinar/claves-de-ingesta-actions.ts` porque un
 * archivo "use server" sólo puede exportar funciones.
 */

/**
 * Revocar una clave de otra organización, inexistente o ya revocada. El panel
 * lo reconoce para cerrar la confirmación y releer la lista (AR pasada 1): la
 * lista que tiene está vieja, por ejemplo porque otra pestaña ya la revocó.
 */
export const CLAVE_DE_INGESTA_INEXISTENTE = "No encontramos esa clave o ya estaba revocada.";
