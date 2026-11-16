"use client";

import { createContext, useContext, useMemo } from "react";
import { paths } from "@/routes/paths";
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
type Valor = { experiencia: OrganizationExperience; inicio: string };

const ExperienciaCtx = createContext<Valor>({
  experiencia: "full",
  inicio: paths.platform.dashboard,
});

/**
 * `inicio`: la pantalla de inicio de quien mira (`pantallaDeInicio` con sus
 * permisos), calculada en el servidor. La usan el logo y la paleta.
 */
export function ExperienciaProvider({
  experiencia,
  inicio,
  children,
}: {
  experiencia: OrganizationExperience;
  inicio: string;
  children?: React.ReactNode;
}) {
  const valor = useMemo(() => ({ experiencia, inicio }), [experiencia, inicio]);
  return <ExperienciaCtx.Provider value={valor}>{children}</ExperienciaCtx.Provider>;
}

/** La experiencia de la organización activa (`full` fuera del provider). */
export function useExperiencia(): OrganizationExperience {
  return useContext(ExperienciaCtx).experiencia;
}

/** La pantalla de inicio de quien mira (`/dashboard` fuera del provider). */
export function usePantallaDeInicio(): string {
  return useContext(ExperienciaCtx).inicio;
}
