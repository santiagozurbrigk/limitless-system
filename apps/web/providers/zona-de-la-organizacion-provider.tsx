"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { fechaDeHoyEnZona } from "@/lib/fechas/calendario";

/**
 * ⭐ La zona horaria de la organización, en el cliente (SCRUM-493).
 *
 * Regla de la app: el "hoy" y las fechas calendario de un dato de la
 * organización son los de **su** zona (`organizations.timezone`), no los del
 * navegador de quien mira. Un miembro en Madrid y otro en Buenos Aires ven el
 * mismo "hoy", la misma tarea vencida y el mismo valor por defecto, y coinciden
 * con lo que calcula el servidor (revisión semanal, estado del lead).
 *
 * La zona la lee una sola vez el layout de la plataforma
 * (`zonaDeLaOrganizacionActiva`) y llega acá por props: ningún componente la
 * consulta por su cuenta. `null` = la organización no eligió zona: se usa la de
 * por defecto (`ZONA_HORARIA_POR_DEFECTO`).
 */
const ZonaCtx = createContext<string | null>(null);

export function ZonaDeLaOrganizacionProvider({
  zona,
  children,
}: {
  zona: string | null;
  children?: React.ReactNode;
}) {
  return <ZonaCtx.Provider value={zona}>{children}</ZonaCtx.Provider>;
}

/** La zona de la organización activa (`null` = la de por defecto). */
export function useZonaDeLaOrganizacion(): string | null {
  return useContext(ZonaCtx);
}

/** Cada cuánto se vuelve a mirar si cambió el día de la organización. */
const CADA_UN_MINUTO = 60 * 1000;

/** Avisa periódicamente; React re-renderiza sólo si el día cambió. */
export function suscribirseAlReloj(avisar: () => void): () => void {
  const timer = setInterval(avisar, CADA_UN_MINUTO);
  return () => clearInterval(timer);
}

/**
 * El día de hoy (`YYYY-MM-DD`) en la zona de la organización, para valores por
 * defecto, topes (`max`) y "vencida".
 *
 * Devuelve `null` en el render del servidor y en la hidratación: el HTML del
 * servidor se arma en otro instante que la hidratación, y justo a la
 * medianoche de la org podrían discrepar; React no corrige un atributo
 * distinto al hidratar. Con `null`, quien llama no marca nada hasta tener el
 * día, y React vuelve a renderizar enseguida. Una pantalla abierta de un día
 * para el otro se actualiza sola (se mira una vez por minuto).
 */
export function useHoyDeLaOrganizacion(): string | null {
  const zona = useZonaDeLaOrganizacion();
  const hoy = useCallback(() => fechaDeHoyEnZona(zona), [zona]);
  return useSyncExternalStore(suscribirseAlReloj, hoy, () => null);
}
