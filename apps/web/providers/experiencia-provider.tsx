"use client";

import { createContext, useContext } from "react";
import type { OrganizationExperience } from "@/lib/organization/experience";

/**
 * La experiencia de la organización activa, en el cliente (SCRUM-524).
 *
 * La lee una sola vez el layout de la plataforma con
 * `getOrganizationExperience()` y llega acá por props, como la zona horaria. La
 * usan la barra y la paleta de comandos para armar el menú. El default es
 * `full`, lo mismo que devuelve la lectura cuando falla: fuera del provider
 * nadie pierde el menú completo.
 */
const ExperienciaCtx = createContext<OrganizationExperience>("full");

export function ExperienciaProvider({
  experiencia,
  children,
}: {
  experiencia: OrganizationExperience;
  children?: React.ReactNode;
}) {
  return <ExperienciaCtx.Provider value={experiencia}>{children}</ExperienciaCtx.Provider>;
}

/** La experiencia de la organización activa (`full` fuera del provider). */
export function useExperiencia(): OrganizationExperience {
  return useContext(ExperienciaCtx);
}
