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
  leer: typeof getInstagramIntegrationStatusAction = getInstagramIntegrationStatusAction
): Promise<boolean | null> {
  const lectura = await leerConMotivo(leer, "[MarketingDataProvider] estado de Instagram");
  return lectura.ok ? lectura.data.status === "active" : null;
}

const MarketingDataContext = createContext<MarketingDataContextValue | null>(null);

export function MarketingDataProvider({ children }: { children: ReactNode }) {
  const [instagramConnected, setInstagramConnected] = useState<boolean | null>(false);

  useEffect(() => {
    void leerInstagramConectado().then(setInstagramConnected);
  }, []);

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
