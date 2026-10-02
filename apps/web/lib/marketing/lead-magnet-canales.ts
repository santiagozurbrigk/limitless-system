import { ESCONDIDO } from "@/lib/release/escondido";

/**
 * Qué canales se ofrecen al crear un Lead Magnet.
 *
 * ⭐ Para el release de octubre (SCRUM-490) sólo se ofrecen los que no
 * prometen una captura que no existe: el DM de Instagram, que el sistema
 * detecta, y "Manual", que dice que es a mano. Typeform, Google Forms, Landing y
 * ManyChat no registran ningún lead (el único lead magnet cargado es de DM).
 * Antes ManyChat era el canal que venía elegido.
 *
 * Los lead magnets ya guardados con otro canal se siguen mostrando igual.
 */
const CON_CAPTURA = new Set<string>(["instagram_dm", "manual"]);

export function canalesDeLeadMagnetVisibles<T extends { value: string }>(
  canales: readonly T[],
  esconder: boolean = ESCONDIDO.leadMagnetsCanalesSinCaptura
): T[] {
  return esconder ? canales.filter((c) => CON_CAPTURA.has(c.value)) : [...canales];
}
