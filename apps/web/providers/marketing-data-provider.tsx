"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getInstagramIntegrationStatusAction } from "@/app/marketing/actions";
import { leerConMotivo } from "@/lib/client/correr-accion";
import { usePermissions } from "@/providers/permissions-provider";
import { leerDelMarco } from "@/lib/auth/lecturas-del-marco";
import type { PermisosDeModulo } from "@/lib/auth/regla-de-modulo";

type MarketingDataContextValue = {
  /** `null`: el estado no se pudo leer (no es lo mismo que no conectado). */
  instagramConnected: boolean | null;
  setInstagramConnected: (connected: boolean) => void;
};

/**
 * Lo que vale `instagramConnected` después de leer el estado (SCRUM-519): si la
 * lectura falló, `null` y no `false`, para no confundir "no se pudo leer" con
 * "no conectado".
 */
export async function leerInstagramConectado(
  leer: typeof getInstagramIntegrationStatusAction
): Promise<boolean | null> {
  const lectura = await leerConMotivo(leer, "[MarketingDataProvider] estado de Instagram");
  return lectura.ok ? lectura.data.status === "active" : null;
}

/**
 * El estado de Instagram lo usan Marketing e Integraciones: sin ninguno de los
 * dos no se pide (SCRUM-540) y queda en `false`, como antes de leerlo.
 */
export async function leerInstagramDelMarco(permisos: PermisosDeModulo): Promise<boolean | null> {
  return leerDelMarco<boolean | null>(
    permisos,
    "instagram",
    () => leerInstagramConectado(getInstagramIntegrationStatusAction),
    false
  );
}

const MarketingDataContext = createContext<MarketingDataContextValue | null>(null);

export function MarketingDataProvider({ children }: { children: ReactNode }) {
  const [instagramConnected, setInstagramConnected] = useState<boolean | null>(false);
  const permisos = usePermissions();

  useEffect(() => {
    void leerInstagramDelMarco(permisos).then(setInstagramConnected);
  }, [permisos]);

  const setConnected = useCallback((connected: boolean) => {
    setInstagramConnected(connected);
  }, []);

  const value = useMemo(
    () => ({
      instagramConnected,
      setInstagramConnected: setConnected,
    }),
    [instagramConnected, setConnected]
  );

  return (
    <MarketingDataContext.Provider value={value}>
      {children}
    </MarketingDataContext.Provider>
  );
}

export function useMarketingData(): MarketingDataContextValue {
  const ctx = useContext(MarketingDataContext);
  if (!ctx) {
    throw new Error("useMarketingData debe usarse dentro de MarketingDataProvider");
  }
  return ctx;
}
