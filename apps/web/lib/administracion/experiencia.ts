import type { OrganizationExperience } from "@/lib/organization/experience";

/**
 * ⭐ Qué experiencia se puede elegir desde Administración y qué hereda un
 * negocio nuevo de un holding (SCRUM-551; decisiones del 5-nov en SCRUM-522).
 *
 * `limitless` es una sola organización: la de Limitless, donde está el staff
 * (índice único de SCRUM-552). No es un producto para clientes, así que:
 *   - el selector de la consola ofrece sólo `webinar` y `full`;
 *   - la org de Limitless no cambia de experiencia desde la consola (se asigna
 *     por SQL con la guía de SCRUM-532);
 *   - un negocio nuevo de un holding nunca hereda `limitless`: nace `full`
 *     (si heredara, el alta chocaría con el índice único).
 * Lógica pura, sin `server-only`: la usan las acciones y la ficha.
 */
/**
 * Los tres valores de `organizations.experience`, sin `server-only` (los lee
 * la ficha del panel con consultas que también corren en tests sin mocks). Un
 * test verifica que coincide con `EXPERIENCIAS` de `lib/organization/experience`.
 */
export const EXPERIENCIAS_GUARDADAS = ["webinar", "limitless", "full"] as const satisfies readonly OrganizationExperience[];

export function esExperienciaGuardada(valor: unknown): valor is OrganizationExperience {
  return typeof valor === "string" && (EXPERIENCIAS_GUARDADAS as readonly string[]).includes(valor);
}

export const EXPERIENCIAS_ELEGIBLES = ["webinar", "full"] as const satisfies readonly OrganizationExperience[];
export type ExperienciaElegible = (typeof EXPERIENCIAS_ELEGIBLES)[number];

export const ETIQUETA_DE_LA_EXPERIENCIA: Record<OrganizationExperience, string> = {
  webinar: "Limitless Webinars",
  full: "Limitless completo",
  limitless: "Limitless de gestión (la org de Limitless)",
};

export function esExperienciaElegible(valor: unknown): valor is ExperienciaElegible {
  return typeof valor === "string" && (EXPERIENCIAS_ELEGIBLES as readonly string[]).includes(valor);
}

export const MOTIVO_NO_ELEGIBLE =
  "Sólo se puede elegir Limitless Webinars o Limitless completo.";
export const MOTIVO_ORG_DE_LIMITLESS =
  "La organización de Limitless no cambia de experiencia desde la consola: se asigna por SQL (guía de la ventana de migraciones).";

/** Por qué no se puede pasar de `actual` a `nueva`, o `null` si se puede. */
export function motivoParaNoCambiarLaExperiencia(
  actual: OrganizationExperience,
  nueva: unknown
): string | null {
  if (!esExperienciaElegible(nueva)) return MOTIVO_NO_ELEGIBLE;
  if (actual === "limitless") return MOTIVO_ORG_DE_LIMITLESS;
  return null;
}

/** La experiencia con la que nace un negocio nuevo de un holding. */
export function experienciaDeUnNegocioNuevo(delHolding: OrganizationExperience): OrganizationExperience {
  return delHolding === "limitless" ? "full" : delHolding;
}
